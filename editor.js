/* Lyrics editor: a plain-text box where bold and italic show as you type.
   The song is still stored as text, with <b>bold</b> and <i>italic</i> marks, so the page view, search and backups keep working.
   Each line of the editor is one <div>. */
(function () {
  var h = UI.h;

  function isBlock(n) { return n.nodeType === 1 && (n.tagName === "DIV" || n.tagName === "P"); }

  // DOM -> text with marks
  function serialize(root) {
    var lines = [""];
    function nl() { lines.push(""); }
    function put(s) { lines[lines.length - 1] += s; }
    function styled(el, b, i) {
      var tag = el.tagName, st = el.style || {};
      if (tag === "B" || tag === "STRONG") b = true;
      if (tag === "I" || tag === "EM") i = true;
      var w = st.fontWeight;
      if (w === "bold" || w === "bolder" || (w && Number(w) >= 600)) b = true;
      if (w === "normal" || (w && Number(w) && Number(w) < 600)) b = false;
      if (st.fontStyle === "italic" || st.fontStyle === "oblique") i = true;
      if (st.fontStyle === "normal") i = false;
      return [b, i];
    }
    function mark(text, b, i) {
      text = text.replace(/\u00a0/g, " ").replace(/\u200b/g, "");
      if (!text) return "";
      if (!b && !i) return text;
      var lead = text.match(/^\s*/)[0], trail = text.match(/\s*$/)[0];
      var core = text.slice(lead.length, text.length - trail.length);
      if (!core) return text;
      if (i) core = "<i>" + core + "</i>";
      if (b) core = "<b>" + core + "</b>";
      return lead + core + trail;
    }
    function walk(node, b, i) {
      var kids = node.childNodes;
      for (var k = 0; k < kids.length; k++) {
        var c = kids[k];
        if (c.nodeType === 3) { put(mark(c.data, b, i)); continue; }
        if (c.nodeType !== 1) continue;
        if (c.tagName === "BR") {
          var p = c.parentNode;
          // A lone <br> in a line, or a trailing one, only holds the line open.
          if (isBlock(p) && (p.childNodes.length === 1 || c === p.lastChild)) continue;
          nl(); continue;
        }
        if (isBlock(c)) {
          if (lines.length > 1 || lines[0] !== "" || k > 0) nl();
          var s = styled(c, b, i);
          walk(c, s[0], s[1]);
          continue;
        }
        var s2 = styled(c, b, i);
        walk(c, s2[0], s2[1]);
      }
    }
    walk(root, false, false);
    return lines.join("\n");
  }

  function lineNode(text) {
    var d = document.createElement("div");
    if (!text) { d.append(document.createElement("br")); return d; }
    UI.richNodes(text).forEach(function (n) { d.append(n); });
    return d;
  }

  App.richEditor = function (initial, onChange, opts) {
    opts = opts || {};
    var root = h("div", {
      class: "ta rte", id: opts.id || "sLyrics", contenteditable: "true", role: "textbox", "aria-multiline": "true",
      "aria-label": opts.label || "Lyrics", spellcheck: "false", autocorrect: "off", autocapitalize: "sentences",
      "data-ph": opts.placeholder || ""
    });
    var buttons = {};
    var saved = null; // last selection made inside the editor

    function setText(text) {
      root.textContent = "";
      String(text || "").split(/\r?\n/).forEach(function (l) { root.append(lineNode(l)); });
      flagEmpty();
    }
    function getText() { return serialize(root); }
    function flagEmpty() { root.classList.toggle("empty", !getText().trim()); }

    function inside(node) { return node && (node === root || root.contains(node)); }
    function remember() {
      var sel = window.getSelection();
      if (sel && sel.rangeCount && inside(sel.anchorNode)) saved = sel.getRangeAt(0).cloneRange();
    }
    function restore() {
      if (!saved) { root.focus(); return; }
      root.focus();
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(saved);
    }

    function paintButtons() {
      if (!root.isConnected) { document.removeEventListener("selectionchange", onSel); return; }
      var sel = window.getSelection();
      var inEd = sel && sel.rangeCount && inside(sel.anchorNode);
      ["bold", "italic"].forEach(function (c) {
        var on = false;
        try { on = !!inEd && document.queryCommandState(c); } catch (e) {}
        var b = buttons[c];
        if (!b) return;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }
    function onSel() { remember(); paintButtons(); }
    document.addEventListener("selectionchange", onSel);

    // If everything was deleted the box can end up with no line at all.
    function ensureLine() {
      if (!root.firstChild) { root.append(lineNode("")); return; }
      var hasBlock = false;
      for (var k = 0; k < root.childNodes.length; k++) if (isBlock(root.childNodes[k])) hasBlock = true;
      if (!hasBlock && root.textContent === "" ) { root.textContent = ""; root.append(lineNode("")); }
    }

    function changed() {
      ensureLine();
      flagEmpty();
      if (onChange) onChange(getText());
    }
    root.addEventListener("input", function () { changed(); paintButtons(); });

    // Paste as plain text so nothing arrives with its own fonts or colors.
    root.addEventListener("paste", function (e) {
      var t = e.clipboardData && e.clipboardData.getData("text/plain");
      if (t == null) return;
      e.preventDefault();
      document.execCommand("insertText", false, t.replace(/\r\n?/g, "\n"));
    });
    root.addEventListener("blur", remember);
    root.addEventListener("keyup", paintButtons);

    function toggle(cmd) {
      restore();
      try { document.execCommand("styleWithCSS", false, false); } catch (e) {}
      document.execCommand(cmd, false, null);
      remember();
      changed();
      paintButtons();
    }

    function lineOf(node) {
      while (node && node.parentNode !== root) node = node.parentNode;
      return node && node.parentNode === root ? node : null;
    }

    function insertText(str) {
      restore();
      var sel = window.getSelection();
      if (!sel.rangeCount || !inside(sel.anchorNode)) {
        var r = document.createRange(); r.selectNodeContents(root); r.collapse(false);
        sel.removeAllRanges(); sel.addRange(r);
      }
      var before = "";
      try {
        var r2 = sel.getRangeAt(0).cloneRange(); r2.collapse(true);
        var ln = lineOf(r2.startContainer);
        if (ln) { var pre = document.createRange(); pre.selectNodeContents(ln); pre.setEnd(r2.startContainer, r2.startOffset); before = pre.toString(); }
      } catch (e) {}
      var sp = before && !/[\s(]$/.test(before) ? " " : "";
      document.execCommand("insertText", false, sp + str);
      remember();
      changed();
    }

    function lastWord() {
      restore();
      var sel = window.getSelection();
      var ln = sel.rangeCount ? lineOf(sel.anchorNode) : null;
      var text = (ln ? ln.textContent : "").replace(/ /g, " ");
      var m = text.match(/([A-Za-z'’]+)[^A-Za-z'’]*$/);
      return m ? m[1] : "";
    }

    function insertSection(name) {
      var text = getText();
      var label = name;
      if (name === "Verse") label = "Verse " + ((text.match(/^\s*\[Verse\b/gim) || []).length + 1);
      restore();
      var sel = window.getSelection();
      var cur = sel.rangeCount ? lineOf(sel.anchorNode) : null;
      var lines = Array.prototype.slice.call(root.children);
      var anchor = cur || lines[lines.length - 1];
      var empty = !anchor || !anchor.textContent.replace(/​/g, "").trim();
      var frag = [];
      var prev = empty ? (anchor && anchor.previousElementSibling) : anchor;
      if (prev && prev.textContent.trim()) frag.push(lineNode(""));
      var hdr = lineNode("[" + label + "]");
      var body = lineNode("");
      frag.push(hdr, body);
      if (empty && anchor) {
        frag.forEach(function (n) { root.insertBefore(n, anchor); });
        root.removeChild(anchor);
      } else if (anchor) {
        var ref = anchor.nextSibling;
        frag.forEach(function (n) { root.insertBefore(n, ref); });
      } else frag.forEach(function (n) { root.append(n); });
      var r = document.createRange(); r.setStart(body, 0); r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      remember();
      changed();
    }

    function styleButton(label, cmd, name, cls) {
      var btn = h("button", { class: "chip " + cls, type: "button", "aria-label": name, title: name, "aria-pressed": "false" }, label);
      // Act on the press itself. Cancelling touchstart would stop the tap from becoming a click on iPhone.
      var last = 0;
      btn.addEventListener("pointerdown", function (e) {
        if (e.cancelable) e.preventDefault(); // keep the selection where it is
        last = Date.now();
        toggle(cmd);
      });
      btn.addEventListener("mousedown", function (e) { if (e.cancelable) e.preventDefault(); });
      btn.addEventListener("click", function (e) {
        if (Date.now() - last < 600) return; // already handled by the press
        toggle(cmd); // keyboard or assistive tech
      });
      buttons[cmd] = btn;
      return btn;
    }
    var bar = h("div", { class: "fmt" }, styleButton("B", "bold", "Bold", "fb"), styleButton("I", "italic", "Italic", "fi"));

    try { document.execCommand("defaultParagraphSeparator", false, "div"); } catch (e) {}
    setText(initial);

    return { el: root, bar: bar, getText: getText, setText: setText, insertText: insertText, lastWord: lastWord, insertSection: insertSection, focus: function () { restore(); } };
  };
})();
