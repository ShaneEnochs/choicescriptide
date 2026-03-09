// caret.js — character-offset based caret save/restore
// Needed because re-rendering innerHTML resets the cursor to position 0.
//
// ARCHITECTURE NOTES (hard-won from debugging):
//
// The editor uses contenteditable with innerHTML rebuilt on every keystroke.
// This destroys DOM nodes, so browser-native Range objects become invalid.
// We save/restore by converting to/from plain-text character offsets.
//
// The HTML structure is flat: text nodes and <br> nodes are direct children
// of #editor (possibly wrapped in <span> for syntax highlighting).
// Each <br> represents one '\n' character.
//
// getOffset: Range → character offset
//   range.startContainer can be:
//   (a) a TEXT node  → offset is chars into that node
//   (b) a BR node    → offset is 0 or 1 (browser quirk, treat as AT the BR)
//   (c) an ELEMENT   → offset is a child index (browser places cursor between
//                       children after textContent= assignment)
//
// setOffset: character offset → Range
//   Walk the DOM counting chars. BRs count as 1.
//   Place cursor before/after the right node.
//   Special case: two adjacent BRs — must anchor to the next node directly,
//   not parent+childIndex, because browsers collapse that range forward.

const Caret = (() => {

  // ── getOffset ─────────────────────────────────────────────────────────
  // Convert a DOM Range endpoint (container, offset) to a plain-text
  // character index within el.
  function getOffset(el) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { start: 0, end: 0 };
    const range = sel.getRangeAt(0);

    function measure(container, offset) {
      // Case A: container is a text node — walk el counting chars until we
      // reach this exact node, then add the char offset within it.
      if (container.nodeType === Node.TEXT_NODE) {
        let count = 0;
        let found = false;
        function walkText(node) {
          if (found) return;
          if (node.nodeType === Node.TEXT_NODE) {
            if (node === container) { count += offset; found = true; }
            else count += node.textContent.length;
          } else if (node.nodeName === 'BR') {
            count += 1;
          } else {
            for (const c of node.childNodes) { walkText(c); if (found) return; }
          }
        }
        walkText(el);
        return count;
      }

      // Case B: container is a BR node — cursor is on the BR itself.
      // Count all chars that come before this BR in the document.
      if (container.nodeName === 'BR') {
        let count = 0;
        function walkBR(node) {
          if (node === container) return true; // stop
          if (node.nodeType === Node.TEXT_NODE) { count += node.textContent.length; return false; }
          if (node.nodeName === 'BR') { count += 1; return false; }
          for (const c of node.childNodes) { if (walkBR(c)) return true; }
          return false;
        }
        walkBR(el);
        return count; // position is AT the BR (the newline char itself)
      }

      // Case C: container is an element node (including #editor itself).
      // offset is a child index — count all chars in children[0..offset-1].
      let count = 0;
      const children = container.childNodes;
      for (let i = 0; i < offset && i < children.length; i++) {
        count += countAll(children[i]);
      }
      // If container is not el itself, we need to add chars of everything
      // in el that comes before container.
      if (container !== el) {
        let before = 0;
        let found = false;
        function walkBefore(node) {
          if (found) return;
          if (node === container) { found = true; return; }
          if (node.nodeType === Node.TEXT_NODE) before += node.textContent.length;
          else if (node.nodeName === 'BR') before += 1;
          else { for (const c of node.childNodes) { walkBefore(c); if (found) return; } }
        }
        walkBefore(el);
        count += before;
      }
      return count;
    }

    const start = measure(range.startContainer, range.startOffset);
    const end   = range.collapsed ? start : measure(range.endContainer, range.endOffset);
    return { start, end };
  }

  // Count all plain-text characters in a subtree.
  function countAll(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent.length;
    if (node.nodeName === 'BR') return 1;
    let n = 0;
    for (const c of node.childNodes) n += countAll(c);
    return n;
  }

  // ── setOffset ─────────────────────────────────────────────────────────
  // Convert a plain-text character index back to a DOM Range endpoint.
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
          // BR occupies position cc (the newline character).
          if (target === cc) {
            // Cursor AT the newline — place before this BR.
            const idx = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
            result = { node: node.parentNode, offset: idx };
          } else if (target === cc + 1) {
            // Cursor at start of next line (right after this BR).
            // Must anchor to next sibling directly to avoid browser
            // collapsing the range when two BRs are adjacent.
            const next = node.nextSibling;
            if (!next) {
              const idx = Array.prototype.indexOf.call(node.parentNode.childNodes, node) + 1;
              result = { node: node.parentNode, offset: idx };
            } else if (next.nodeType === Node.TEXT_NODE) {
              result = { node: next, offset: 0 };
            } else {
              // Another element (BR, span): point to parent at next's index.
              const idx = Array.prototype.indexOf.call(node.parentNode.childNodes, next);
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
        '| target start=', start, 'node=', s.node, 'offset=', s.offset,
        '| target end=', end, 'node=', e.node, 'offset=', e.offset);
    }
  }

  return { getOffset, setOffset };
})();
