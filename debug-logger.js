// ── CS·IDE Deep Debug Logger v2 ──────────────────────────────────────────
// Paste into DevTools console. Toggle off by running again.
// Shows: stack traces for every apply() call, DOM content at each step,
// which files are actually loaded, and re-entrancy guard status.
// ─────────────────────────────────────────────────────────────────────────

(function () {
  if (document.getElementById('dbg2-panel')) {
    document.getElementById('dbg2-panel').remove();
    console.log('[DBG] Logger removed.');
    return;
  }

  // ── Panel ─────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'dbg2-panel';
  Object.assign(panel.style, {
    position: 'fixed', bottom: '12px', right: '12px',
    width: '560px', maxHeight: '440px',
    background: '#0d0d14', border: '1px solid #7c6af7',
    borderRadius: '8px', fontFamily: 'Fira Code, monospace',
    fontSize: '10px', color: '#d4d4e8', zIndex: '99999',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
  });

  panel.innerHTML = `
    <div style="display:flex;align-items:center;padding:6px 10px;border-bottom:1px solid #2a2a38;gap:8px;flex-shrink:0">
      <span style="color:#7c6af7;font-weight:700;flex:1">🔬 CS·IDE Deep Logger v3</span>
      <label style="font-size:9px;color:#5a5a7a;display:flex;align-items:center;gap:3px">
        <input type="checkbox" id="dbg2-stacks" checked> Stacks
      </label>
      <label style="font-size:9px;color:#5a5a7a;display:flex;align-items:center;gap:3px">
        <input type="checkbox" id="dbg2-content" checked> Content
      </label>
      <label style="font-size:9px;color:#5a5a7a;display:flex;align-items:center;gap:3px">
        <input type="checkbox" id="dbg2-pause"> Pause
      </label>
      <button id="dbg2-clear" style="background:#1e1e28;border:1px solid #2a2a38;border-radius:3px;color:#d4d4e8;cursor:pointer;padding:1px 7px;font-size:9px">Clear</button>
      <button id="dbg2-close" style="background:none;border:none;color:#5a5a7a;cursor:pointer;font-size:15px;padding:0 4px">✕</button>
    </div>
    <div id="dbg2-log" style="overflow-y:auto;flex:1;padding:4px 6px;line-height:1.55"></div>`;
  document.body.appendChild(panel);

  document.getElementById('dbg2-close').onclick = () => panel.remove();
  document.getElementById('dbg2-clear').onclick = () => { log.innerHTML = ''; n = 0; };
  const log = document.getElementById('dbg2-log');

  let n = 0;
  let applyDepth = 0;

  function write(color, tag, msg, detail) {
    if (document.getElementById('dbg2-pause')?.checked) return;
    n++;
    const row = document.createElement('div');
    row.style.cssText = 'border-bottom:1px solid #16161d;padding:2px 0';
    const num  = `<span style="color:#2a2a38;user-select:none">${String(n).padStart(5,' ')} </span>`;
    const t    = `<span style="color:${color};display:inline-block;min-width:110px">${tag}</span>`;
    const m    = `<span style="color:#d4d4e8">${msg}</span>`;
    const d    = detail ? `<div style="color:#5a5a7a;padding-left:116px;white-space:pre-wrap;font-size:9px">${detail}</div>` : '';
    row.innerHTML = num + t + m + d;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function getCaret(el) {
    try { const c = Caret.getOffset(el); return `{start:${c.start}, end:${c.end}}`; }
    catch(e) { return '[err]'; }
  }

  function getContent(el) {
    if (!document.getElementById('dbg2-content')?.checked) return null;
    try {
      const t = Editor.getPlainText(el);
      const preview = t.replace(/\n/g, '↵').slice(0, 80);
      return `content(${t.length}): "${preview}"`;
    } catch(e) { return null; }
  }

  function getStack() {
    if (!document.getElementById('dbg2-stacks')?.checked) return null;
    const lines = new Error().stack.split('\n').slice(3, 8);
    return lines.map(l => l.trim().replace(/^at /, '')).join('\n');
  }

  function lineInfo(el, offset) {
    try {
      const plain = Editor.getPlainText(el);
      const lines = plain.split('\n');
      let acc = 0;
      for (let i = 0; i < lines.length; i++) {
        if (acc + lines[i].length >= offset) {
          return `line=${i+1} col=${offset-acc+1} lineText="${lines[i]}"`;
        }
        acc += lines[i].length + 1;
      }
    } catch(e) {}
    return '';
  }

  // ── Check which version of files are loaded ───────────────────────────
  (function checkVersions() {
    // Probe for re-entrancy guard existence
    const src = Highlight.apply.toString();
    const hasGuard = src.includes('_applying');
    write('#7c6af7', '[version]', `Re-entrancy guard in Highlight.apply: ${hasGuard ? '✅ YES' : '❌ NO — old file loaded!'}`);

    // Probe caret fix
    const caretSrc = Caret.setOffset.toString();
    const hasBRFix = caretSrc.includes('indexOf');
    write('#7c6af7', '[version]', `BR boundary fix in Caret.setOffset: ${hasBRFix ? '✅ YES' : '❌ NO — old file loaded!'}`);
  })();

  // ── Intercept Highlight.apply ─────────────────────────────────────────
  const _origApply = Highlight.apply.bind(Highlight);
  Highlight.apply = function(el) {
    applyDepth++;
    const depth  = applyDepth;
    const before = getCaret(el);
    const content = getContent(el);
    const stack  = getStack();
    write('#6ab8f7', `[apply#${depth} IN]`,
      `caret=${before}`,
      (content ? content + '\n' : '') + (stack || ''));
    _origApply(el);
    const after = getCaret(el);
    write('#6ab8f7', `[apply#${depth} OUT]`, `caret=${after}`);
    applyDepth--;
  };

  // ── Intercept Caret.setOffset ─────────────────────────────────────────
  const _origSet = Caret.setOffset.bind(Caret);
  Caret.setOffset = function(el, start, end) {
    const stack = getStack();
    write('#f76a8a', '[Caret.set]', `setOffset(${start}, ${end})  ${lineInfo(el, start)}`,
      stack || '');
    _origSet(el, start, end);
    const after = getCaret(el);
    const ok = after === `{start:${start}, end:${end}}`;
    write('#f76a8a', '[Caret.set]',
      `→ ${after}  ${ok ? '✅' : `❌ WANTED ${start} GOT ${after}`}`);
  };

  // ── Intercept Caret.getOffset ─────────────────────────────────────────
  // Only log when called from outside apply (to avoid spam)
  const _origGet = Caret.getOffset.bind(Caret);
  let getCallCount = 0;
  Caret.getOffset = function(el) {
    getCallCount++;
    return _origGet(el);
  };

  // ── Editor keydown (capture phase — before Editor's handler) ─────────
  const editorEl = document.getElementById('editor');

  editorEl.addEventListener('keydown', function(e) {
    if (document.getElementById('dbg2-pause')?.checked) return;
    const caret = getCaret(editorEl);
    const plain = (() => { try { return Editor.getPlainText(editorEl); } catch(_) { return ''; } })();
    const lines = plain.split('\n');
    const offset = (() => { try { return Caret.getOffset(editorEl).start; } catch(_) { return 0; } })();
    let lineIdx = 0, acc = 0;
    for (let i = 0; i < lines.length; i++) {
      if (acc + lines[i].length >= offset) { lineIdx = i; break; }
      acc += lines[i].length + 1;
    }
    const mod = [e.ctrlKey&&'Ctrl',e.metaKey&&'Cmd',e.shiftKey&&'Shift',e.altKey&&'Alt'].filter(Boolean).join('+');
    const key = mod ? `${mod}+${e.key}` : e.key;
    write('#f7c46a', '[keydown]',
      `"${key}"  line=${lineIdx+1}  caret=${caret}`,
      `lineText="${lines[lineIdx]}"  totalLines=${lines.length}  docLen=${plain.length}`);
  }, true);

  editorEl.addEventListener('input', function(e) {
    if (document.getElementById('dbg2-pause')?.checked) return;
    const caret = getCaret(editorEl);
    const stack = getStack();
    write('#c47af7', '[input]',
      `inputType="${e.inputType||'?'}"  caret=${caret}`,
      stack || '');
  }, true);

  editorEl.addEventListener('keyup', function(e) {
    if (e.key !== 'Enter' && e.key !== 'Tab') return;
    if (document.getElementById('dbg2-pause')?.checked) return;
    write('#7af7b8', '[keyup]', `"${e.key}"  caret=${getCaret(editorEl)}`);
  }, true);

  write('#7c6af7', '[logger]', 'Deep logger v3 active. Now press Enter in the editor.');
})();
