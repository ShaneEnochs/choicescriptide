// caret.js — character-offset based caret save/restore
// Needed because re-rendering innerHTML resets the cursor to position 0.
//
// Uses a unified tree-walker so getOffset and setOffset count identically.
// Each <br> counts as 1 character (the '\n' it represents).

const Caret = (() => {

  // Count all plain-text characters in a subtree.
  function countAll(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.length;
    if (node.nodeName === 'BR') return 1;
    let n = 0;
    for (const c of node.childNodes) n += countAll(c);
    return n;
  }

  // ── getOffset ─────────────────────────────────────────────────────────
  // Unified walker: if we reach the exact container node, add the local
  // offset and stop. Otherwise count the node's characters and keep going.
  // Handles all three browser cursor placement cases:
  //   (a) Text node container  → offset is chars into that node
  //   (b) Element container    → offset is child index; sum first N children
  //   (c) BR container         → treat as 0 (cursor is on the BR itself)
  function getOffset(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const range = sel.getRangeAt(0);

    function measure(container, offset) {
      let count = 0;
      let found = false;

      function walk(node) {
        if (found) return;

        if (node === container) {
          if (node.nodeType === Node.TEXT_NODE) {
            // Offset is a character index within this text node.
            count += offset;
          } else {
            // Element or BR: offset is a child index.
            // Sum the first `offset` children.
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
  // Walk the editor DOM counting plain-text characters, find the node and
  // local offset corresponding to the target character index.
  //
  // BR handling has two cases:
  //   target === cc     → cursor AT the newline: anchor before this BR
  //   target === cc + 1 → cursor at START of next line: anchor to next sibling
  //
  // The "next sibling" strategy for cc+1 is critical: using parent+childIndex+1
  // causes browsers to silently collapse the range forward when two BRs are
  // adjacent (empty lines). Anchoring to the next node directly prevents this.
  function setOffset(el, start, end) {
    const sel = window.getSelection();
    if (!sel) return;

    function findPosition(target) {
      let cc = 0;
      let result = null;

      function walk(node) {
        if (result) return;

        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent.length;
          if (target <= cc + len) {
            result = { node, offset: target - cc };
          }
          cc += len;

        } else if (node.nodeName === 'BR') {
          if (target === cc) {
            // Cursor AT the newline — place before this BR.
            const idx = Array.from(node.parentNode.childNodes).indexOf(node);
            result = { node: node.parentNode, offset: idx };
          } else if (target === cc + 1) {
            // Cursor at start of the line AFTER this BR.
            // Must use next sibling directly to avoid browser collapsing the
            // range when two consecutive BRs are present (empty lines).
            const next = node.nextSibling;
            if (!next) {
              // BR is last child — end of document.
              const idx = Array.from(node.parentNode.childNodes).indexOf(node) + 1;
              result = { node: node.parentNode, offset: idx };
            } else if (next.nodeType === Node.TEXT_NODE) {
              result = { node: next, offset: 0 };
            } else {
              // Next sibling is an element (another BR, span, etc.).
              // Point to parent at indexOf(next) — equivalent to setStartBefore(next).
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
