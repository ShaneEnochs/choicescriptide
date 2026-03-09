// CS·IDE Debug Logger v3 — DOM-aware edition
// Shows: exact DOM structure before/after apply, raw browser selection node,
//        caret node description, plain text, key events.
//
// Install: add <script src="debug-logger-v3.js"></script> as LAST script in index.html
// Shortcut: Alt+D = manual DOM snapshot at any time

(function () {
  'use strict';

  const MAX_LOG = 600;
  let entries = [], paused = false;
  let showDOM = true, showCaret = true, showText = true;
  let counter = 0;

  // ── Panel ──────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.style.cssText = `
    position:fixed;bottom:0;right:0;width:740px;height:440px;
    background:#0d0d14;border:1px solid #333;border-radius:8px 0 0 0;
    font-family:'Fira Code',monospace;font-size:10px;color:#ccc;
    z-index:9999;display:flex;flex-direction:column;
    box-shadow:-4px -4px 24px rgba(0,0,0,.7);
  `;

  const hdr = document.createElement('div');
  hdr.style.cssText = `display:flex;align-items:center;gap:6px;padding:5px 10px;
    background:#16161d;border-bottom:1px solid #2a2a38;flex-shrink:0;flex-wrap:wrap;`;
  hdr.innerHTML = `
    <span style="color:#7c6af7;font-weight:700;letter-spacing:.06em;margin-right:4px">CS·IDE Logger v3</span>
    <label style="cursor:pointer;display:flex;align-items:center;gap:2px"><input type="checkbox" id="lg-dom" checked>DOM</label>
    <label style="cursor:pointer;display:flex;align-items:center;gap:2px"><input type="checkbox" id="lg-caret" checked>Caret</label>
    <label style="cursor:pointer;display:flex;align-items:center;gap:2px"><input type="checkbox" id="lg-text" checked>Text</label>
    <button id="lg-snap"  style="padding:1px 7px;cursor:pointer;background:#1e1e28;border:1px solid #444;color:#ccc;border-radius:3px;font-size:10px">📸 Snap</button>
    <button id="lg-pause" style="padding:1px 7px;cursor:pointer;background:#1e1e28;border:1px solid #444;color:#ccc;border-radius:3px;font-size:10px">⏸</button>
    <button id="lg-clear" style="padding:1px 7px;cursor:pointer;background:#1e1e28;border:1px solid #444;color:#ccc;border-radius:3px;font-size:10px">Clear</button>
    <button id="lg-copy"  style="padding:1px 7px;cursor:pointer;background:#1e1e28;border:1px solid #444;color:#ccc;border-radius:3px;font-size:10px">Copy</button>
    <button id="lg-close" style="padding:1px 7px;cursor:pointer;background:#1e1e28;border:1px solid #444;color:#ccc;border-radius:3px;font-size:10px;margin-left:auto">✕</button>
  `;

  const body = document.createElement('div');
  body.style.cssText = `flex:1;overflow-y:auto;padding:5px 10px;line-height:1.65;`;
  panel.appendChild(hdr);
  panel.appendChild(body);
  document.body.appendChild(panel);

  document.getElementById('lg-dom').addEventListener('change',   e => showDOM   = e.target.checked);
  document.getElementById('lg-caret').addEventListener('change', e => showCaret = e.target.checked);
  document.getElementById('lg-text').addEventListener('change',  e => showText  = e.target.checked);
  document.getElementById('lg-pause').addEventListener('click', () => {
    paused = !paused;
    document.getElementById('lg-pause').textContent = paused ? '▶' : '⏸';
  });
  document.getElementById('lg-clear').addEventListener('click', () => { entries = []; body.innerHTML = ''; });
  document.getElementById('lg-close').addEventListener('click', () => { panel.style.display = 'none'; });
  document.getElementById('lg-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(entries.map(e => e.raw).join('\n')).catch(() => {});
  });
  document.getElementById('lg-snap').addEventListener('click', snapDOM);

  // ── Log helper ─────────────────────────────────────────────────────────
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function log(html, raw, color) {
    if (paused) return;
    counter++;
    const n = counter;
    entries.push({ raw: `${n}\t${raw}` });
    if (entries.length > MAX_LOG) { entries.shift(); body.firstChild && body.removeChild(body.firstChild); }
    const div = document.createElement('div');
    div.style.cssText = `border-bottom:1px solid #131320;padding:2px 0;color:${color||'#ccc'};`;
    div.innerHTML = `<span style="color:#333;user-select:none">${n} </span>${html}`;
    body.appendChild(div);
    body.scrollTop = body.scrollHeight;
  }

  // ── DOM walker helpers ─────────────────────────────────────────────────
  function getPlainSafe(el) {
    try { return Editor.getPlainText(el); } catch(e) { return el.textContent || ''; }
  }

  // Describe a single childNode for DOM display
  function nodeDesc(n, idx) {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = n.textContent;
      const disp = JSON.stringify(t.length > 24 ? t.slice(0,24)+'…' : t);
      return `<span style="color:#7af7b8">T[${idx}]</span><span style="color:#666">${esc(disp)}</span>`;
    }
    if (n.nodeName === 'BR') {
      return `<span style="color:#f7c46a;font-weight:700">BR[${idx}]</span>`;
    }
    if (n.nodeName === 'SPAN') {
      const cls = (n.className||'').replace('hl-','');
      const txt = n.textContent;
      const disp = JSON.stringify(txt.length > 16 ? txt.slice(0,16)+'…' : txt);
      return `<span style="color:#6ab8f7">S[${idx}]</span><span style="color:#555">.${esc(cls)}</span><span style="color:#666">${esc(disp)}</span>`;
    }
    return `<span style="color:#f76a8a">${esc(n.nodeName)}[${idx}]</span>`;
  }

  // Full DOM description of editor children
  function domDesc(editorEl) {
    const nodes = editorEl.childNodes;
    const parts = [];
    for (let i = 0; i < nodes.length; i++) parts.push(nodeDesc(nodes[i], i));
    return parts.join(' ');
  }

  // Describe where the browser has placed the cursor (raw, before Caret.js math)
  function rawCaretDesc(editorEl) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 'no-selection';
    const r = sel.getRangeAt(0);
    const sc = r.startContainer, so = r.startOffset;

    if (sc === editorEl) {
      // cursor is between children of #editor
      const child = editorEl.childNodes[so];
      const childStr = child
        ? (child.nodeName === 'BR' ? 'BR' : child.nodeName === '#text' ? `TEXT(${esc(JSON.stringify(child.textContent.slice(0,12)))})` : child.nodeName)
        : 'END';
      return `#editor child[${so}]→${childStr}`;
    }
    if (sc.nodeType === Node.TEXT_NODE) {
      const t = sc.textContent;
      // Find which child index this text node is
      let idx = -1;
      for (let i = 0; i < editorEl.childNodes.length; i++) {
        if (editorEl.childNodes[i] === sc || editorEl.childNodes[i].contains && editorEl.childNodes[i].contains(sc)) { idx = i; break; }
      }
      return `TEXT[${idx}] ${esc(JSON.stringify(t.slice(0,16)))} @${so}/${t.length}`;
    }
    if (sc.nodeName === 'BR') {
      let idx = -1;
      for (let i = 0; i < editorEl.childNodes.length; i++) {
        if (editorEl.childNodes[i] === sc) { idx = i; break; }
      }
      return `BR[${idx}] offset=${so}`;
    }
    if (sc.nodeName === 'SPAN') {
      let idx = -1;
      for (let i = 0; i < editorEl.childNodes.length; i++) {
        if (editorEl.childNodes[i] === sc) { idx = i; break; }
      }
      return `SPAN[${idx}].${esc(sc.className||'')} child[${so}]`;
    }
    return `${esc(sc.nodeName)} @${so}`;
  }

  // ── DOM Snapshot (manual or auto) ─────────────────────────────────────
  function snapDOM() {
    const editorEl = document.getElementById('editor');
    if (!editorEl) return;
    const plain = getPlainSafe(editorEl);
    const lines = plain.split('\n');
    const nodeCount = editorEl.childNodes.length;
    const rawCaret = rawCaretDesc(editorEl);

    // Count BRs in DOM
    let brCount = 0;
    for (const n of editorEl.childNodes) if (n.nodeName === 'BR') brCount++;

    const raw = `[DOM SNAP] nodes=${nodeCount} BRs=${brCount} lines(plain)=${lines.length} rawCaret=${rawCaret}`;
    log(
      `<span style="color:#c47af7;font-weight:700">[DOM SNAP]</span> ` +
      `<span style="color:#555">nodes=</span><span style="color:#7c6af7">${nodeCount}</span> ` +
      `<span style="color:#555">BRs=</span><span style="color:#f7c46a">${brCount}</span> ` +
      `<span style="color:#555">plain-lines=</span><span style="color:#7c6af7">${lines.length}</span> ` +
      `<span style="color:#555">rawCaret=</span><span style="color:#aaa">${rawCaret}</span><br>` +
      `<span style="color:#333">&nbsp;&nbsp;DOM: </span>${domDesc(editorEl)}<br>` +
      `<span style="color:#333">&nbsp;&nbsp;plain: </span><span style="color:#aaa">${esc(JSON.stringify(plain.slice(0,120)))}</span>`,
      raw, '#c47af7'
    );
  }

  // ── Intercept Caret.getOffset ──────────────────────────────────────────
  const _origGet = Caret.getOffset.bind(Caret);
  const _origSet = Caret.setOffset.bind(Caret);

  Caret.getOffset = function(el) {
    const raw = rawCaretDesc(el);
    const result = _origGet(el);
    if (showCaret && !paused) {
      const rawLog = `[Caret.get] rawNode=${raw} → {${result.start},${result.end}}`;
      log(
        `<span style="color:#888">[Caret.get]</span> ` +
        `<span style="color:#555">raw=</span><span style="color:#666">${raw}</span> ` +
        `→ <span style="color:#7c6af7">{${result.start},${result.end}}</span>`,
        rawLog, '#666'
      );
    }
    return result;
  };

  Caret.setOffset = function(el, start, end) {
    _origSet(el, start, end);
    if (showCaret && !paused) {
      const after = _origGet(el);
      const nodeAfter = rawCaretDesc(el);
      const ok = after.start === start && after.end === end;
      const badge = ok
        ? `<span style="color:#7af7b8">✅</span>`
        : `<span style="color:#f76a8a">❌ got {${after.start},${after.end}}</span>`;
      const rawLog = `[Caret.set] (${start},${end}) → {${after.start},${after.end}} ${ok?'OK':'MISMATCH'} node=${nodeAfter}`;
      log(
        `<span style="color:#aaa">[Caret.set]</span> ` +
        `(<span style="color:#7c6af7">${start},${end}</span>) → {${after.start},${after.end}} ${badge} ` +
        `<span style="color:#555">node=</span><span style="color:#888">${nodeAfter}</span>`,
        rawLog, ok ? '#888' : '#f76a8a'
      );
    }
  };

  // ── Intercept Highlight.apply ──────────────────────────────────────────
  const _origApply = Highlight.apply.bind(Highlight);
  let applyDepth = 0;

  Highlight.apply = function(editorEl) {
    applyDepth++;
    const depth = applyDepth;

    const rawBefore = rawCaretDesc(editorEl);
    const caretBefore = _origGet(editorEl);
    const plainBefore = getPlainSafe(editorEl);
    const domBefore = showDOM ? domDesc(editorEl) : '';
    const stack = new Error().stack.split('\n').slice(2,5)
      .map(l => l.trim().replace(/https?:\/\/[^/]+\/[^/]+\//g,''))
      .join(' ← ');

    if (!paused) {
      log(
        `<span style="color:#f7c46a;font-weight:700">[apply#${depth} IN]</span> ` +
        `caret=<span style="color:#7c6af7">{${caretBefore.start},${caretBefore.end}}</span> ` +
        `<span style="color:#555">rawNode=</span><span style="color:#777">${rawBefore}</span>` +
        (showText ? `<br>&nbsp;&nbsp;<span style="color:#555">plain=</span><span style="color:#666">${esc(JSON.stringify(plainBefore.slice(0,100)))}</span>` : '') +
        (showDOM  ? `<br>&nbsp;&nbsp;<span style="color:#555">before=</span>${domBefore}` : '') +
        `<br>&nbsp;&nbsp;<span style="color:#333">${esc(stack)}</span>`,
        `[apply#${depth} IN] caret={${caretBefore.start},${caretBefore.end}} rawNode=${rawBefore}`,
        '#f7c46a'
      );
    }

    _origApply(editorEl);

    const caretAfter = _origGet(editorEl);
    const domAfter = showDOM ? domDesc(editorEl) : '';
    const rawAfter = rawCaretDesc(editorEl);
    const nodeCount = editorEl.childNodes.length;
    let brCount = 0;
    for (const n of editorEl.childNodes) if (n.nodeName === 'BR') brCount++;

    if (!paused) {
      log(
        `<span style="color:#7af7b8;font-weight:700">[apply#${depth} OUT]</span> ` +
        `caret=<span style="color:#7c6af7">{${caretAfter.start},${caretAfter.end}}</span> ` +
        `<span style="color:#555">nodes=</span>${nodeCount} ` +
        `<span style="color:#555">BRs=</span><span style="color:#f7c46a">${brCount}</span> ` +
        `<span style="color:#555">rawNode=</span><span style="color:#777">${rawAfter}</span>` +
        (showDOM ? `<br>&nbsp;&nbsp;<span style="color:#555">after=</span>${domAfter}` : ''),
        `[apply#${depth} OUT] caret={${caretAfter.start},${caretAfter.end}} nodes=${nodeCount} BRs=${brCount}`,
        '#7af7b8'
      );
    }
    applyDepth--;
  };

  // ── Intercept editor key events ────────────────────────────────────────
  const editorEl = document.getElementById('editor');

  editorEl.addEventListener('keydown', function(e) {
    if (paused) return;
    const plain = getPlainSafe(editorEl);
    const lines = plain.split('\n');
    const caret = _origGet(editorEl);
    const rawNode = rawCaretDesc(editorEl);
    let cc = 0, lineIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (cc + lines[i].length >= caret.start) { lineIdx = i; break; }
      cc += lines[i].length + 1;
    }
    const lineText = lines[lineIdx] || '';
    log(
      `<span style="color:#6ab8f7">[keydown]</span> ` +
      `<span style="color:#f76a8a">"${esc(e.key)}"</span> ` +
      `line=${lineIdx+1} caret=<span style="color:#7c6af7">{${caret.start},${caret.end}}</span> ` +
      `<span style="color:#555">lineText=</span><span style="color:#aaa">${esc(JSON.stringify(lineText))}</span> ` +
      `<span style="color:#555">lines=</span>${lines.length} docLen=${plain.length} ` +
      `<span style="color:#555">rawNode=</span><span style="color:#777">${rawNode}</span>`,
      `[keydown] "${e.key}" line=${lineIdx+1} caret={${caret.start},${caret.end}} rawNode=${rawNode}`,
      '#6ab8f7'
    );
  }, true);

  editorEl.addEventListener('input', function(e) {
    if (paused) return;
    const caret = _origGet(editorEl);
    const plain = getPlainSafe(editorEl);
    const rawNode = rawCaretDesc(editorEl);
    log(
      `<span style="color:#888">[input]</span> ` +
      `<span style="color:#555">${esc(e.inputType||'')}</span> ` +
      `caret=<span style="color:#7c6af7">{${caret.start},${caret.end}}</span> ` +
      `docLen=${plain.length} <span style="color:#555">rawNode=</span><span style="color:#777">${rawNode}</span>`,
      `[input] ${e.inputType} caret={${caret.start},${caret.end}} rawNode=${rawNode}`,
      '#888'
    );
  }, true);

  // ── Alt+D = manual DOM snap ────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key === 'd') { e.preventDefault(); snapDOM(); }
  });

  // ── Boot ──────────────────────────────────────────────────────────────
  setTimeout(() => {
    log('<span style="color:#7c6af7;font-weight:700">Logger v3 ready.</span> <span style="color:#555">Alt+D = DOM snap at any time.</span>', 'Logger v3 ready', '#7c6af7');
    snapDOM();
  }, 600);

})();
