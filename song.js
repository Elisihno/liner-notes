/* Song screens: the lyrics editor (Write), the finished lyric page (Page) and the annotation sheet. */
(function () {
  var h = UI.h;
  var S = App.S;
  var SECTIONS = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Outro"];

  function isBlankSong(s) {
    return !(s.title || "").trim() && !(s.lyrics || "").trim() && !(s.about || "").trim();
  }
  function back(s) {
    if (isBlankSong(s)) App.removeItem(s);
    App.goBack(S.tab);
  }

  function insertSection(ta, name) {
    var text = ta.value;
    var pos = ta.selectionStart == null ? text.length : ta.selectionStart;
    var label = name;
    if (name === "Verse") label = "Verse " + ((text.match(/^\s*\[Verse\b/gim) || []).length + 1);
    var before = text.slice(0, pos), after = text.slice(pos);
    var lead = before.length === 0 ? "" : (/\n\n$/.test(before) ? "" : (/\n$/.test(before) ? "\n" : "\n\n"));
    var ins = lead + "[" + label + "]\n";
    ta.value = before + ins + after;
    var c = (before + ins).length;
    ta.focus();
    ta.setSelectionRange(c, c);
    ta.dispatchEvent(new Event("input"));
  }

  function countsText(s) {
    var st = UI.stats(s.lyrics);
    return [UI.plural(st.lines, "line"), UI.plural(st.words, "word"), UI.plural(st.sections, "section")];
  }

  function writeView(s) {
    var titleTop = h("h1", { text: (s.title || "").trim() || "Untitled" });
    var head = h("header", { class: "top" }, h("button", { class: "back", type: "button", onclick: function () { back(s); } }, "‹ Back"), titleTop);

    var title = h("input", { class: "title-in", id: "sTitle", type: "text", value: s.title || "", placeholder: "Song title", autocomplete: "off", "aria-label": "Song title" });
    App.bindField(title, s, "title", function (v) { titleTop.textContent = v.trim() || "Untitled"; });

    var artist = h("input", { class: "field", id: "sArtist", type: "text", value: s.artist || "", placeholder: "Artist", autocomplete: "off" });
    App.bindField(artist, s, "artist", App.rememberArtist);
    var feat = h("input", { class: "field", id: "sFeat", type: "text", value: s.feat || "", placeholder: "Featured artists, separated by commas", autocomplete: "off" });
    App.bindField(feat, s, "feat");
    var released = App.dateInput(s, "released", "sReleased");
    var length = App.durationInput(s, "duration", "sLength", "Length, e.g. 3:45");
    var streams = App.countInput(s, "streams", "sStreams", "Total streams", "streamsLog");

    var albums = Store.all("album").sort(function (a, b) { return (a.title || "").localeCompare(b.title || ""); });
    var albumSel = h("select", { class: "field", id: "sAlbum" },
      h("option", { value: "", text: "Single (no album)" }),
      albums.map(function (a) { return h("option", { value: a.id, text: a.title || "Untitled album", selected: a.id === s.albumId }); }));
    albumSel.addEventListener("change", function () {
      s.albumId = albumSel.value || null;
      s.track = s.albumId ? App.tracksOf(s.albumId).filter(function (t) { return t.id !== s.id; }).length + 1 : null;
      Store.put(s, 100);
      trackWrap.hidden = !s.albumId;
      track.value = s.track == null ? "" : s.track;
      paintCover();
    });

    var coverBlock = h("div");
    function paintCover() {
      coverBlock.textContent = "";
      coverBlock.append(h("span", { class: "lbl", text: "Cover" }), App.coverPicker(s, App.albumOf(s)));
    }
    paintCover();

    var ta = h("textarea", { class: "ta", id: "sLyrics", spellcheck: "false",autocapitalize: "sentences", "aria-label": "Lyrics",
      placeholder: "[Verse 1]\nStart writing here…" });
    ta.value = s.lyrics || "";
    var counts = h("div", { class: "counts" });
    function paintCounts() {
      counts.textContent = "";
      countsText(s).forEach(function (t) { counts.append(h("span", { text: t })); });
      counts.append(h("span", { id: "status", text: App.syncText() }));
    }
    function grow() { ta.style.height = "auto"; ta.style.height = (ta.scrollHeight + 2) + "px"; }
    ta.addEventListener("input", function () {
      s.lyrics = ta.value;
      Store.put(s);
      grow();
      paintCounts();
    });

    var chips = h("div", { class: "chips" }, SECTIONS.map(function (n) {
      return h("button", { class: "chip", type: "button", onclick: function () { insertSection(ta, n); } }, "+ " + n);
    }));

    var about = h("textarea", { class: "field", id: "sAbout", rows: "4", placeholder: "What is this song about? This shows on the page." });
    about.value = s.about || "";
    App.bindField(about, s, "about");
    var credits = h("textarea", { class: "field", id: "sCredits", rows: "3", placeholder: "Written by — Name\nProduced by — Name" });
    credits.value = s.credits || "";
    App.bindField(credits, s, "credits");
    var track = h("input", { class: "field", id: "sTrack", type: "number", inputmode: "numeric", value: s.track == null ? "" : s.track, placeholder: "Track number" });
    App.bindField(track, s, "track");
    var trackWrap = h("div", { hidden: !s.albumId }, h("label", { class: "lbl", for: "sTrack" }, "Track number"), track);

    var el = h("div", null, head, h("div", { class: "stack" },
      title,
      h("div", { class: "two" },
        h("div", null, h("label", { class: "lbl", for: "sArtist" }, "Artist"), artist),
        h("div", null, h("label", { class: "lbl", for: "sAlbum" }, "Album"), albumSel)),
      h("div", null, h("label", { class: "lbl", for: "sFeat" }, "Featuring"), feat),
      h("div", null, h("label", { class: "lbl", for: "sReleased" }, "Released"), released,
        h("p", { class: "hint", text: "On an album? Leave this empty to use the album's date." })),
      h("div", null, h("label", { class: "lbl", for: "sLength" }, "Length"), length),
      h("div", null, h("label", { class: "lbl", for: "sStreams" }, "Streams"), streams),
      App.historyBlock(s, "streams", "streamsLog", "Streams history"),
      coverBlock,
      h("div", null, h("span", { class: "lbl", text: "Insert a section" }), chips),
      ta, counts,
      App.rhymePanel(ta),
      h("details", { class: "more" }, h("summary", { text: "About and credits" }),
        h("div", { class: "inner" },
          h("div", null, h("label", { class: "lbl", for: "sAbout" }, "About"), about),
          h("div", null, h("label", { class: "lbl", for: "sCredits" }, "Credits, one per line"), credits),
          trackWrap)),
      h("div", { class: "btns" }, App.twoStep("Delete song", "Tap again to delete", function () {
        App.removeItem(s);
        App.setTab(S.tab);
      }))));
    paintCounts();
    requestAnimationFrame(grow);
    return el;
  }

  function findNote(s, key) {
    var list = s.notes || [];
    for (var i = 0; i < list.length; i++) if (list[i].line === key) return list[i];
    return null;
  }

  function closeSheet() {
    App.sheetRoot.textContent = "";
    S.sheet = null;
    document.querySelectorAll(".ln.sel").forEach(function (b) { b.classList.remove("sel"); });
  }

  function openSheet(s, lineText, btn) {
    closeSheet();
    var key = UI.lineKey(lineText);
    S.sheet = { key: key };
    btn.classList.add("sel");
    var note = findNote(s, key);
    var ta = h("textarea", { class: "field", id: "noteText", rows: "4", "aria-label": "Annotation",
      placeholder: "What does this line mean? Add context, references or wordplay." });
    ta.value = note ? note.text : "";
    function repaint() {
      var y = window.scrollY;
      App.render();
      window.scrollTo(0, y);
    }
    var actions = h("div", { class: "btns" },
      h("button", { class: "btn pri", type: "button", onclick: function () {
        var text = ta.value.trim();
        s.notes = (s.notes || []).filter(function (n) { return n.line !== key; });
        if (text) s.notes.push({ line: key, text: text });
        Store.put(s, 100);
        repaint();
      } }, "Save"),
      note ? App.twoStep("Delete", "Tap again to delete", function () {
        s.notes = (s.notes || []).filter(function (n) { return n.line !== key; });
        Store.put(s, 100);
        repaint();
      }) : null,
      h("button", { class: "btn ghost", type: "button", onclick: closeSheet }, "Close"));
    App.sheetRoot.append(
      h("div", { class: "scrim", onclick: closeSheet }),
      h("div", { class: "sheet", role: "dialog", "aria-label": "Annotate line" }, h("div", { class: "sheet-in" },
        h("span", { class: "lbl", text: note ? "Annotation" : "New annotation" }),
        h("blockquote", { class: "quote", text: lineText.trim() }),
        ta, actions)));
    ta.focus();
  }

  function parseCredits(text) {
    return String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) {
      var m = l.match(/^(.+?)\s*(?:—|–|:|\s-\s)\s*(.+)$/);
      return m ? { role: m[1], name: m[2] } : { role: "Credit", name: l };
    });
  }

  function pageView(s) {
    var al = App.albumOf(s);
    var st = UI.stats(s.lyrics);
    var head = h("header", { class: "top" }, h("button", { class: "back", type: "button", onclick: function () { back(s); } }, "‹ Back"),
      h("h1", { text: "Lyric page" }));

    var by = h("p");
    var art = App.findArtist(s.artist);
    if (art) {
      by.append(h("button", { class: "linkbtn", type: "button", text: s.artist,
        onclick: function () { App.go({ name: "artist", id: art.id }, "page"); } }));
    } else {
      by.append(document.createTextNode(s.artist || "No artist"));
    }
    var featured = UI.featNames(s);
    if (featured) by.append(document.createTextNode(" (feat. " + featured + ")"));
    by.append(document.createTextNode(" · "));
    if (al) {
      by.append(h("button", { class: "linkbtn", type: "button", text: al.title || "Untitled album",
        onclick: function () { App.go({ name: "album", id: al.id }, "page"); } }));
    } else {
      by.append(document.createTextNode("Single"));
    }
    var hero = h("div", { class: "hero" },
      h("span", { class: "cov" }, UI.coverFor(s, al)),
      h("div", null, h("h2", { text: (s.title || "").trim() || "Untitled" }), by));

    var facts = [];
    if (s.duration) facts.push(UI.fmtDuration(s.duration));
    if (s.streams) facts.push(UI.fmtFull(s.streams) + " streams");
    if (al && s.track) facts.push("Track " + s.track);
    var rel = UI.releaseText(s, al);
    if (rel) facts.push("Released " + rel);
    facts.push(UI.plural(st.lines, "line"), UI.plural(st.words, "word"));
    if (s.updated) facts.push("Edited " + UI.fmtDate(s.updated));
    var factRow = h("div", { class: "facts" }, facts.map(function (t) { return h("span", { text: t }); }));

    var wrap = h("div", null, head, hero, factRow);

    if ((s.about || "").trim()) wrap.append(h("div", { class: "blk" }, h("h3", { text: "About" }), h("p", { class: "about", text: s.about.trim() })));

    var cr = parseCredits(s.credits);
    if (featured && !cr.some(function (c) { return /^featur/i.test(c.role); })) cr.unshift({ role: "Featuring", name: featured });
    if (cr.length) {
      var dl = h("dl", { class: "credits" });
      cr.forEach(function (c) { dl.append(h("dt", { text: c.role }), h("dd", { text: c.name })); });
      wrap.append(h("div", { class: "blk" }, h("h3", { text: "Credits" }), dl));
    }

    var growth = App.chartBlock("Streams over time", s.streamsLog);
    if (growth) wrap.append(growth);

    var lyricHead = h("div", { class: "blk", style: "display:flex;align-items:center;gap:10px" },
      h("h3", { style: "margin:0;flex:1", text: "Lyrics" }),
      h("button", { class: "btn sm", type: "button", onclick: function () {
        var done = function () { App.toast("Lyrics copied"); };
        var fail = function () { App.toast("Copy isn't available here"); };
        try { navigator.clipboard.writeText(s.lyrics || "").then(done, fail); } catch (e) { fail(); }
      } }, "Copy"));
    wrap.append(lyricHead);

    var secs = UI.parseLyrics(s.lyrics);
    var notes = (s.notes || []).length;
    if (!secs.length) {
      wrap.append(h("p", { class: "hint", text: "No lyrics yet. Switch to Write to start the first verse." }));
    } else {
      wrap.append(h("p", { class: "hint", text: notes ? UI.plural(notes, "annotation") + ". Tap a highlighted line to read it, or any line to add one." : "Tap any line to add an annotation." }));
      var lyr = h("div");
      secs.forEach(function (sec) {
        if (sec.name) lyr.append(h("div", { class: "sec-h", text: sec.name }));
        sec.lines.forEach(function (line) {
          if (!line.trim()) { lyr.append(h("div", { class: "ln gap", "aria-hidden": "true" })); return; }
          var has = !!findNote(s, UI.lineKey(line));
          var b = h("button", { class: "ln" + (has ? " has" : ""), type: "button", text: line.trim() });
          b.addEventListener("click", function () { openSheet(s, line, b); });
          lyr.append(b);
        });
      });
      wrap.append(lyr);
    }
    return wrap;
  }

  App.renderSong = function (id) {
    var s = Store.get(id);
    if (!s) { App.setTab(S.tab); return; }
    App.app.append(S.mode === "page" ? pageView(s) : writeView(s));
  };

  App.songBar = function (firstLabel) {
    var bar = App.bar;
    bar.textContent = "";
    bar.hidden = false;
    var inner = h("div", { class: "bar-in" });
    [["write", firstLabel || "Write"], ["page", "Page"]].forEach(function (m) {
      inner.append(h("button", { class: "seg", type: "button", "aria-current": String(S.mode === m[0]), onclick: function () {
        if (S.mode === m[0]) return;
        S.mode = m[0];
        App.render();
        window.scrollTo(0, 0);
      } }, m[1]));
    });
    bar.append(inner);
  };

  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && S.sheet) closeSheet(); });

  App.start();
})();
