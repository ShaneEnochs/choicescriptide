// highlight.js — syntax highlighting for ChoiceScript
// Depends on: Linter, State, Caret, Editor, Sidebar, WordCount, FileManager, LineNumbers

const Highlight = (() => {

  function esc(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Returns HTML for one line with syntax spans + lint wrapper
  function line(raw, lineIndex) {
    const t    = raw.trimStart();
    const lint = State.lastLint;

    let wrapClass = '';
    if      (lint.errorLines.has(lineIndex))  wrapClass = 'hl-err-line';
    else if (lint.warnLines.has(lineIndex))   wrapClass = 'hl-warn-line';
    else if (lint.orphanLines.has(lineIndex)) wrapClass = 'hl-orphan';

    let inner;
    if      (/^\*comment\b/.test(t)) inner = `<span class="hl-comment">${esc(raw)}</span>`;
    else if (/^\*label\b/.test(t))   inner = `<span class="hl-label">${esc(raw)}</span>`;
    else if (/^\*[\w]/.test(t)) {
      inner = esc(raw)
        .replace(/(\*[\w]+)/g, '<span class="hl-cmd">$1</span>')
        .replace(/(\$\{[\w]+\})/g, '<span class="hl-var">$1</span>');
    } else if (/^#/.test(t)) {
      inner = esc(raw)
        .replace(/^(\s*)(#)/, '$1<span class="hl-option">$2</span>')
        .replace(/(\$\{[\w]+\})/g, '<span class="hl-var">$1</span>');
    } else {
      inner = esc(raw).replace(/(\$\{[\w]+\})/g, '<span class="hl-var">$1</span>');
    }

    return wrapClass ? `<span class="${wrapClass}">${inner}</span>` : inner;
  }

  // Full re-render of the editor
  let _applying = false;
  function apply(editorEl) {
    if (State.isComposing) return;
    // Re-entrancy guard: setting textContent/innerHTML inside apply() triggers
    // the 'input' event which would call apply() again before we've finished.
    // The outer call owns the caret snapshot; ignore the inner call entirely.
    if (_applying) return;
    _applying = true;

    const caret = Caret.getOffset(editorEl);
    const plain = Editor.getPlainText(editorEl);
    const lines = plain.split('\n');

    // Run linter (includes cross-scene)
    const sceneNames   = CrossScene.getSceneNames();
    const baseLint     = Linter.run(lines);
    const crossLint    = CrossScene.lintCrossScene(lines, sceneNames);

    // Merge cross-scene issues + error lines into lint result
    baseLint.issues.push(...crossLint.issues);
    crossLint.errorLines.forEach(l => baseLint.warnLines.add(l));
    baseLint.issues.sort((a, b) => a.line - b.line);

    State.lastLint = baseLint;

    // Get folded hidden lines
    const hiddenLines = (typeof Folding !== 'undefined')
      ? Folding.getHiddenLines(lines)
      : new Set();

    // Build editor HTML, inserting fold-placeholder for collapsed blocks
    const htmlParts = [];
    let skipUntil = -1;
    lines.forEach((l, i) => {
      if (hiddenLines.has(i)) return; // hidden inside a fold
      htmlParts.push(line(l, i));
    });
    editorEl.innerHTML = htmlParts.join('<br>');
    // Only restore caret if the editor currently has focus —
    // otherwise setOffset steals focus away from e.g. the filename input.
    if (document.activeElement === editorEl) {
      Caret.setOffset(editorEl, caret.start, caret.end);
    }

    // Update fold gutter (replaces LineNumbers.update)
    if (typeof Folding !== 'undefined') {
      Folding.updateGutter(lines);
    } else {
      LineNumbers.update(lines.length);
    }

    // Side effects
    Sidebar.update(lines, State.lastLint.issues);
    WordCount.update(plain);
    FileManager.scheduleSave(plain);
    Undo.push(plain);

    // Re-apply search highlights if panel is open
    Search.reapplyIfOpen();

    _applying = false;
  }

  return { apply, esc, line };
})();
