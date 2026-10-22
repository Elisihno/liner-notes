/* Small helpers: DOM builder, generated cover art, lyric parsing. */
(function () {
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (tag === "input" || tag === "textarea") {
      // No red squiggles under lyrics, names or slang.
      el.setAttribute("spellcheck", "false");
      el.setAttribute("autocorrect", "off");
    }
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else if (k === "value") el.value = v;
        else if (v === true) el.setAttribute(k, "");
        else el.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null && x !== false) el.append(x); });
      else el.append(c);
    }
    return el;
  }

  var PALETTES = [
    ["#2B35F5", "#FFC9E2", "#15171D"],
    ["#15171D", "#F2F2F2", "#FF5A36"],
    ["#FF5A36", "#15171D", "#FFF1DE"],
    ["#0F6B5C", "#E6F26B", "#0B2B26"],
    ["#F2F2F2", "#2B35F5", "#15171D"],
    ["#7A2E8F", "#FFD166", "#F2F2F2"],
    ["#F6C945", "#15171D", "#2B35F5"],
    ["#C7D2E0", "#15171D", "#E8542C"]
  ];
  var NS = "http://www.w3.org/2000/svg";

  function hash(str) {
    var n = 0;
    for (var i = 0; i < str.length; i++) n = (n * 31 + str.charCodeAt(i)) >>> 0;
    return n;
  }
  function svgEl(name, attrs) {
    var el = document.createElementNS(NS, name);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  // Cover art is drawn from a number, so nothing about it needs storing.
  function cover(index) {
    var i = ((index % 64) + 64) % 64;
    var p = PALETTES[i % 8];
    var pattern = Math.floor(i / 8) % 8;
    var bg = p[0], a = p[1], b = p[2];
    var svg = svgEl("svg", { viewBox: "0 0 100 100", "aria-hidden": "true", preserveAspectRatio: "xMidYMid slice" });
    svg.append(svgEl("rect", { width: 100, height: 100, fill: bg }));
    var k;
    if (pattern === 0) {
      svg.append(svgEl("circle", { cx: 50, cy: 54, r: 30, fill: a }));
      svg.append(svgEl("circle", { cx: 72, cy: 30, r: 11, fill: b }));
    } else if (pattern === 1) {
      for (k = 0; k < 6; k++) svg.append(svgEl("rect", { x: 0, y: 8 + k * 16, width: 100, height: 8, fill: k % 2 ? a : b }));
    } else if (pattern === 2) {
      for (k = 0; k < 25; k++) svg.append(svgEl("circle", { cx: 14 + (k % 5) * 18, cy: 14 + Math.floor(k / 5) * 18, r: k % 7 === 0 ? 7 : 4, fill: k % 7 === 0 ? b : a }));
    } else if (pattern === 3) {
      svg.append(svgEl("path", { d: "M0 100 L100 0 L100 100 Z", fill: a }));
      svg.append(svgEl("path", { d: "M18 82 a22 22 0 0 1 44 0 Z", fill: b }));
    } else if (pattern === 4) {
      for (k = 5; k > 0; k--) svg.append(svgEl("circle", { cx: 0, cy: 100, r: k * 20, fill: k % 2 ? a : b }));
    } else if (pattern === 5) {
      for (k = 0; k < 7; k++) { var hh = 25 + ((k * 37) % 60); svg.append(svgEl("rect", { x: 8 + k * 13, y: 100 - hh, width: 9, height: hh, fill: k % 2 ? a : b })); }
    } else if (pattern === 6) {
      svg.append(svgEl("path", { d: "M50 14 L88 82 L12 82 Z", fill: a }));
      svg.append(svgEl("circle", { cx: 50, cy: 58, r: 9, fill: b }));
    } else {
      for (k = 0; k < 16; k++) { var cx = k % 4, cy = Math.floor(k / 4); if ((cx + cy) % 2 === 0) svg.append(svgEl("rect", { x: cx * 25, y: cy * 25, width: 25, height: 25, fill: k % 3 === 0 ? b : a })); }
    }
    return svg;
  }

  function coverIndexFor(item, album) {
    if (item.kind === "album") return typeof item.cover === "number" ? item.cover : hash(item.id);
    if (album) return typeof album.cover === "number" ? album.cover : hash(album.id);
    return hash(item.id) + 3;
  }

  // A song shows its own image, else its album's image, else generated art.
  function imageSrc(item, album) {
    var im = item.imageId ? Store.get(item.imageId) : null;
    if (!im && item.kind === "song" && album && album.imageId) im = Store.get(album.imageId);
    return im && im.data ? im.data : null;
  }
  function coverFor(item, album) {
    var src = imageSrc(item, album);
    if (src) {
      var img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.src = src;
      return img;
    }
    return titleCover(item);
  }

  function wrapWords(words, per, force) {
    var lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      while (w.length > per) {
        if (!force) return null;
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, per));
        w = w.slice(per);
      }
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= per) cur += " " + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Default cover: black, a white outlined square, the title inside it in white.
  function titleCover(item) {
    var words = (String(item.title || "").trim().toUpperCase() || "UNTITLED").split(/\s+/);
    var inner = 58, sizes = [17, 14, 12, 10, 8.5];
    var fs = 0, lines = null, i;
    for (i = 0; i < sizes.length && !lines; i++) {
      var per = Math.max(3, Math.floor(inner / (sizes[i] * 0.64)));
      var tryLines = wrapWords(words, per, false);
      if (tryLines && tryLines.length * sizes[i] * 1.18 <= inner) { fs = sizes[i]; lines = tryLines; }
    }
    if (!lines) {
      fs = 8.5;
      lines = wrapWords(words, Math.floor(inner / (fs * 0.64)), true);
      var maxLines = Math.floor(inner / (fs * 1.18));
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].replace(/.?$/, "…");
      }
    }
    var lh = fs * 1.18;
    var svg = svgEl("svg", { viewBox: "0 0 100 100", "aria-hidden": "true", preserveAspectRatio: "xMidYMid slice" });
    svg.append(svgEl("rect", { width: 100, height: 100, fill: "#000" }));
    svg.append(svgEl("rect", { x: 14, y: 14, width: 72, height: 72, fill: "none", stroke: "#fff", "stroke-width": 2.5 }));
    lines.forEach(function (l, n) {
      var t = svgEl("text", { x: 50, y: 50 - (lines.length * lh) / 2 + lh * (n + 0.5), "text-anchor": "middle", "dominant-baseline": "central",
        fill: "#fff", "font-size": fs, "font-weight": 800, "letter-spacing": "0.02em", "font-family": "Archivo, system-ui, sans-serif" });
      t.textContent = l;
      svg.append(t);
    });
    return svg;
  }

  function nameKey(n) { return String(n || "").trim().toLowerCase().replace(/\s+/g, " "); }
  var COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
  var FULL = new Intl.NumberFormat("en");
  // Reads "1.2M", "350K", "1,5 mn", "1,234,567" or "1.234.567" as a whole number; null when it can't.
  function parseCount(str) {
    var s = String(str == null ? "" : str).trim().toLowerCase().replace(/[\s ']/g, "");
    var m = s.match(/^([0-9][0-9.,]*)([a-z]*)$/);
    if (!m) return null;
    var num = m[1], suf = m[2], mult = 1, v;
    if (suf) {
      if (suf === "k") mult = 1e3;
      else if (/^(m|mn|mio|milj)$/.test(suf)) mult = 1e6;
      else if (/^(b|bn|md|mdr)$/.test(suf)) mult = 1e9;
      else return null;
      if (/^\d+,\d{1,2}$/.test(num)) num = num.replace(",", ".");
      else num = num.replace(/,/g, "");
      if (!/^\d+(\.\d+)?$/.test(num)) return null;
      v = parseFloat(num) * mult;
    } else if (/^\d{1,3}([.,]\d{3})+$/.test(num)) {
      v = parseFloat(num.replace(/[.,]/g, ""));
    } else if (/^\d+([.,]\d+)?$/.test(num)) {
      v = parseFloat(num.replace(",", "."));
    } else return null;
    v = Math.round(v);
    return isFinite(v) && v >= 0 ? v : null;
  }
  // Reads "3:45", "1:02:10", "3.45", "3m45s", "3 min" or "225" (seconds) as seconds; null when it can't.
  function parseDuration(str) {
    var s = String(str == null ? "" : str).trim().toLowerCase();
    var m, sec = null;
    if (!s) return null;
    if ((m = s.match(/^(\d+):(\d{1,2})$/))) {
      if (+m[2] > 59) return null;
      sec = +m[1] * 60 + +m[2];
    } else if ((m = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/))) {
      if (+m[2] > 59 || +m[3] > 59) return null;
      sec = +m[1] * 3600 + +m[2] * 60 + +m[3];
    } else if ((m = s.match(/^(\d+)\.(\d{2})$/))) {
      if (+m[2] > 59) return null;
      sec = +m[1] * 60 + +m[2];
    } else if ((m = s.match(/^(?:(\d+)\s*(?:m|min|mins|minute|minutes))?\s*(?:(\d+)\s*(?:s|sec|secs|second|seconds))?$/)) && (m[1] || m[2])) {
      sec = (+m[1] || 0) * 60 + (+m[2] || 0);
    } else if (/^\d+$/.test(s)) {
      sec = +s;
    }
    return sec != null && isFinite(sec) && sec >= 0 && sec < 86400 ? sec : null;
  }
  function fmtDuration(sec) {
    sec = Math.round(Number(sec) || 0);
    var hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
    var two = function (n) { return (n < 10 ? "0" : "") + n; };
    return hh ? hh + ":" + two(mm) + ":" + two(ss) : mm + ":" + two(ss);
  }
  // Release dates are stored as "YYYY-MM-DD". A song without its own date follows its album;
  // older albums that only have a year still show it.
  function parseDay(s) {
    var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function fmtDay(s) {
    var d = parseDay(s);
    return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  }
  function releaseOf(item, album) {
    var d = item.released || (item.kind === "song" && album && album.released) || null;
    var y = d ? +String(d).slice(0, 4) : (item.year || (item.kind === "song" && album && album.year) || null);
    return { date: d, year: y };
  }
  function releaseText(item, album) { var r = releaseOf(item, album); return r.date ? fmtDay(r.date) : (r.year ? String(r.year) : ""); }
  function releaseYear(item, album) { var r = releaseOf(item, album); return r.year ? String(r.year) : ""; }
  function releaseSort(item, album) {
    var r = releaseOf(item, album);
    if (r.date) { var d = parseDay(r.date); return d ? d.getTime() : 0; }
    return r.year ? new Date(r.year, 0, 1).getTime() : 0;
  }
  function todayStr() {
    var d = new Date();
    var two = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  }
  function fmtCompact(n) { return COMPACT.format(n); }
  function fmtFull(n) { return FULL.format(n); }
  function initials(name) {
    var p = String(name || "").trim().split(/\s+/).filter(Boolean);
    return ((p[0] || "?").charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase();
  }
  // Profile photo, or initials on a colour when there is none.
  function avatarFor(artist) {
    var src = imageSrc(artist, null);
    if (src) {
      var img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.src = src;
      return img;
    }
    var p = PALETTES[hash(artist.id) % 8];
    var svg = svgEl("svg", { viewBox: "0 0 100 100", "aria-hidden": "true" });
    svg.append(svgEl("rect", { width: 100, height: 100, fill: p[0] }));
    var t = svgEl("text", { x: 50, y: 52, "text-anchor": "middle", "dominant-baseline": "central", "font-size": 38,
      "font-weight": 800, fill: p[1], "font-family": "Archivo, system-ui, sans-serif" });
    t.textContent = initials(artist.name);
    svg.append(t);
    return svg;
  }

  // Centre-crops to a square and shrinks it so each cover stays well under the 256 KiB document limit.
  function processImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        try {
          var iw = img.naturalWidth, ih = img.naturalHeight;
          var side = Math.min(iw, ih), sx = (iw - side) / 2, sy = (ih - side) / 2;
          var out = null;
          [[640, 0.85], [512, 0.78], [400, 0.7]].some(function (p) {
            var c = document.createElement("canvas");
            c.width = c.height = p[0];
            c.getContext("2d").drawImage(img, sx, sy, side, side, 0, 0, p[0], p[0]);
            out = c.toDataURL("image/jpeg", p[1]);
            return out.length < 180000;
          });
          URL.revokeObjectURL(url);
          resolve(out);
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  // Line and area chart for [{d: "YYYY-MM-DD", n: number}] (at least two points, oldest first).
  // Starts at zero so growth reads honestly; the last point is marked.
  function lineChart(entries) {
    var W = 320, H = 156, L = 40, R = 12, T = 12, B = 24;
    var t0 = parseDay(entries[0].d).getTime();
    var t1 = parseDay(entries[entries.length - 1].d).getTime();
    var span = Math.max(t1 - t0, 1);
    var max = 0;
    entries.forEach(function (e) { if (e.n > max) max = e.n; });
    var mag = Math.pow(10, Math.floor(Math.log(max || 1) / Math.LN10));
    var norm = (max || 1) / mag;
    var top = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    function X(t) { return L + (W - L - R) * (t - t0) / span; }
    function Y(n) { return T + (H - T - B) * (1 - n / top); }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Chart over time", "class": "chart" });
    [0, 0.5, 1].forEach(function (f) {
      var y = Y(top * f);
      svg.append(svgEl("line", { x1: L, x2: W - R, y1: y, y2: y, "class": "ch-grid" }));
      var t = svgEl("text", { x: L - 6, y: y + 3, "text-anchor": "end", "class": "ch-t" });
      t.textContent = fmtCompact(top * f);
      svg.append(t);
    });
    var pts = entries.map(function (e) { return { x: X(parseDay(e.d).getTime()), y: Y(e.n) }; });
    var line = pts.map(function (p, i) { return (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); }).join(" ");
    svg.append(svgEl("path", { d: line + " L" + pts[pts.length - 1].x.toFixed(1) + " " + Y(0) + " L" + pts[0].x.toFixed(1) + " " + Y(0) + " Z", "class": "ch-area" }));
    svg.append(svgEl("path", { d: line, "class": "ch-line" }));
    pts.forEach(function (p, i) {
      svg.append(svgEl("circle", { cx: p.x, cy: p.y, r: i === pts.length - 1 ? 4 : 2.5, "class": "ch-dot" }));
    });
    var a = svgEl("text", { x: L, y: H - 6, "text-anchor": "start", "class": "ch-t" });
    a.textContent = fmtDay(entries[0].d);
    var b = svgEl("text", { x: W - R, y: H - 6, "text-anchor": "end", "class": "ch-t" });
    b.textContent = fmtDay(entries[entries.length - 1].d);
    svg.append(a, b);
    return svg;
  }

  function lineKey(text) {
    return String(text).trim().toLowerCase().replace(/\s+/g, " ");
  }

  // [Verse 1] style headers start a section; blank lines become gaps.
  function parseLyrics(text) {
    var sections = [];
    var cur = { name: "", lines: [] };
    String(text || "").split(/\r?\n/).forEach(function (raw) {
      var m = raw.trim().match(/^\[(.+?)\]$/);
      if (m) {
        if (cur.name || cur.lines.length) sections.push(cur);
        cur = { name: m[1], lines: [] };
      } else {
        cur.lines.push(raw.replace(/\s+$/, ""));
      }
    });
    if (cur.name || cur.lines.length) sections.push(cur);
    sections.forEach(function (s) {
      while (s.lines.length && !s.lines[0].trim()) s.lines.shift();
      while (s.lines.length && !s.lines[s.lines.length - 1].trim()) s.lines.pop();
    });
    return sections.filter(function (s) { return s.name || s.lines.length; });
  }

  function stats(text) {
    var secs = parseLyrics(text);
    var lines = 0;
    secs.forEach(function (s) { s.lines.forEach(function (l) { if (l.trim()) lines++; }); });
    var words = (String(text || "").replace(/\[.+?\]/g, " ").match(/\S+/g) || []).length;
    var named = secs.filter(function (s) { return s.name; }).length;
    return { lines: lines, words: words, sections: named };
  }

  // "A, B, C" becomes "A, B & C".
  function featNames(song) {
    var n = String((song && song.feat) || "").split(",").map(function (x) { return x.trim(); }).filter(Boolean);
    if (n.length < 2) return n.join("");
    return n.slice(0, -1).join(", ") + " & " + n[n.length - 1];
  }
  function byline(song) {
    var f = featNames(song);
    return (song.artist || "No artist") + (f ? " (feat. " + f + ")" : "");
  }

  function fmtDate(ts) {
    if (!ts) return "";
    try { return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" }); } catch (e) { return ""; }
  }
  function plural(n, word) { return n + " " + word + (n === 1 ? "" : "s"); }

  window.UI = { h: h, cover: cover, coverFor: coverFor, processImage: processImage, avatarFor: avatarFor, parseCount: parseCount, parseDuration: parseDuration, fmtDuration: fmtDuration, lineChart: lineChart, todayStr: todayStr, fmtDay: fmtDay, parseDay: parseDay, releaseText: releaseText, releaseYear: releaseYear, releaseSort: releaseSort, nameKey: nameKey, fmtCompact: fmtCompact, fmtFull: fmtFull, featNames: featNames, byline: byline, coverIndexFor: coverIndexFor, lineKey: lineKey, parseLyrics: parseLyrics, stats: stats, fmtDate: fmtDate, plural: plural };
})();
