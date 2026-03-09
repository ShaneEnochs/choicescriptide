// caret.js — character-offset based caret save/restore
// Needed because re-rendering innerHTML resets the cursor to position 0.

const Caret = (() => {

  // Count plain-text characters from the start of `el` up to (container, offset).
  // When container is an element node, offset is a child index.
  // When container is a text node, offset is a character index.
  // When container is a BR node, offset is ignored (cursor is on the BR itself).
  function _count(el, targetNode, targetOffset) {
    let count = 0;
    let found = false;

    function walk(node) {
      if (found) return;

      if (node === targetNode) {
        // We've reached the target container.
        if (node.nodeType === Node.TEXT_NODE) {
          // offset is a character index within this text node.
          count += targetOffset;
        } else if (node.nodeName === 'BR') {
          // Cursor is on the BR itself — count nothing extra;
          // the BR's newline character is at `count` right now.
        } else {
          // Element node: offset is a child index.
          // Count characters only through the first `targetOffset` children.
          let i = 0;
          for (const child of node.childNodes) {
            if (i >= targetOffset) break;
            count += _countAll(child);
            i++;
          }
        }
        found = true;
        return;
      }

      // Not the target — count this node's content and keep walking.
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

  // Count ALL plain-text characters in a subtree.
  function _countAll(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.length;
    if (node.nodeName === 'BR') return 1;
    let n = 0;
    for (const child of node.childNodes) n += _countAll(child);
    return n;
  }

  function getOffset(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const range = sel.getRangeAt(0);
    const start = _count(el, range.startContainer, range.startOffset);
    const end   = _count(el, range.endContainer,   range.endOffset);
    return { start, end };
  }

  function setOffset(el, start, end) {
    const sel = window.getSelection();
    if (!sel) return;

    // Find the DOM position (node, offset) for a plain-text character index.
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
          // This BR occupies plain-text position cc (the newline character).
          if (target === cc) {
            // Cursor AT the newline: place before this BR.
            const idx = Array.prototype.indexOf.call(
              node.parentNode.childNodes, node);
            result = { node: node.parentNode, offset: idx };
          } else if (target === cc + 1) {
            // Cursor at start of the line after this BR.
            const next = node.nextSibling;
            if (!next) {
              // BR is last child — end of document.
              const idx = Array.prototype.indexOf.call(
                node.parentNode.childNodes, node) + 1;
              result = { node: node.parentNode, offset: idx };
            } else if (next.nodeType === Node.TEXT_NODE) {
              result = { node: next, offset: 0 };
            } else {
              // Next sibling is an element (another BR, span, etc.).
              // Use parent + indexOf(next) — equivalent to setStartBefore(next).
              const idx = Array.prototype.indexOf.call(
                node.parentNode.childNodes, next);
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
      if (!result) result = { node: el, offset: el.childNodes.length };
      return result;
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
      console.error('[Caret.setOffset] Range exception:', ex.message,
        '| start=', start, 's.node=', s.node, 's.offset=', s.offset,
        '| end=', end, 'e.node=', e.node, 'e.offset=', e.offset);
    }
  }

  return { getOffset, setOffset };
})();
