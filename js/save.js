/* Сохранения: версия, миграции, проверка целостности, экспорт/импорт. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util.js'), require('./data.js'), require('./engine.js'));
  else root.MayakSave = factory(root.MayakUtil, root.MayakData, root.MayakEngine);
})(typeof self !== 'undefined' ? self : this, function (Util, D, E) {
  'use strict';
  var PREFIX = 'MAYAK1:';

  function hash(str) { // FNV-1a 32 бит
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ('00000000' + h.toString(16)).slice(-8);
  }
  function b64enc(str) {
    if (typeof Buffer !== 'undefined') return Buffer.from(str, 'utf8').toString('base64');
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64dec(b) {
    if (typeof Buffer !== 'undefined') return Buffer.from(b, 'base64').toString('utf8');
    return decodeURIComponent(escape(atob(b)));
  }

  function strip(s) {
    var o = {}; for (var k in s) if (k.charAt(0) !== '_') o[k] = s[k];
    return o;
  }
  function serialize(s) {
    s.savedAt = s.savedAt || Date.now();
    var body = JSON.stringify(strip(s));
    return hash(body) + '|' + body;
  }
  function deserializeRaw(text) {
    if (typeof text !== 'string') throw new Error('empty');
    var i = text.indexOf('|');
    if (i !== 8) throw new Error('format');
    var h = text.slice(0, 8), body = text.slice(9);
    if (hash(body) !== h) throw new Error('checksum');
    return JSON.parse(body);
  }

  /* Миграции: from -> from+1 */
  var MIG = {
    // v1 (ранний прототип): pearls хранились как `prestige`, зоны как `era`
    1: function (o) {
      if (o.pearls == null && o.prestigePoints != null) o.pearls = o.prestigePoints;
      if (o.zone == null && o.era != null) o.zone = o.era;
      if (o.stars == null) o.stars = 0;
      if (!o.daily) o.daily = { last: '', streak: 0, best: 0, total: 0 };
      o.v = 2; return o;
    },
    // v2 -> v3: третий слой (Эпохи/эоны), поручения, коллекция. Весь прежний прогресс сохраняется.
    2: function (o) {
      // все звёзды, накопленные до v3, принадлежат первой (текущей) эпохе
      if (o.starsCycle == null) o.starsCycle = Math.max(+o.starsAll || 0, +o.stars || 0);
      if (o.eons == null) o.eons = 0;
      if (o.eonsAll == null) o.eonsAll = 0;
      if (o.eras == null) o.eras = 0;
      if (!o.eshop) o.eshop = {};
      if (!o.treasures) o.treasures = {};
      if (!Array.isArray(o.quests)) o.quests = [];
      if (o.bought == null) o.bought = 0;
      if (o.upBought == null) o.upBought = 0;
      o.v = 3; return o;
    }
  };
  function migrate(o) {
    var v = o.v | 0; if (v < 1) v = 1;
    if (v > D.SAVE_VERSION) throw new Error('newer');
    while (v < D.SAVE_VERSION) { if (!MIG[v]) throw new Error('nomig'); o = MIG[v](o); v = o.v; }
    return o;
  }

  function num(x, def, min, max) {
    x = +x; if (x !== x) return def;
    if (min != null && x < min) x = min;
    if (max != null && x > max) x = max;
    return x;
  }
  function boolMap(m, valid) {
    var o = {}; if (!m || typeof m !== 'object') return o;
    for (var k in m) if (m[k] && valid(k)) o[k] = m[k] === true ? 1 : m[k];
    return o;
  }

  /** Приводит любой объект к валидному состоянию, отбрасывая мусор. */
  function sanitize(o, now) {
    var d = E.newState(now), s = d, C = Util.CAP;
    if (!o || typeof o !== 'object') return d;
    ['light', 'runLight', 'totalLight'].forEach(function (k) { s[k] = num(o[k], 0, 0, C); });
    s.runLight = Math.min(s.runLight, s.totalLight || s.runLight);
    ['taps', 'autoTaps', 'events', 'prestiges', 'ascensions', 'eras', 'questSeq', 'bought', 'upBought'].forEach(function (k) { s[k] = Math.floor(num(o[k], 0, 0, 1e15)); });
    ['pearls', 'pearlsCycle', 'pearlsAll', 'stars', 'starsAll', 'starsCycle', 'eons', 'eonsAll', 'luckyTotal'].forEach(function (k) { s[k] = Math.floor(num(o[k], 0, 0, C)); });
    s.pearlsAll = Math.max(s.pearlsAll, s.pearls); s.starsAll = Math.max(s.starsAll, s.stars); s.eonsAll = Math.max(s.eonsAll, s.eons);
    s.starsCycle = Math.max(s.starsCycle, s.stars);
    s.pearlsCycle = Math.max(s.pearlsCycle, 0);
    s.created = num(o.created, now, 0, now + 1e10); s.savedAt = num(o.savedAt, now, 0, Infinity);
    if (Array.isArray(o.gens)) for (var i = 0; i < D.GENS.length; i++) s.gens[i] = Math.floor(num(o.gens[i], 0, 0, E.MAX_OWN));
    s.upgrades = boolMap(o.upgrades, function (k) { return !!D.UPG[k]; });
    s.shop = boolMap(o.shop, function (k) { return !!D.SHOPI[k]; });
    s.perks = boolMap(o.perks, function (k) { return !!D.PERKI[k]; });
    s.eshop = boolMap(o.eshop, function (k) { return !!D.ESHOPI[k]; });
    s.treasures = boolMap(o.treasures, function (k) { return D.TREASURES.some(function (t) { return t.id === k; }); });
    s.quests = [];
    if (Array.isArray(o.quests)) o.quests.slice(0, 6).forEach(function (q) {
      if (q && D.QTYPEI[q.type] && q.target > 0) s.quests.push({ n: Math.floor(num(q.n, 0, 0, 1e9)), type: q.type, target: num(q.target, 1, 1, C), base: num(q.base, 0, 0, C), mins: num(q.mins, 10, 1, 1000) });
    });
    s.ach = boolMap(o.ach, function (k) { return !!D.ACH[k]; });
    s.zone = Math.floor(num(o.zone, 0, 0, D.ZONES.length - 1));
    s.bestZone = Math.max(s.zone, Math.floor(num(o.bestZone, 0, 0, D.ZONES.length - 1)));
    if (o.daily && typeof o.daily === 'object') {
      s.daily.last = typeof o.daily.last === 'string' && /^\d{4}-\d\d-\d\d$/.test(o.daily.last) ? o.daily.last : '';
      s.daily.streak = Math.floor(num(o.daily.streak, 0, 0, 1e5));
      s.daily.best = Math.max(s.daily.streak, Math.floor(num(o.daily.best, 0, 0, 1e5)));
      s.daily.total = Math.floor(num(o.daily.total, 0, 0, 1e5));
    }
    if (o.stats && typeof o.stats === 'object') for (var k in s.stats) s.stats[k] = num(o.stats[k], 0, 0, C);
    if (o.settings && typeof o.settings === 'object') {
      s.settings.sound = o.settings.sound !== false;
      s.settings.particles = o.settings.particles !== false;
      s.settings.theme = ['night', 'dawn', 'dark'].indexOf(o.settings.theme) >= 0 ? o.settings.theme : 'night';
      s.settings.bulk = [1, 10, 100, 'max'].indexOf(o.settings.bulk) >= 0 ? o.settings.bulk : 1;
      s.settings.tab = typeof o.settings.tab === 'string' ? o.settings.tab.slice(0, 12) : 'gens';
      s.settings.autopres = o.settings.autopres === true;
    }
    s.evTimer = num(o.evTimer, 100, 0, 1000);
    s.v = D.SAVE_VERSION;
    // фиксим противоречия
    if (s.bestZone < 6 && s.zone < 6) { /* нормально */ }
    s._c = null;
    return s;
  }

  function parseAny(text, now) {
    var o = migrate(deserializeRaw(text));
    return sanitize(o, now || Date.now());
  }

  /* ---------- localStorage ---------- */
  function save(s, store) {
    store = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) return false;
    try {
      s.savedAt = Date.now();
      var text = serialize(s);
      var prev = store.getItem(D.SAVE_KEY);
      if (prev) store.setItem(D.BACKUP_KEY, prev);
      store.setItem(D.SAVE_KEY, text);
      return true;
    } catch (e) { return false; }
  }
  /** Загружает: основной слот → резервный → новая игра. Возвращает {state, status}. */
  function load(store, now) {
    now = now || Date.now();
    store = store || (typeof localStorage !== 'undefined' ? localStorage : null);
    var raw = null, status = 'new';
    try { raw = store && store.getItem(D.SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) return { state: E.newState(now), status: 'new' };
    try { return { state: parseAny(raw, now), status: 'ok' }; } catch (e1) {
      status = 'corrupt:' + e1.message;
      try {
        var bak = store.getItem(D.BACKUP_KEY);
        if (bak) return { state: parseAny(bak, now), status: 'restored-backup' };
      } catch (e2) { /* ignore */ }
      try { store.setItem(D.SAVE_KEY + '.corrupt', raw); } catch (e3) { /* ignore */ }
      return { state: E.newState(now), status: status };
    }
  }

  /* ---------- Экспорт / импорт ---------- */
  function exportCode(s) { return PREFIX + b64enc(serialize(s)); }
  function importCode(code, now) {
    code = String(code || '').replace(/\s+/g, '');
    if (code.indexOf(PREFIX) !== 0) throw new Error('prefix');
    var text;
    try { text = b64dec(code.slice(PREFIX.length)); } catch (e) { throw new Error('base64'); }
    return parseAny(text, now);
  }

  return { hash: hash, serialize: serialize, deserializeRaw: deserializeRaw, migrate: migrate, sanitize: sanitize,
    parseAny: parseAny, save: save, load: load, exportCode: exportCode, importCode: importCode, PREFIX: PREFIX };
});
