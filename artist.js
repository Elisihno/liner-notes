/* Artists: a list, an edit screen (photo, name, bio) and a profile page that gathers their songs and albums.
   Songs link to an artist by name, so renaming an artist renames it on their songs too. */
(function () {
  var h = UI.h;
  var S = App.S;
  var nk = UI.nameKey;

  function featKeys(song) {
    return String(song.feat || "").split(",").map(nk).filter(Boolean);
  }
  function findArtist(name) {
    var k = nk(name);
    if (!k) return null;
    var all = Store.all("artist");
    for (var i = 0; i < all.length; i++) if (nk(all[i].name) === k) return all[i];
    return null;
  }
  function songsBy(artist) {
    var k = nk(artist.name);
    if (!k) return [];
    return Store.all("song").filter(function (s) { return nk(s.artist) === k || featKeys(s).indexOf(k) >= 0; });
  }
  function albumsBy(artist) {
    var k = nk(artist.name);
    if (!k) return [];
    var onAlbum = {};
    Store.all("song").forEach(function (s) { if (s.albumId && nk(s.artist) === k) onAlbum[s.albumId] = true; });
    return Store.all("album").filter(function (a) { return nk(a.artist) === k || onAlbum[a.id]; });
  }
  var viewTab = {};
  // Combined streams over time: at each date, add each song's latest value up to that date.
  function streamSeries(songs) {
    var logs = songs.map(function (s) {
      return (s.streamsLog || []).slice().sort(function (x, y) { return x.d < y.d ? -1 : x.d > y.d ? 1 : 0; });
    }).filter(function (l) { return l.length; });
    var days = {};
    logs.forEach(function (l) { l.forEach(function (e) { days[e.d] = true; }); });
    return Object.keys(days).sort().map(function (d) {
      var total = 0;
      logs.forEach(function (l) {
        var v = null;
        for (var i = 0; i < l.length && l[i].d <= d; i++) v = l[i].n;
        if (v != null) total += v;
      });
      return { d: d, n: total };
    });
  }
  function totalStreams(songs) {
    return songs.reduce(function (n, s) { return n + (Number(s.streams) || 0); }, 0);
  }
  function summary(artist) {
    var songs = songsBy(artist);
    var parts = [];
    if (artist.listeners) parts.push(UI.fmtCompact(artist.listeners) + " listeners");
    parts.push(UI.plural(songs.length, "song"));
    var t = totalStreams(songs);
    if (t) parts.push(UI.fmtCompact(t) + " streams");
    return parts.join(" · ");
  }

  function createArtist(name) {
    var a = { kind: "artist", id: Store.newId("r"), name: name || "", about: "", imageId: null };
    Store.put(a, 50);
    App.go({ name: "artist", id: a.id }, "write");
  }

  function renameEverywhere(oldName, newName) {
    var ok = nk(oldName), nn = String(newName || "").trim();
    if (!ok || !nn || ok === nk(nn)) return;
    Store.all("song").forEach(function (s) {
      var changed = false;
      if (nk(s.artist) === ok) { s.artist = nn; changed = true; }
      if (s.feat) {
        var parts = s.feat.split(",").map(function (x) { return x.trim(); });
        var next = parts.map(function (x) { return nk(x) === ok ? nn : x; }).join(", ");
        if (next !== parts.join(", ")) { s.feat = next; changed = true; }
      }
      if (changed) Store.put(s, 300);
    });
    Store.all("album").forEach(function (a) {
      if (nk(a.artist) === ok) { a.artist = nn; Store.put(a, 300); }
    });
  }

  function artistRow(a) {
    return h("button", { class: "row", type: "button", onclick: function () { App.go({ name: "artist", id: a.id }, "page"); } },
      h("span", { class: "cov round" }, UI.avatarFor(a)),
      h("span", { class: "rt" }, h("b", { text: a.name || "Untitled artist" }), h("span", { text: summary(a) })));
  }

  App.findArtist = findArtist;

  App.artistsScreen = function () {
    var artists = Store.all("artist").sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
    var wrap = h("div", null, App.top("Artists", h("button", { class: "btn pri", type: "button", onclick: function () { createArtist(""); } }, "New artist")));

    // Names already used on songs and albums that have no page yet.
    var have = {};
    artists.forEach(function (a) { have[nk(a.name)] = true; });
    var seen = {}, names = [];
    function consider(n) {
      var t = String(n || "").trim(), k = nk(t);
      if (!k || have[k] || seen[k]) return;
      seen[k] = true;
      names.push(t);
    }
    Store.all("song").forEach(function (s) { consider(s.artist); String(s.feat || "").split(",").forEach(consider); });
    Store.all("album").forEach(function (a) { consider(a.artist); });

    if (!artists.length) {
      wrap.append(h("div", { class: "empty" }, h("h2", { text: "Give an artist a page" }),
        h("p", { text: "Write a bio, add a profile photo, and see all of their songs and streams in one place." }),
        h("div", { class: "btns" }, h("button", { class: "btn pri", type: "button", onclick: function () { createArtist(""); } }, "New artist"))));
    } else {
      artists.forEach(function (a) { wrap.append(artistRow(a)); });
    }
    if (names.length) {
      var chips = h("div", { class: "chips" });
      names.slice(0, 12).forEach(function (n) {
        chips.append(h("button", { class: "chip", type: "button", onclick: function () { createArtist(n); } }, "+ " + n));
      });
      wrap.append(h("div", { class: "sugg" }, h("span", { class: "lbl", text: "Used in your songs, no page yet" }), chips));
    }
    wrap.append(App.footer());
    return wrap;
  };

  function editView(a) {
    var titleEl = h("h1", { text: (a.name || "").trim() || "Untitled artist" });
    function leave() {
      if (!(a.name || "").trim() && !(a.about || "").trim()) App.removeItem(a);
      App.goBack("artists");
    }
    var head = h("header", { class: "top" }, h("button", { class: "back", type: "button", onclick: leave }, "‹ Back"), titleEl);

    var committed = a.name || "";
    var name = h("input", { class: "field", id: "rName", type: "text", value: a.name || "", placeholder: "Artist name", autocomplete: "off" });
    App.bindField(name, a, "name", function (v) { titleEl.textContent = v.trim() || "Untitled artist"; });
    name.addEventListener("change", function () {
      renameEverywhere(committed, a.name);
      committed = a.name || "";
    });
    var listeners = App.countInput(a, "listeners", "rListeners", "Monthly listeners", "listenersLog");
    var about = h("textarea", { class: "field", id: "rAbout", rows: "7", placeholder: "Who are they? Where are they from, what do they sound like, what should people know?" });
    about.value = a.about || "";
    App.bindField(about, a, "about");

    var songs = songsBy(a);
    return h("div", null, head, h("div", { class: "stack" },
      App.coverPicker(a, null, { big: true, round: true }),
      h("div", null, h("label", { class: "lbl", for: "rName" }, "Name"), name,
        h("p", { class: "hint", text: "Songs and albums with this exact name appear on the page. Renaming updates them too." })),
      h("div", null, h("label", { class: "lbl", for: "rListeners" }, "Monthly listeners"), listeners),
      App.historyBlock(a, "listeners", "listenersLog", "Listeners history"),
      h("div", null, h("label", { class: "lbl", for: "rAbout" }, "About"), about),
      h("p", { class: "hint", text: summary(a) + ". Switch to Page to see the finished profile." }),
      h("div", { class: "btns" }, App.twoStep("Delete artist page", "Tap again to delete", function () {
        App.removeItem(a);
        App.setTab("artists");
      })),
      songs.length ? h("p", { class: "hint", text: "Deleting the page keeps their songs." }) : null));
  }

  function pageView(a) {
    var songs = songsBy(a).sort(function (x, y) {
      return (Number(y.streams) || 0) - (Number(x.streams) || 0) || (x.title || "").localeCompare(y.title || "");
    });
    var albums = albumsBy(a);
    var total = totalStreams(songs);
    var head = h("header", { class: "top" }, h("button", { class: "back", type: "button", onclick: function () { App.goBack("artists"); } }, "‹ Back"),
      h("h1", { text: "Artist page" }));

    var facts = [UI.plural(songs.length, "song"), UI.plural(albums.length, "album")];
    if (total) facts.push(UI.fmtFull(total) + " streams");

    var wrap = h("div", null, head,
      h("div", { class: "hero" },
        h("span", { class: "cov round" }, UI.avatarFor(a)),
        h("div", null, h("h2", { text: (a.name || "").trim() || "Untitled artist" }),
          a.listeners ? h("p", { text: UI.fmtFull(a.listeners) + " monthly listeners" }) : null)),
      h("div", { class: "facts" }, facts.map(function (t) { return h("span", { text: t }); })));

    if ((a.about || "").trim()) wrap.append(h("div", { class: "blk" }, h("h3", { text: "About" }), h("p", { class: "about", text: a.about.trim() })));

    var lc = App.chartBlock("Monthly listeners", a.listenersLog);
    if (lc) wrap.append(lc);
    var sc = App.chartBlock("Total streams", streamSeries(songs), "Counts songs that have a history");
    if (sc) wrap.append(sc);

    // Popular (every song by streams), Singles (songs with no album) and Albums.
    var singles = songs.filter(function (s) { return !s.albumId; }).sort(function (x, y) {
      return UI.releaseSort(y) - UI.releaseSort(x) || (Number(y.streams) || 0) - (Number(x.streams) || 0);
    });
    albums.sort(function (x, y) { return UI.releaseSort(y) - UI.releaseSort(x); });
    var tabs = [["popular", "Popular", songs.length], ["singles", "Singles", singles.length], ["albums", "Albums", albums.length]];
    var cur = viewTab[a.id] || "popular";
    var tabRow = h("div", { class: "tabs", role: "tablist" });
    var body = h("div", { class: "tabbody" });

    function songList(list, emptyText) {
      if (!list.length) return [h("p", { class: "hint", text: emptyText })];
      return list.map(function (s) { return App.songRow(s); });
    }
    function albumGrid() {
      if (!albums.length) return [h("p", { class: "hint", text: "No albums yet. Albums with this artist's name, or with one of their songs on them, show up here." })];
      var grid = h("div", { class: "grid" });
      albums.forEach(function (al) {
        var tr = App.tracksOf(al.id);
        var st = totalStreams(tr);
        grid.append(h("button", { class: "card", type: "button", onclick: function () { App.go({ name: "album", id: al.id }, "page"); } },
          h("span", { class: "cov" }, UI.coverFor(al)),
          h("b", { text: al.title || "Untitled album" }),
          h("span", { text: [UI.releaseYear(al), UI.plural(tr.length, "song")].filter(Boolean).join(" · ") }),
          st ? h("span", { text: UI.fmtCompact(st) + " streams" }) : null));
      });
      return [grid];
    }
    function paint() {
      tabRow.textContent = "";
      tabs.forEach(function (t) {
        tabRow.append(h("button", { class: "tab", type: "button", role: "tab", "aria-selected": String(cur === t[0]),
          onclick: function () { cur = t[0]; viewTab[a.id] = cur; paint(); } }, t[1] + " ", h("span", { text: String(t[2]) })));
      });
      body.textContent = "";
      var items = cur === "albums" ? albumGrid()
        : cur === "singles" ? songList(singles, "No singles yet. Songs that aren't on an album show up here.")
        : songList(songs, "No songs yet. A song shows up here when its Artist or Featuring field matches this name.");
      items.forEach(function (n) { body.append(n); });
    }
    paint();
    wrap.append(tabRow, body);
    return wrap;
  }

  App.renderArtist = function (id) {
    var a = Store.get(id);
    if (!a) { App.setTab("artists"); return; }
    App.app.append(S.mode === "page" ? pageView(a) : editView(a));
  };
})();
