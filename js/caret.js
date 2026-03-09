// caret.js — character-offset based caret save/restore
// Needed because re-rendering innerHTML resets the cursor to position 0.

const Caret = (() => {

  function getOffset(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const range = sel.getRangeAt(0);

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
          if (node === targetNode) {
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

    // Walk the editor DOM and find the DOM node+offset corresponding to
    // character position `target` in the plain text.
    //
    // Key insight: the editor innerHTML uses <br> for newlines.
    // A <br> at plain-text position P means:
    //   - characters 0..P-1 come before it
    //   - character P is the newline itself (the <br>)
    //   - character P+1 is the start of the next line
    //
    // To place the cursor at position T:
    //   - If T lands inside a text node: standard node+charOffset
    //   - If T lands exactly AT a <br> (T === brPosition): place before the <br>
    //     using Range.setStartBefore(brNode) — this is "end of previous line"
    //   - If T lands one past a <br> (T === brPosition+1): place after the <br>
    //     — i.e. at the start of the next line. Anchor to the next sibling.
    //     If next sibling is text: offset 0 of that text node.
    //     If next sibling is another element (BR, span): parent + indexOf(next).
    //     If no next sibling: parent + childCount.
    //
    // The "two adjacent BRs" problem: browser collapses parent+childIndex
    // when the child at that index is a BR. Fix: always anchor to the next
    // node itself (setStartBefore equivalent via parent+indexOf(next)).

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
          // This BR occupies plain-text position cc.
          if (target === cc) {
            // Cursor is AT the newline — place it just before this BR.
            // Using parent + indexOf(br) puts cursor before the BR node.
            const idx = Array.prototype.indexOf.call(
              node.parentNode.childNodes, node);
            result = { node: node.parentNode, offset: idx };
          } else if (target === cc + 1) {
            // Cursor is at the START of the line after this BR.
            const next = node.nextSibling;
            if (!next) {
              // BR is the last node — end of document.
              const idx = Array.prototype.indexOf.call(
                node.parentNode.childNodes, node) + 1;
              result = { node: node.parentNode, offset: idx };
            } else if (next.nodeType === Node.TEXT_NODE) {
              // Next content is text — anchor at character 0 of that node.
              result = { node: next, offset: 0 };
            } else {
              // Next sibling is an element (span, another BR, etc.).
              // Point to parent at the index OF the next sibling.
              // This is equivalent to setStartBefore(next) and the browser
              // won't collapse it because we're referencing next's position.
              const idx = Array.prototype.indexOf.call(
                node.parentNode.childNodes, next);
              result = { node: node.parentNode, offset: idx };
            }
          }
          cc += 1;

        } else {
          // Element node (span etc.) — recurse into children.
          for (const child of node.childNodes) {
            walk(child);
            if (result) return;
          }
        }
      }

      walk(el);

      // Fallback: end of document.
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
      // Log so we can see what's actually failing instead of silently eating it
      console.error('[Caret.setOffset] Range exception:', ex.message,
        '| start=', start, 'node=', s.node, 'offset=', s.offset,
        '| end=', end, 'node=', e.node, 'offset=', e.offset);
    }
  }

  return { getOffset, setOffset };
})();
