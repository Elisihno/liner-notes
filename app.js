/* App shell: navigation, the songs list, the albums grid and the album screen. */
(function () {
  var h = UI.h;
  var S = { tab: "songs", view: null, mode: "write", q: "", sheet: null, stack: [] };
  try {
    var savedTab = localStorage.getItem("linernotes.tab");
    if (savedTab === "albums" || savedTab === "artists") S.tab = savedTab;
  } catch (e) {}

  var app = document.getElementById("app");
  var bar = document.getElementById("bar");
  var sheetRoot = document.getElementById("sheetRoot");
  var toastEl = document.getElementById("toast");
  var toastTimer = 0;

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  function lastArtist() {
    try { return localStorage.getItem("linernotes.artist") || ""; } catch (e) { return ""; }
  }
  function rememberArtist(v) {
    try { if (v.trim()) localStorage.setItem("linernotes.artist", v.trim()); } catch (e) {}
  }

  function syncText() {
    var st = Store.status();
    if (!Store.cloud()) return "Saved on this device only";
    if (st === "saving") return "Saving…";
    if (st === "error") return "Couldn't sync, kept on this device";
    return "Saved to your account";
  }
  function updateStatus() {
    var el = document.getElementById("status");
    if (el) el.textContent = syncText();
  }

  function go(view, mode) {
    S.stack.push({ view: S.view, mode: S.mode });
    S.view = view;
    S.sheet = null;
    if (mode) S.mode = mode;
    render();
    window.scrollTo(0, 0);
  }
  function goBack(tab) {
    var p = S.stack.pop();
    if (!p) { setTab(tab || S.tab); return; }
    S.view = p.view;
    S.mode = p.mode;
    S.sheet = null;
    render();
    window.scrollTo(0, 0);
  }
  function setTab(t) {
    S.tab = t;
    S.view = null;
    S.stack = [];
    S.q = "";
    try { localStorage.setItem("linernotes.tab", t); } catch (e) {}
    render();
    window.scrollTo(0, 0);
  }

  function top(title, actions, id) {
    var h1 = h("h1", { text: title });
    if (id) h1.id = id;
    return h("header", { class: "top" }, h1, actions);
  }

  function twoStep(label, confirmLabel, action) {
    var timer = 0;
    var b = h("button", { class: "btn danger", type: "button" }, label);
    b.addEventListener("click", function () {
      if (b.dataset.armed) { clearTimeout(timer); action(); return; }
      b.dataset.armed = "1";
      b.textContent = confirmLabel;
      timer = setTimeout(function () { delete b.dataset.armed; b.textContent = label; }, 4000);
    });
    return b;
  }

  function bindField(el, item, field, after) {
    el.addEventListener("input", function () {
      var v = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value;
      item[field] = v;
      Store.put(item);
      if (after) after(v);
    });
  }

  // Dated history (streams, monthly listeners): one entry per day, newest value wins.
  function byDay(a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }
  function logPoint(item, key, n) {
    var log = (item[key] || []).map(function (e) { return { d: e.d, n: e.n }; }).sort(byDay);
    var today = UI.todayStr();
    var last = log[log.length - 1];
    if (last && last.n === n) return;
    if (last && last.d === today) last.n = n; else log.push({ d: today, n: n });
    item[key] = log.slice(-240);
    Store.put(item);
  }
  function setHistory(item, field, key, log) {
    log.sort(byDay);
    item[key] = log;
    if (log.length) item[field] = log[log.length - 1].n;
    Store.put(item);
    render();
  }

  var openHist = {};
  function historyBlock(item, field, key, title) {
    var log = (item[key] || []).map(function (e) { return { d: e.d, n: e.n }; }).sort(byDay);
    var det = h("details", { class: "more" });
    if (openHist[item.id + key]) det.open = true;
    det.addEventListener("toggle", function () { openHist[item.id + key] = det.open; });
    det.append(h("summary", { text: title + (log.length ? " · " + log.length : "") }));
    var inner = h("div", { class: "inner" });
    if (!log.length) inner.append(h("p", { class: "hint", style: "margin:0", text: "Each time you change the number above, today's value is saved here. You can also add an earlier one below." }));
    log.slice().reverse().forEach(function (e) {
      inner.append(h("div", { class: "hrow" }, h("span", { text: UI.fmtDay(e.d) }), h("span", { text: UI.fmtFull(e.n) }),
        h("button", { class: "btn sm ghost", type: "button", "aria-label": "Remove entry", onclick: function () {
          openHist[item.id + key] = true;
          setHistory(item, field, key, log.filter(function (x) { return x.d !== e.d; }));
        } }, "Remove")));
    });
    var d = h("input", { class: "field", type: "date", id: "hd-" + key, value: UI.todayStr(), "aria-label": "Date" });
    var n = h("input", { class: "field", type: "text", id: "hn-" + key, inputmode: "text", autocomplete: "off", placeholder: "e.g. 1.2M", "aria-label": "Number" });
    inner.append(h("span", { class: "lbl", style: "margin-top:6px", text: "Add a number for a date" }),
      h("div", { class: "two" }, d, n),
      h("button", { class: "btn", type: "button", onclick: function () {
        var v = UI.parseCount(n.value);
        if (v == null) { toast("Type a number first, like 1.2M"); return; }
        var day = d.value || UI.todayStr();
        openHist[item.id + key] = true;
        setHistory(item, field, key, log.filter(function (x) { return x.d !== day; }).concat([{ d: day, n: v }]));
      } }, "Add to history"));
    det.append(inner);
    return det;
  }

  function chartBlock(title, entries, note) {
    var pts = (entries || []).slice().sort(byDay);
    if (pts.length < 2) return null;
    var first = pts[0], last = pts[pts.length - 1];
    var diff = last.n - first.n;
    var text = UI.fmtFull(last.n) + " on " + UI.fmtDay(last.d) + " · " + (diff < 0 ? "−" : "+") + UI.fmtFull(Math.abs(diff)) + " since " + UI.fmtDay(first.d);
    return h("div", { class: "blk" }, h("h3", { text: title }), UI.lineChart(pts), h("p", { class: "hint", text: text + (note ? ". " + note : "") }));
  }

  // A number field that also takes 1.2M, 350K or 1,234,567, and tidies itself when you leave it.
  function countInput(item, field, id, placeholder, logKey) {
    var input = h("input", { class: "field", id: id, type: "text", inputmode: "text", autocomplete: "off", placeholder: placeholder,
      value: item[field] == null ? "" : UI.fmtFull(item[field]) });
    var hint = h("p", { class: "hint" });
    function paint() {
      var raw = input.value.trim();
      var n = UI.parseCount(raw);
      hint.textContent = !raw ? "Type 1.2M, 350K or 1,234,567" : n == null ? "Can't read that as a number" : "= " + UI.fmtFull(n);
    }
    input.addEventListener("input", function () {
      var raw = input.value.trim();
      var n = UI.parseCount(raw);
      if (!raw) { item[field] = null; Store.put(item); }
      else if (n != null) { item[field] = n; Store.put(item); }
      paint();
    });
    input.addEventListener("change", function () {
      var raw = input.value.trim();
      var n = UI.parseCount(raw);
      if (n != null) { input.value = UI.fmtFull(n); if (logKey) logPoint(item, logKey, n); }
      else if (raw) { input.value = item[field] == null ? "" : UI.fmtFull(item[field]); toast("Couldn't read that, kept the old number"); }
      paint();
    });
    paint();
    return h("div", null, input, hint);
  }

  // Song length field: takes 3:45, 3m45s or 225 and tidies itself to m:ss when you leave it.
  function durationInput(item, field, id, placeholder) {
    var input = h("input", { class: "field", id: id, type: "text", inputmode: "text", autocomplete: "off", placeholder: placeholder,
      value: item[field] == null ? "" : UI.fmtDuration(item[field]) });
    var hint = h("p", { class: "hint" });
    function paint() {
      var raw = input.value.trim();
      var n = UI.parseDuration(raw);
      hint.textContent = !raw ? "Type 3:45, 3m45s or 225 seconds" : n == null ? "Can't read that as a length" : "= " + UI.fmtDuration(n);
    }
    input.addEventListener("input", function () {
      var raw = input.value.trim();
      var n = UI.parseDuration(raw);
      if (!raw) { item[field] = null; Store.put(item); }
      else if (n != null) { item[field] = n; Store.put(item); }
      paint();
    });
    input.addEventListener("change", function () {
      var raw = input.value.trim();
      var n = UI.parseDuration(raw);
      if (n != null) input.value = UI.fmtDuration(n);
      else if (raw) { input.value = item[field] == null ? "" : UI.fmtDuration(item[field]); toast("Couldn't read that, kept the old length"); }
      paint();
    });
    paint();
    return h("div", null, input, hint);
  }

  // Backup and restore of the whole library as one JSON file.
  function stampBackup() { try { localStorage.setItem("linernotes.lastBackup", String(Date.now())); } catch (e) {} }
  function backupNote() {
    var t = 0; try { t = Number(localStorage.getItem("linernotes.lastBackup")) || 0; } catch (e) {}
    if (!t) return "No backup yet. Download one now and then, in case this device loses its data.";
    var days = Math.floor((Date.now() - t) / 86400000);
    return "Last backup: " + (days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago") + ".";
  }
  async function downloadBackup() {
    var data = JSON.stringify(Store.exportData());
    var name = "liner-notes-backup-" + UI.todayStr() + ".json";
    var dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({ filename: name, data: data }); stampBackup(); toast("Backup ready"); }
      catch (e) { if (!e || e.code !== "declined") toast("Couldn't save the backup file"); }
      return;
    }
    try {
      var blob = new Blob([data], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      stampBackup(); toast("Backup ready");
      return;
    } catch (e) { /* fall through to the clipboard */ }
    try { await navigator.clipboard.writeText(data); toast("Saving a file isn't available here, so the backup was copied. Paste it into a note."); }
    catch (e) { toast("Backup isn't available here"); }
  }

  function restoreFrom(file) {
    var rd = new FileReader();
    rd.onerror = function () { toast("Couldn't read that file"); };
    rd.onload = function () {
      var data;
      try { data = JSON.parse(String(rd.result)); } catch (e) { data = null; }
      var list = Array.isArray(data) ? data : (data && data.app === "liner-notes" ? data.items : null);
      if (!Array.isArray(list)) { toast("That isn't a Liner Notes backup"); return; }
      var r = Store.mergeItems(list);
      var parts = [];
      if (r.added) parts.push(r.added + " added");
      if (r.updated) parts.push(r.updated + " updated");
      if (r.skipped) parts.push(r.skipped + " already up to date");
      if (r.invalid) parts.push(r.invalid + " skipped");
      toast("Restored: " + (parts.join(", ") || "nothing to add"));
    };
    rd.readAsText(file);
  }

  function backupBlock() {
    var input = h("input", { type: "file", accept: ".json,application/json", hidden: true, id: "restoreFile" });
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (f) restoreFrom(f);
      input.value = "";
    });
    var n = function (k) { return Store.all(k).length; };
    return h("details", { class: "more", style: "margin-top:22px" },
      h("summary", { text: "Backup and restore" }),
      h("div", { class: "inner" },
        h("p", { class: "hint", style: "margin:0", text: UI.plural(n("song"), "song") + " · " + UI.plural(n("album"), "album") + " · " + UI.plural(n("artist"), "artist") }),
        h("div", { class: "btns" },
          h("button", { class: "btn pri", type: "button", onclick: downloadBackup }, "Download backup"),
          h("label", { class: "btn" }, "Restore from file", input)),
        h("p", { class: "hint", style: "margin:0", text: backupNote() }),
        h("p", { class: "hint", style: "margin:0", text: "Restoring adds anything missing and keeps whichever copy is newer. Nothing is deleted." })));
  }

  function footer() {
    return h("div", null, h("p", { class: "hint", id: "status", text: syncText() }), backupBlock());
  }

  // Native date picker with a Clear button.
  function dateInput(item, field, id) {
    var input = h("input", { class: "field", id: id, type: "date", value: item[field] || "" });
    function save() { item[field] = input.value || null; Store.put(item); }
    input.addEventListener("input", save);
    input.addEventListener("change", save);
    var clear = h("button", { class: "btn sm ghost", type: "button", onclick: function () { input.value = ""; save(); } }, "Clear");
    return h("div", { class: "daterow" }, input, clear);
  }

  function removeItem(item) {
    if (item.imageId) Store.remove(item.imageId);
    Store.remove(item.id);
  }

  // Cover preview with upload / replace / remove. The image is its own stored item so
  // editing lyrics never re-sends the picture.
  function coverPicker(item, album, opts) {
    var hasOwn = !!(item.imageId && Store.get(item.imageId));
    var input = h("input", { type: "file", accept: "image/*", hidden: true, id: "cov-" + item.id });
    input.addEventListener("change", function () {
      var f = input.files && input.files[0];
      if (!f) return;
      UI.processImage(f).then(function (data) {
        var im = item.imageId ? Store.get(item.imageId) : null;
        if (!im) { im = { kind: "image", id: Store.newId("i"), data: data }; item.imageId = im.id; }
        else im.data = data;
        Store.put(im, 100);
        Store.put(item, 100);
        render();
      }, function () { toast("Couldn't read that image"); });
      input.value = "";
    });
    var noun = opts && opts.round ? "photo" : "image";
    var btns = h("div", { class: "btns" }, h("label", { class: "btn sm" }, (hasOwn ? "Replace " : "Upload ") + noun, input));
    if (hasOwn) {
      btns.append(h("button", { class: "btn sm ghost", type: "button", onclick: function () {
        Store.remove(item.imageId);
        item.imageId = null;
        Store.put(item, 100);
        render();
      } }, "Remove " + noun));
    }
    var round = !!(opts && opts.round);
    return h("div", { class: "covrow" + (opts && opts.big ? " big" : "") },
      h("span", { class: "cov" + (round ? " round" : "") }, round ? UI.avatarFor(item) : UI.coverFor(item, album)), btns);
  }

  function albumOf(song) { return song.albumId ? Store.get(song.albumId) : null; }
  function tracksOf(albumId) {
    return Store.all("song").filter(function (s) { return s.albumId === albumId; }).sort(function (a, b) {
      var ta = a.track == null ? 1e9 : a.track, tb = b.track == null ? 1e9 : b.track;
      return ta - tb || (a.title || "").localeCompare(b.title || "");
    });
  }

  function newSong(albumId) {
    var a = albumId ? Store.get(albumId) : null;
    var s = { kind: "song", id: Store.newId("s"), title: "", artist: (a && a.artist) || lastArtist(), albumId: albumId || null,
      track: albumId ? tracksOf(albumId).length + 1 : null, lyrics: "", about: "", credits: "", notes: [] };
    Store.put(s, 50);
    go({ name: "song", id: s.id }, "write");
  }
  function newAlbum() {
    var a = { kind: "album", id: Store.newId("a"), title: "", artist: lastArtist(), released: null,
      cover: Math.floor(Math.random() * 64), about: "" };
    Store.put(a, 50);
    go({ name: "album", id: a.id }, "write");
  }

  var EXAMPLE_LYRICS = [
    "[Verse 1]", "Streetlights stutter on the glass", "Every stop a held-in breath", "I count the windows going past",
    "Pretend I'm somewhere else instead", "", "[Chorus]", "Take me round the long way home",
    "Past the closing shutters, past the phone", "I don't mind the empty seat", "When the whole town hums beneath my feet", "",
    "[Verse 2]", "Driver nods, the heater hums", "Someone's laughter, three rows back", "All the things I should have said",
    "Fold themselves into my coat", "", "[Bridge]", "And if the morning never comes", "I'll still be riding, still be warm", "",
    "[Chorus]", "Take me round the long way home", "Past the closing shutters, past the phone", "I don't mind the empty seat",
    "When the whole town hums beneath my feet"
  ].join("\n");

  function loadExample() {
    var s = { kind: "song", id: Store.newId("s"), title: "Last Bus Home (example)", artist: "Example Artist", albumId: null, track: null,
      lyrics: EXAMPLE_LYRICS,
      about: "An example song so you can see how the page looks. Tap a line on the Page tab to add your own annotation, then delete this song whenever you like.",
      credits: "Written by — Example Artist\nProduced by — Example Producer",
      notes: [{ line: UI.lineKey("Take me round the long way home"), text: "The only mention of home is a route, not a place. The narrator is in no hurry to arrive." }] };
    Store.put(s, 50);
    go({ name: "song", id: s.id }, "page");
  }

  function emptyState(kind) {
    if (kind === "albums") {
      return h("div", { class: "empty" }, h("h2", { text: "No albums yet" }),
        h("p", { text: "Group songs into an album, set the order, and give it a cover." }),
        h("div", { class: "btns" }, h("button", { class: "btn pri", type: "button", onclick: newAlbum }, "New album")));
    }
    return h("div", { class: "empty" }, h("h2", { text: "Write the first line" }),
      h("p", { text: "Draft lyrics in sections, then switch to Page to read them as a finished lyric page and annotate any line." }),
      h("div", { class: "btns" },
        h("button", { class: "btn pri", type: "button", onclick: function () { newSong(); } }, "New song"),
        h("button", { class: "btn", type: "button", onclick: loadExample }, "Load an example song")));
  }

  function songRow(s) {
    var al = albumOf(s);
    var st = UI.stats(s.lyrics);
    var sub = [UI.byline(s), al ? (al.title || "Untitled album") : "Single", s.duration ? UI.fmtDuration(s.duration) : ""].filter(Boolean).join(" · ");
    return h("button", { class: "row", type: "button", onclick: function () { go({ name: "song", id: s.id }, "write"); } },
      h("span", { class: "cov" }, UI.coverFor(s, al)),
      h("span", { class: "rt" }, h("b", { text: s.title || "Untitled" }), h("span", { text: sub })),
      h("span", { class: "rm", text: s.streams ? UI.fmtCompact(s.streams) + " streams" : (st.lines ? UI.plural(st.lines, "line") : UI.fmtDate(s.updated)) }));
  }

  function songsScreen() {
    var songs = Store.all("song").sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    var box = h("div");
    function fill() {
      box.textContent = "";
      var q = S.q.trim().toLowerCase();
      var shown = q ? songs.filter(function (s) { return ((s.title || "") + " " + (s.artist || "") + " " + (s.feat || "") + " " + (s.lyrics || "")).toLowerCase().indexOf(q) >= 0; }) : songs;
      if (!shown.length) { box.append(h("p", { class: "hint", text: "Nothing matches that search." })); return; }
      shown.forEach(function (s) { box.append(songRow(s)); });
    }
    var wrap = h("div", null,
      top("Songs", h("button", { class: "btn pri", type: "button", onclick: function () { newSong(); } }, "New song")));
    if (!songs.length) { wrap.append(emptyState("songs")); }
    else {
      wrap.append(h("input", { class: "field search", id: "q", type: "search", placeholder: "Search titles and lyrics", value: S.q,
        oninput: function (e) { S.q = e.target.value; fill(); } }));
      fill();
      wrap.append(box);
    }
    wrap.append(footer());
    return wrap;
  }

  function albumsScreen() {
    var albums = Store.all("album").sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    var wrap = h("div", null, top("Albums", h("button", { class: "btn pri", type: "button", onclick: newAlbum }, "New album")));
    if (!albums.length) { wrap.append(emptyState("albums")); }
    else {
      var grid = h("div", { class: "grid" });
      albums.forEach(function (a) {
        var n = tracksOf(a.id).length;
        grid.append(h("button", { class: "card", type: "button", onclick: function () { go({ name: "album", id: a.id }, "page"); } },
          h("span", { class: "cov" }, UI.coverFor(a)),
          h("b", { text: a.title || "Untitled album" }),
          h("span", { text: [a.artist || "No artist", UI.releaseYear(a)].filter(Boolean).join(" · ") }),
          h("span", { text: UI.plural(n, "song") })));
      });
      wrap.append(grid);
    }
    wrap.append(footer());
    return wrap;
  }

  function moveTrack(albumId, from, to) {
    var list = tracksOf(albumId);
    if (to < 0 || to >= list.length) return;
    var item = list.splice(from, 1)[0];
    list.splice(to, 0, item);
    list.forEach(function (s, i) { s.track = i + 1; Store.put(s, 300); });
    render();
  }

  function albumScreen(id) {
    var a = Store.get(id);
    if (!a) { setTab("albums"); return h("div"); }
    var tracks = tracksOf(id);
    var runtime = tracks.reduce(function (n, s) { return n + (Number(s.duration) || 0); }, 0);
    var titleEl = h("h1", { id: "albumTitle", text: a.title || "Untitled album" });
    function leave() {
      if (!(a.title || "").trim() && !tracks.length && !(a.about || "").trim()) removeItem(a);
      goBack("albums");
    }
    var head = h("header", { class: "top" }, h("button", { class: "back", type: "button", onclick: leave }, "‹ Back"), titleEl);

    var title = h("input", { class: "field", id: "aTitle", type: "text", value: a.title || "", placeholder: "Album title", autocomplete: "off" });
    bindField(title, a, "title", function (v) { titleEl.textContent = v.trim() || "Untitled album"; });
    var artist = h("input", { class: "field", id: "aArtist", type: "text", value: a.artist || "", placeholder: "Artist", autocomplete: "off" });
    bindField(artist, a, "artist", rememberArtist);
    var released = dateInput(a, "released", "aReleased");
    var about = h("textarea", { class: "field", id: "aAbout", rows: "3", placeholder: "What is this record about?" });
    about.value = a.about || "";
    bindField(about, a, "about");

    var tl = h("div");
    tracks.forEach(function (s, i) {
      tl.append(h("div", { class: "row", style: "cursor:default" },
        h("span", { class: "rm", style: "width:22px", text: String(i + 1).padStart(2, "0") }),
        h("button", { class: "rt", type: "button", style: "background:none;border:0;padding:0;text-align:left;cursor:pointer",
          onclick: function () { go({ name: "song", id: s.id }, "write"); } }, h("b", { text: s.title || "Untitled" }),
          h("span", { text: [UI.plural(UI.stats(s.lyrics).lines, "line"), s.duration ? UI.fmtDuration(s.duration) : "",
            s.streams ? UI.fmtCompact(s.streams) + " streams" : ""].filter(Boolean).join(" · ") })),
        h("button", { class: "btn sm ghost", type: "button", "aria-label": "Move up", disabled: i === 0, onclick: function () { moveTrack(id, i, i - 1); } }, "↑"),
        h("button", { class: "btn sm ghost", type: "button", "aria-label": "Move down", disabled: i === tracks.length - 1, onclick: function () { moveTrack(id, i, i + 1); } }, "↓"),
        h("button", { class: "btn sm ghost", type: "button", "aria-label": "Remove from album", onclick: function () {
          s.albumId = null; s.track = null; Store.put(s, 100);
          tracksOf(id).forEach(function (t, k) { t.track = k + 1; Store.put(t, 300); });
          render();
        } }, "✕")));
    });
    if (!tracks.length) tl.append(h("p", { class: "hint", text: "No songs on this album yet." }));

    var loose = Store.all("song").filter(function (s) { return !s.albumId; });
    var add = h("div", { class: "two", style: "grid-template-columns:minmax(0,1fr) auto" });
    if (loose.length) {
      var sel = h("select", { class: "field", id: "addSong", "aria-label": "Song to add" },
        h("option", { value: "", text: "Add an existing song…" }),
        loose.map(function (s) { return h("option", { value: s.id, text: s.title || "Untitled" }); }));
      add.append(sel, h("button", { class: "btn", type: "button", onclick: function () {
        var s = Store.get(sel.value);
        if (!s) return;
        s.albumId = id; s.track = tracksOf(id).length + 1; Store.put(s, 100); render();
      } }, "Add"));
    }

    return h("div", null, head, h("div", { class: "stack" },
      coverPicker(a, null, { big: true }),
      h("div", null, h("label", { class: "lbl", for: "aTitle" }, "Title"), title),
      h("div", null, h("label", { class: "lbl", for: "aArtist" }, "Artist"), artist),
      h("div", null, h("label", { class: "lbl", for: "aReleased" }, "Released"), released,
        a.year && !a.released ? h("p", { class: "hint", text: "Year on file: " + a.year + ". Pick a date to replace it." }) : null),
      h("div", null, h("label", { class: "lbl", for: "aAbout" }, "About"), about),
      h("div", null, h("span", { class: "lbl", text: "Tracklist · " + UI.plural(tracks.length, "song") +
        (runtime ? " · " + UI.fmtDuration(runtime) : "") }), tl),
      add.childNodes.length ? add : null,
      h("div", { class: "btns" },
        h("button", { class: "btn pri", type: "button", onclick: function () { newSong(id); } }, "New song on this album"),
        twoStep("Delete album", "Tap again to delete", function () {
          tracks.forEach(function (s) { s.albumId = null; s.track = null; Store.put(s, 100); });
          removeItem(a);
          setTab("albums");
        })),
      h("p", { class: "hint", id: "status", text: syncText() })));
  }

  // Finished, read-only view of an album.
  function albumPage(id) {
    var a = Store.get(id);
    if (!a) { setTab("albums"); return h("div"); }
    var tracks = tracksOf(id);
    var runtime = tracks.reduce(function (n, s) { return n + (Number(s.duration) || 0); }, 0);
    var streams = tracks.reduce(function (n, s) { return n + (Number(s.streams) || 0); }, 0);
    var head = h("header", { class: "top" }, h("button", { class: "back", type: "button", onclick: function () { goBack("albums"); } }, "‹ Back"),
      h("h1", { text: "Album page" }));

    var by = h("p");
    var art = App.findArtist(a.artist);
    if (art) by.append(h("button", { class: "linkbtn", type: "button", text: a.artist, onclick: function () { go({ name: "artist", id: art.id }, "page"); } }));
    else by.append(document.createTextNode(a.artist || "No artist"));

    var facts = [];
    var rel = UI.releaseText(a);
    if (rel) facts.push("Released " + rel);
    facts.push(UI.plural(tracks.length, "song"));
    if (runtime) facts.push(UI.fmtDuration(runtime));
    if (streams) facts.push(UI.fmtFull(streams) + " streams");

    var wrap = h("div", null, head,
      h("div", { class: "hero" }, h("span", { class: "cov" }, UI.coverFor(a)),
        h("div", null, h("h2", { text: (a.title || "").trim() || "Untitled album" }), by)),
      h("div", { class: "facts" }, facts.map(function (t) { return h("span", { text: t }); })));

    if ((a.about || "").trim()) wrap.append(h("div", { class: "blk" }, h("h3", { text: "About" }), h("p", { class: "about", text: a.about.trim() })));

    var list = h("div", { class: "blk" }, h("h3", { text: "Tracklist" }));
    if (!tracks.length) list.append(h("p", { class: "hint", text: "No songs on this album yet. Switch to Edit to add some." }));
    tracks.forEach(function (s, i) {
      var parts = [];
      if (s.artist && UI.nameKey(s.artist) !== UI.nameKey(a.artist)) parts.push(s.artist);
      var f = UI.featNames(s);
      if (f) parts.push("feat. " + f);
      if (s.streams) parts.push(UI.fmtCompact(s.streams) + " streams");
      list.append(h("button", { class: "row", type: "button", onclick: function () { go({ name: "song", id: s.id }, "page"); } },
        h("span", { class: "rm", style: "width:22px", text: String(i + 1).padStart(2, "0") }),
        h("span", { class: "rt" }, h("b", { text: s.title || "Untitled" }), h("span", { text: parts.join(" · ") })),
        h("span", { class: "rm", text: s.duration ? UI.fmtDuration(s.duration) : "" })));
    });
    wrap.append(list);
    return wrap;
  }

  function renderBar() {
    bar.textContent = "";
    if (S.view && S.view.name === "song") { App.songBar("Write"); return; }
    if (S.view && S.view.name === "artist") { App.songBar("Edit"); return; }
    if (S.view && S.view.name === "album") { App.songBar("Edit"); return; }
    bar.hidden = false;
    var inner = h("div", { class: "bar-in" });
    inner.style.setProperty("--n", "3");
    [["songs", "Songs"], ["albums", "Albums"], ["artists", "Artists"]].forEach(function (t) {
      inner.append(h("button", { class: "seg", type: "button", "aria-current": String(S.tab === t[0]), onclick: function () { setTab(t[0]); } }, t[1]));
    });
    bar.append(inner);
  }

  function render() {
    sheetRoot.textContent = "";
    app.textContent = "";
    var v = S.view;
    if (!v) app.append(S.tab === "albums" ? albumsScreen() : S.tab === "artists" ? App.artistsScreen() : songsScreen());
    else if (v.name === "album") app.append(S.mode === "page" ? albumPage(v.id) : albumScreen(v.id));
    else if (v.name === "artist") App.renderArtist(v.id);
    else if (v.name === "song") App.renderSong(v.id);
    renderBar();
  }

  Store.subscribe(function () {
    updateStatus();
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    if (S.view && S.view.name === "song") return;
    render();
  });

  window.App = {
    S: S, h: h, go: go, goBack: goBack, songRow: songRow, setTab: setTab, render: render, toast: toast, top: top, twoStep: twoStep, bindField: bindField,
    removeItem: removeItem, countInput: countInput, durationInput: durationInput, dateInput: dateInput, footer: footer, historyBlock: historyBlock, chartBlock: chartBlock, coverPicker: coverPicker, albumOf: albumOf, tracksOf: tracksOf, rememberArtist: rememberArtist, syncText: syncText, updateStatus: updateStatus, app: app, bar: bar,
    sheetRoot: sheetRoot,
    start: function () {
      Store.init();
      // Ask the browser not to clear our data when the phone is short on space.
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
      var last = 0;
      document.addEventListener("linernotes-storage-error", function () {
        if (Date.now() - last < 15000) return;
        last = Date.now();
        toast("Couldn't save on this device. Storage is full. Download a backup now.");
      });
      render();
    }
  };
})();
