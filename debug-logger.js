// ── CS·IDE Debug Logger ───────────────────────────────────────────────────
// Paste this entire script into your browser DevTools console while CS·IDE
// is open, or add <script src="debug-logger.js"></script> before </body>.
// A floating panel will appear in the bottom-right corner showing a live
// log of key events, caret positions, and Highlight.apply calls.
// Click "Clear" to reset. Click "✕" to remove the logger entirely.
// ─────────────────────────────────────────────────────────────────────────

(function () {
  if (document.getElementById('dbg-panel')) {
    document.getElementById('dbg-panel').remove();
    return; // toggle off if already present
  }

  // ── Build the floating panel ─────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = 'dbg-panel';
  Object.assign(panel.style, {
    position:   'fixed',
    bottom:     '12px',
    right:      '12px',
    width:      '420px',
    maxHeight:  '340px',
    background: '#0d0d14',
    border:     '1px solid #7c6af7',
    borderRadius: '8px',
    fontFamily: 'Fira Code, monospace',
    fontSize:   '11px',
    color:      '#d4d4e8',
    zIndex:     '99999',
    display:    'flex',
    flexDirection: 'column',
    boxShadow:  '0 8px 32px rgba(0,0,0,0.6)',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display:       'flex',
    alignItems:    'center',
    padding:       '6px 10px',
    borderBottom:  '1px solid #2a2a38',
    gap:           '8px',
    flexShrink:    '0',
  });
  header.innerHTML = `
    <span style="color:#7c6af7;font-weight:700;flex:1">🔍 CS·IDE Debug Logger</span>
    <label style="font-size:10px;color:#5a5a7a;display:flex;align-items:center;gap:4px">
      <input type="checkbox" id="dbg-pause"> Pause
    </label>
    <button id="dbg-clear" style="background:#1e1e28;border:1px solid #2a2a38;border-radius:4px;color:#d4d4e8;cursor:pointer;padding:2px 8px;font-size:10px">Clear</button>
    <button id="dbg-close" style="background:none;border:none;color:#5a5a7a;cursor:pointer;font-size:16px;padding:0 4px">✕</button>`;
  panel.appendChild(header);

  const log = document.createElement('div');
  Object.assign(log.style, {
    overflowY:  'auto',
    flex:       '1',
    padding:    '6px 8px',
    lineHeight: '1.6',
  });
  panel.appendChild(log);

  document.body.appendChild(panel);

  document.getElementById('dbg-close').onclick  = () => panel.remove();
  document.getElementById('dbg-clear').onclick  = () => { log.innerHTML = ''; };

  let entryCount = 0;

  function entry(color, tag, msg) {
    if (document.getElementById('dbg-pause')?.checked) return;
    entryCount++;
    const row = document.createElement('div');
    row.style.borderBottom = '1px solid #16161d';
    row.style.padding = '2px 0';
    row.innerHTML =
      `<span style="color:#5a5a7a;user-select:none">${String(entryCount).padStart(4,' ')} </span>` +
      `<span style="color:${color};min-width:90px;display:inline-block">${tag}</span> ` +
      `<span style="color:#d4d4e8">${msg}</span>`;
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
  }

  function caretStr(el) {
    try {
      const c = Caret.getOffset(el);
      return `caret {start:${c.start}, end:${c.end}}`;
    } catch(e) { return 'caret [err]'; }
  }

  // ── Intercept keydown on the editor ─────────────────────────────────
  const editorEl = document.getElementById('editor');

  editorEl.addEventListener('keydown', function (e) {
    const c = caretStr(editorEl);
    const plain = Editor.getPlainText(editorEl);
    const lines = plain.split('\n');
    const offset = (() => { try { return Caret.getOffset(editorEl).start; } catch(x) { return '?'; } })();
    let lineIdx = 0, acc = 0;
    for (let i = 0; i < lines.length; i++) {
      if (acc + lines[i].length >= offset) { lineIdx = i; break; }
      acc += lines[i].length + 1;
    }
    const curLine = typeof offset === 'number' ? `"${lines[lineIdx]}"` : '?';

    const mod = [e.ctrlKey&&'Ctrl', e.metaKey&&'Cmd', e.shiftKey&&'Shift', e.altKey&&'Alt']
      .filter(Boolean).join('+');
    const keyLabel = mod ? `${mod}+${e.key}` : e.key;

    entry('#f7c46a', '[keydown]', `key="${keyLabel}"  line=${lineIdx+1}  ${c}  curLine=${curLine}`);
  }, true); // capture phase so we see it before Editor's handler

  editorEl.addEventListener('keyup', function (e) {
    if (e.key === 'Enter') {
      const c = caretStr(editorEl);
      entry('#7af7b8', '[keyup]', `Enter released — ${c}`);
    }
  }, true);

  // ── Intercept Highlight.apply ────────────────────────────────────────
  const _origApply = Highlight.apply.bind(Highlight);
  Highlight.apply = function (el) {
    const before = caretStr(el);
    entry('#6ab8f7', '[Highlight]', `apply() called — ${before}`);
    _origApply(el);
    const after = caretStr(el);
    entry('#6ab8f7', '[Highlight]', `apply() done  — ${after}`);
  };

  // ── Intercept Caret.setOffset ────────────────────────────────────────
  const _origSet = Caret.setOffset.bind(Caret);
  Caret.setOffset = function (el, start, end) {
    entry('#f76a8a', '[Caret.set]', `setOffset(${start}, ${end})`);
    _origSet(el, start, end);
    const after = caretStr(el);
    entry('#f76a8a', '[Caret.set]', `→ result: ${after}`);
  };

  // ── Intercept Caret.getOffset ────────────────────────────────────────
  const _origGet = Caret.getOffset.bind(Caret);
  Caret.getOffset = function (el) {
    const result = _origGet(el);
    // Only log when called from Enter handler to reduce noise — filter by stack
    // We log all calls but mute them unless they follow a keydown we care about
    return result;
  };

  entry('#7c6af7', '[logger]', 'CS·IDE debug logger active. Press Enter in the editor to trace the issue.');
})();
