/* Rhyme helper. Uses a built-in pronunciation dictionary (rhymedata.js, loaded on first use).
   Words rhyme when everything from their last stressed vowel onwards sounds the same. */
(function () {
  var h = UI.h;
  var loading = null, ready = false;
  var byKey = null, wordKeys = null, nearIdx = null;

  function load() {
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "rhymedata.js";
      s.onload = function () {
        var data = window.RHYME_DATA || {};
        byKey = data; wordKeys = Object.create(null);
        Object.keys(data).forEach(function (k) {
          data[k].forEach(function (w) { (wordKeys[w] || (wordKeys[w] = [])).push(k); });
        });
        ready = true; resolve();
      };
      s.onerror = function () { loading = null; reject(new Error("load")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function buildNear() {
    if (nearIdx) return;
    nearIdx = Object.create(null);
    Object.keys(byKey).forEach(function (k) {
      var p = k.split(" ");
      var nk = p[0] + "|" + p.length;
      (nearIdx[nk] || (nearIdx[nk] = [])).push(k);
    });
  }
  function nearKey(k) { var p = k.split(" "); return p[0] + "|" + p.length; }
  function lastPh(k) { var p = k.split(" "); return p[p.length - 1]; }

  // A word the dictionary doesn't know: borrow the sound of known words with the same ending.
  function guessKeys(word) {
    for (var n = Math.min(5, word.length - 1); n >= 3; n--) {
      var suf = word.slice(-n), count = Object.create(null), found = false;
      for (var w in wordKeys) {
        if (w.length > n && w.slice(-n) === suf) {
          wordKeys[w].forEach(function (k) { count[k] = (count[k] || 0) + 1; found = true; });
        }
      }
      if (found) {
        var best = Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })[0];
        return [best];
      }
    }
    return [];
  }

  function cmp(a, b) { return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0); }

  function lookup(raw) {
    var word = String(raw || "").toLowerCase().replace(/[’]/g, "'").replace(/[^a-z']/g, "");
    if (!word) return null;
    var keys = wordKeys[word], guessed = false;
    if (!keys) { keys = guessKeys(word); guessed = true; }
    if (!keys.length) return { word: word, perfect: [], near: [], unknown: true };
    var seen = Object.create(null); seen[word] = true;
    var perfect = [];
    keys.forEach(function (k) {
      byKey[k].forEach(function (w) { if (!seen[w]) { seen[w] = true; perfect.push(w); } });
    });
    buildNear();
    var near = [];
    var nearKeys = [];
    keys.forEach(function (k) {
      (nearIdx[nearKey(k)] || []).forEach(function (k2) { if (keys.indexOf(k2) < 0 && nearKeys.indexOf(k2) < 0) nearKeys.push(k2); });
    });
    // Same ending sound first, then the rest with the same vowel.
    var ends = keys.map(lastPh);
    nearKeys.sort(function (a, b) { return (ends.indexOf(lastPh(b)) >= 0) - (ends.indexOf(lastPh(a)) >= 0); });
    nearKeys.forEach(function (k2) {
      byKey[k2].forEach(function (w) { if (!seen[w]) { seen[w] = true; near.push(w); } });
    });
    return { word: word, perfect: perfect, near: near, guessed: guessed };
  }

  function lastWordAtCursor(ta) {
    var v = ta.value, pos = ta.selectionStart == null ? v.length : ta.selectionStart;
    var start = v.lastIndexOf("\n", pos - 1) + 1;
    var end = v.indexOf("\n", pos); if (end < 0) end = v.length;
    var m = v.slice(start, end).match(/([A-Za-z'’]+)[^A-Za-z'’]*$/);
    return m ? m[1] : "";
  }

  function insertWord(ta, word) {
    var v = ta.value, a = ta.selectionStart == null ? v.length : ta.selectionStart, b = ta.selectionEnd == null ? a : ta.selectionEnd;
    var pre = v.slice(0, a), sp = pre && !/[\s(]$/.test(pre) ? " " : "";
    ta.value = pre + sp + word + v.slice(b);
    var p = (pre + sp + word).length;
    ta.selectionStart = ta.selectionEnd = p;
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // The panel that sits under the lyrics box.
  App.rhymePanel = function (ta) {
    var input = h("input", { class: "field", type: "text", placeholder: "Type a word, e.g. fire", autocomplete: "off", "aria-label": "Word to rhyme" });
    var out = h("div", { class: "rh-out" });
    var shown = { perfect: 60, near: 40 };
    var current = null;

    function group(title, list, key, tap) {
      if (!list.length) return null;
      var box = h("div", { class: "rh-grp" }, h("span", { class: "lbl", text: title + " · " + list.length }));
      var chips = h("div", { class: "chips" });
      list.slice(0, shown[key]).forEach(function (w) {
        chips.append(h("button", { class: "chip", type: "button", onclick: function () { tap(w); } }, w));
      });
      if (list.length > shown[key]) {
        chips.append(h("button", { class: "chip more", type: "button", onclick: function () { shown[key] += 120; paint(); } }, "Show more"));
      }
      box.append(chips);
      return box;
    }
    function paint() {
      out.textContent = "";
      if (!current) return;
      if (current.unknown) { out.append(h("p", { class: "hint", text: "No rhymes found for “" + current.word + "”." })); return; }
      out.append(h("p", { class: "hint", text: "Tap a word to add it to your lyrics at the cursor." + (current.guessed ? " “" + current.word + "” isn't in the dictionary, so these are based on how it ends." : "") }));
      var g1 = group("Rhymes with " + current.word, current.perfect, "perfect", function (w) { insertWord(ta, w); });
      var g2 = group("Near rhymes", current.near, "near", function (w) { insertWord(ta, w); });
      if (g1) out.append(g1);
      if (g2) out.append(g2);
      if (!g1 && !g2) out.append(h("p", { class: "hint", text: "No rhymes found for “" + current.word + "”." }));
    }
    function search(word) {
      var w = String(word || "").trim();
      if (!w) { current = null; out.textContent = ""; return; }
      if (!ready) {
        out.textContent = "";
        out.append(h("p", { class: "hint", text: "Loading rhyme dictionary…" }));
        load().then(function () { search(input.value); }, function () {
          out.textContent = "";
          out.append(h("p", { class: "hint", text: "Couldn't load the rhyme dictionary. Check your connection and try again." }));
        });
        return;
      }
      current = lookup(w);
      shown = { perfect: 60, near: 40 };
      paint();
    }
    var timer = null;
    input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(function () { search(input.value); }, 200); });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); search(input.value); } });

    var useLast = h("button", { class: "btn sm ghost", type: "button", onclick: function () {
      var w = lastWordAtCursor(ta);
      if (w) { input.value = w; search(w); }
    } }, "Last word on this line");

    var box = h("details", { class: "more rh" }, h("summary", { text: "Rhyme helper" }),
      h("div", { class: "inner" }, input, h("div", { class: "btns" }, useLast), out));
    box.addEventListener("toggle", function () { if (box.open) load().catch(function () {}); });
    return box;
  };
  App._rhymeLookup = lookup; // for tests
  App._rhymeLoad = load;
})();
