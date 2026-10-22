/* Storage for songs and albums.
   Items live in memory and are mirrored to localStorage (per browser).
   When the db capability is available, each item is also a document under
   data/users/<id>/, so the library follows the person across devices. */
(function () {
  var LS_KEY = "linernotes.v1";
  var items = new Map();
  var subs = new Set();
  var col = null;
  var status = "local"; // local | saving | cloud | error
  var firstSync = false;
  var timers = new Map();
  var inflight = new Set();
  var dirty = new Set();
  var removed = new Set();

  function lsRead() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }
  function lsWrite() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(items.values()))); } catch (e) {}
  }
  function emit() {
    subs.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }
  function setStatus(s) {
    if (status === s) return;
    status = s;
    emit();
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function schedule(id, delay) {
    clearTimeout(timers.get(id));
    timers.set(id, setTimeout(function () { flush(id); }, delay));
    if (col) setStatus("saving");
  }

  async function flush(id) {
    timers.delete(id);
    if (!col) return;
    if (inflight.has(id)) { dirty.add(id); return; }
    inflight.add(id);
    try {
      var it = items.get(id);
      if (it) await col.doc(id).set(it);
      else await col.doc(id).delete();
      if (!timers.has(id) && !dirty.has(id)) setStatus(inflight.size > 1 ? "saving" : "cloud");
    } catch (e) {
      console.error(e);
      setStatus("error");
    } finally {
      inflight.delete(id);
      if (dirty.delete(id)) flush(id);
    }
  }

  function applySnapshot(snap) {
    var definitive = !snap.metadata.fromCache;
    var seen = new Set();
    snap.docs.forEach(function (d) {
      var id = d.id;
      seen.add(id);
      if (timers.has(id) || inflight.has(id) || removed.has(id)) return;
      var data = d.data();
      if (!data || !(data.kind === "song" || data.kind === "album" || data.kind === "artist" || data.kind === "image")) return;
      var cur = items.get(id);
      // This device has a newer copy than the account (an earlier save never landed): keep it and send it up.
      if (cur && (cur.updated || 0) > (data.updated || 0)) { if (definitive) schedule(id, 50); return; }
      // Snapshot data is frozen, so keep an editable copy.
      items.set(id, JSON.parse(JSON.stringify(data)));
    });
    if (definitive) {
      if (!firstSync) {
        firstSync = true;
        // Anything made on this device before the cloud answered is uploaded once.
        items.forEach(function (it, id) { if (!seen.has(id)) schedule(id, 50); });
      } else {
        Array.from(items.keys()).forEach(function (id) {
          if (!seen.has(id) && !timers.has(id) && !inflight.has(id)) items.delete(id);
        });
      }
      if (!timers.size && !inflight.size) status = "cloud";
    }
    lsWrite();
    emit();
  }

  async function connect() {
    try {
      if (!window.claude || !window.claude.use) return;
      var results = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
      var db = results[0], user = results[1];
      if (!db || !user) return;
      var me = await user.id();
      if (!me) return;
      col = db.collection("data/users/" + me);
      col.onSnapshot(applySnapshot, function (err) {
        console.error(err);
        col = null;
        setStatus("local");
      });
    } catch (e) {
      console.error(e);
      col = null;
    }
  }

  window.Store = {
    init: function () {
      lsRead().forEach(function (it) { if (it && it.id) items.set(it.id, it); });
      connect();
    },
    newId: function (prefix) { return prefix + "_" + uid(); },
    all: function (kind) {
      var out = [];
      items.forEach(function (it) { if (!kind || it.kind === kind) out.push(it); });
      return out;
    },
    get: function (id) { return items.get(id) || null; },
    put: function (item, delay) {
      item.updated = Date.now();
      if (!item.created) item.created = item.updated;
      items.set(item.id, item);
      removed.delete(item.id);
      lsWrite();
      schedule(item.id, delay == null ? 500 : delay);
      emit();
    },
    remove: function (id) {
      items.delete(id);
      removed.add(id);
      lsWrite();
      schedule(id, 50);
      emit();
    },
    exportData: function () {
      return { app: "liner-notes", version: 1, exported: new Date().toISOString(), items: Array.from(items.values()) };
    },
    // Adds items from a backup. A copy already here is kept when it is as new or newer.
    mergeItems: function (list) {
      var kinds = { song: 1, album: 1, artist: 1, image: 1 };
      var r = { added: 0, updated: 0, skipped: 0, invalid: 0 };
      list.forEach(function (it) {
        var ok = it && typeof it === "object" && kinds[it.kind] && typeof it.id === "string" &&
          /^[A-Za-z0-9_.~:@+-]{1,100}$/.test(it.id) && it.id !== "." && it.id !== ".." &&
          (it.kind !== "image" || (typeof it.data === "string" && it.data.indexOf("data:image/") === 0));
        if (!ok) { r.invalid++; return; }
        var cur = items.get(it.id);
        if (cur && (cur.updated || 0) >= (it.updated || 0)) { r.skipped++; return; }
        items.set(it.id, JSON.parse(JSON.stringify(it)));
        removed.delete(it.id);
        if (cur) r.updated++; else r.added++;
        schedule(it.id, 100);
      });
      lsWrite();
      emit();
      return r;
    },
    subscribe: function (fn) { subs.add(fn); return function () { subs.delete(fn); }; },
    status: function () { return status; },
    cloud: function () { return !!col; }
  };
})();
