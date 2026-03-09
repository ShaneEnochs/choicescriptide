// caret.js — character-offset based caret save/restore
// Needed because re-rendering innerHTML resets the cursor to position 0.

const Caret = (() => {

  function getOffset(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const range = sel.getRangeAt(0);

    // Walk the DOM counting characters the same way setOffset does,
    // so that getOffset and setOffset use identical offset arithmetic.
    function countToNode(targetNode, targetOffset) {
      let count = 0;
      let found = false;
      function walk(node) {
        if (found) return;
        if (node.nodeType === Node.TEXT_NODE) {
          if (node === targetNode) {
            count += targetOffset;
            found = true;
          } else {
            count += node.textContent.length;
          }
        } else if (node.nodeName === 'BR') {
          if (node === targetNode) {
            found = true;
          } else {
            count += 1;
          }
        } else {
          for (const child of node.childNodes) {
            walk(child);
            if (found) return;
          }
          // If the target is the element itself (cursor at end of container)
          if (node === targetNode) {
            // targetOffset is a child index — count children up to that index
            // already counted above via the child walk; just mark found
            found = true;
          }
        }
      }
      walk(el);
      return count;
    }

    const start = countToNode(range.startContainer, range.startOffset);
    const end   = countToNode(range.endContainer,   range.endOffset);
    return { start, end };
  }

  function setOffset(el, start, end) {
    const sel = window.getSelection();
    if (!sel) return;

    let cc = 0, sn = null, so = 0, en = null, eo = 0;

    // Place a cursor endpoint at character position `target`.
    // Returns { node, offset } for use with Range.setStart/setEnd.
    // Handles the tricky case where the target falls right after a BR:
    // browsers collapse parent+childIndex ranges when two BRs are adjacent,
    // so we anchor to the *next sibling* directly instead.
    function findPosition(target) {
      let cc2 = 0;
      let result = null;

      function walk(node) {
        if (result) return;
        if (node.nodeType === Node.TEXT_NODE) {
          const len = node.textContent.length;
          if (target <= cc2 + len) {
            result = { node, offset: target - cc2 };
          }
          cc2 += len;
        } else if (node.nodeName === 'BR') {
          // cc2 is the position OF the newline character.
          // The position AFTER it (start of next line) is cc2 + 1.
          if (target === cc2 + 1) {
            // Anchor to whatever comes after this BR.
            const next = node.nextSibling;
            if (next && next.nodeType === Node.TEXT_NODE) {
              // Next sibling is text: anchor at its start.
              result = { node: next, offset: 0 };
            } else if (next) {
              // Next sibling is another element (e.g. another BR or span):
              // use parent+childIndex pointing AT next, not after current.
              const idx = Array.prototype.indexOf.call(node.parentNode.childNodes, next);
              result = { node: node.parentNode, offset: idx };
            } else {
              // BR is the last child: parent + index after BR.
              const idx = Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1;
              result = { node: node.parentNode, offset: idx };
            }
          }
          cc2 += 1;
        } else {
          for (const child of node.childNodes) walk(child);
        }
      }
      walk(el);

      // Fallback: end of document
      if (!result) result = { node: el, offset: el.childNodes.length };
      return result;
    }

    const s = findPosition(start);
    const e = findPosition(end);

    try {
      const r = document.createRange();
      r.setStart(s.node, s.offset);
      r.setEnd(e.node, e.offset);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (ex) { /* ignore edge cases at document boundaries */ }
  }

  return { getOffset, setOffset };
})();
