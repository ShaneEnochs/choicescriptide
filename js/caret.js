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

    function walk(node) {
      if (sn && en) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent.length;
        // Use <= so cursor can land at position 0 of this node when cc===start
        if (!sn && start <= cc + len) { sn = node; so = start - cc; }
        if (!en && end   <= cc + len) { en = node; eo = end   - cc; }
        cc += len;
      } else if (node.nodeName === 'BR') {
        // A BR represents one newline at character position cc.
        // If the target offset is exactly here, place the cursor in the
        // parent element just after this BR (child index = BR's index + 1).
        if (!sn && start === cc) {
          const parent = node.parentNode;
          const idx = Array.prototype.indexOf.call(parent.childNodes, node) + 1;
          sn = parent; so = idx;
        }
        if (!en && end === cc) {
          const parent = node.parentNode;
          const idx = Array.prototype.indexOf.call(parent.childNodes, node) + 1;
          en = parent; eo = idx;
        }
        cc += 1;
      } else {
        for (const child of node.childNodes) walk(child);
      }
    }
    walk(el);

    if (!sn) { sn = el; so = el.childNodes.length; }
    if (!en) { en = sn; eo = so; }

    try {
      const r = document.createRange();
      r.setStart(sn, so);
      r.setEnd(en, eo);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (e) { /* ignore edge cases at document boundaries */ }
  }

  return { getOffset, setOffset };
})();
