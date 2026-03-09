// caret.js — character-offset based caret save/restore
// Needed because re-rendering innerHTML resets the cursor to position 0.
//
// Uses a unified tree-walker so getOffset and setOffset count identically.
// Each <br> counts as 1 character (the '\n' it represents), EXCEPT for
// <br data-sentinel> which is a visual-only node appended by highlight.js
// to ensure the cursor can land on the final empty line. The sentinel is
// invisible to all character counting.

const Caret = (() => {

  function isSentinel(node) {
    return node.nodeName === 'BR' && node.hasAttribute && node.hasAttribute('data-sentinel');
  }

  // Count all plain-text characters in a subtree, skipping the sentinel BR.
  function countAll(node) {
    if (isSentinel(node)) return 0;
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.length;
    if (node.nodeName === 'BR') return 1;
    let n = 0;
    for (const c of node.childNodes) n += countAll(c);
    return n;
  }

  // ── getOffset ─────────────────────────────────────────────────────────
  function getOffset(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const range = sel.getRangeAt(0);

    function measure(container, offset) {
      let count = 0;
      let found = false;

      function walk(node) {
        if (found) return;
        if (isSentinel(node)) return; // skip sentinel entirely

        if (node === container) {
          if (node.nodeType === Node.TEXT_NODE) {
            count += offset;
          } else {
            for (let i = 0; i < offset; i++) {
              if (node.childNodes[i]) count += countAll(node.childNodes[i]);
            }
          }
          found = true;
          return;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          count += node.textContent.length;
        } else if (node.nodeName === 'BR') {
          count += 1;
        } else {
          for (const child of node.childNodes) {
            walk(child);
            if (found) return;
          }
        }
      }

      walk(el);
      return count;
    }

    const start = measure(range.startContainer, range.startOffset);
    const end   = range.collapsed ? start : measure(range.endContainer, range.endOffset);
    return { start, end };
  }

  // ── setOffset ─────────────────────────────────────────────────────────
  // Walk the editor DOM counting plain-text characters (skipping the sentinel),
  // find the node and local offset for the target character index.
  //
  // BR handling:
  //   target === cc     → place before the BR (at the newline character itself)
  //   target === cc + 1 → place at the start of the next line
  //     - If next sibling exists: anchor to it directly (avoids adjacent-BR collapse)
  //     - If no next sibling (or only the sentinel): anchor to parent end
  function setOffset(el, start, end) {
    const sel = window.getSelection();
    if (!sel) return;

    function findPosition(target) {
      let cc = 0;
      let result = null;

      function walk(node) {
        if (result) return;
        if (isSentinel(node)) return; // skip sentinel

        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent.length;
          if (target <= cc + len) {
            result = { node, offset: target - cc };
          }
          cc += len;

        } else if (node.nodeName === 'BR') {
          if (target === cc) {
            const idx = Array.from(node.parentNode.childNodes).indexOf(node);
            result = { node: node.parentNode, offset: idx };
          } else if (target === cc + 1) {
            // Find next non-sentinel sibling
            let next = node.nextSibling;
            while (next && isSentinel(next)) next = next.nextSibling;

            if (!next) {
              // No real content after this BR — cursor at end of editor
              // (before the sentinel, if any)
              const sentinel = node.nextSibling; // may be sentinel or null
              if (sentinel && isSentinel(sentinel)) {
                const idx = Array.from(node.parentNode.childNodes).indexOf(sentinel);
                result = { node: node.parentNode, offset: idx };
              } else {
                result = { node: node.parentNode, offset: node.parentNode.childNodes.length };
              }
            } else if (next.nodeType === Node.TEXT_NODE) {
              result = { node: next, offset: 0 };
            } else {
              const idx = Array.from(node.parentNode.childNodes).indexOf(next);
              result = { node: node.parentNode, offset: idx };
            }
          }
          cc += 1;

        } else {
          for (const child of node.childNodes) {
            walk(child);
            if (result) return;
          }
        }
      }

      walk(el);
      return result || { node: el, offset: el.childNodes.length };
    }

    const s = findPosition(start);
    const e = (end === start) ? s : findPosition(end);

    try {
      const r = document.createRange();
      r.setStart(s.node, s.offset);
      r.setEnd(e.node, e.offset);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (ex) {
      console.error('[Caret.setOffset] Failed:', ex.message,
        '| start=', start, 'node=', s.node, 'offset=', s.offset,
        '| end=', end, 'node=', e.node, 'offset=', e.offset);
    }
  }

  return { getOffset, setOffset };
})();
