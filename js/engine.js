/* Ядро игры «Хозяин маяка» — чистая логика без DOM. Работает в браузере и в Node (тесты/симуляция). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util.js'), require('./data.js'));
  else root.MayakEngine = factory(root.MayakUtil, root.MayakData);
})(typeof self !== 'undefined' ? self : this, function (Util, D) {
  'use strict';
  var BAL = D.BAL, GENS = D.GENS, ZONES = D.ZONES, UPG = D.UPGRADES, clamp = Util.clamp;
  var MAX_OWN = 1500;
  var EV_DUR = { frenzy: 30, tapfrenzy: 20, wind: 60, whale: 10, dolphin: 45 };
  var EV_MULT = { frenzy: 7, wind: 1.5, whale: 77 };
  var TAPFRENZY = 20;

  function zeroGens() { var a = []; for (var i = 0; i < GENS.length; i++) a.push(0); return a; }

  function newState(now) {
    now = now || Date.now();
    return {
      v: D.SAVE_VERSION, created: now, savedAt: now,
      light: 0, runLight: 0, totalLight: 0, taps: 0, autoTaps: 0,
      gens: zeroGens(), upgrades: {},
      pearls: 0, pearlsCycle: 0, pearlsAll: 0, prestiges: 0, shop: {},
      stars: 0, starsAll: 0, starsCycle: 0, perks: {}, ascensions: 0,
      eons: 0, eonsAll: 0, eras: 0, eshop: {}, treasures: {}, quests: [], questSeq: 0, bought: 0, upBought: 0,
      zone: 0, bestZone: 0,
      buffs: {}, star: null, evTimer: 100, events: 0, luckyTotal: 0,
      ach: {}, daily: { last: '', streak: 0, best: 0, total: 0 },
      stats: { playTime: 0, runTime: 0, offlineTotal: 0, offlineCount: 0, maxProd: 0, bestRunPearls: 0, fastestPrestige: 0, capHit: 0, dolphins: 0, bottles: 0, questsDone: 0, bestEon: 0, autoPres: 0 },
      settings: { sound: true, theme: 'night', particles: true, bulk: 1, tab: 'gens', autopres: false },
      autoAcc: 0, buyAcc: 0
    };
  }

  /* ---------- Расчёт производных величин (кэш в state._c) ---------- */
  function dirty(s) { s._c = null; }

  function calc(s) {
    if (s._c) return s._c;
    var c = {
      allx: 1, cost: 1, tapx: 1, tapfrac: 0, auto: 0, offcap: BAL.offlineCapH, offeff: BAL.offlineEff,
      evfreq: 1, evdur: 1, evpow: 1, pgain: 0, pearlEff: BAL.pearlPer, starEff: BAL.starPer, keepPearls: 0,
      start: 0, startgens: 0, keeptap: false, autobuy: false, sgain: 0, questx: 1, colx: 1, coldrop: 1, keepPerks: 0, autopres: false,
      genx: zeroGens().map(function () { return 1; }), syn: []
    };
    function eff(e) {
      switch (e.t) {
        case 'allx': c.allx *= e.v; break;
        case 'cost': c.cost *= e.v; break;
        case 'tapx': c.tapx *= e.v; break;
        case 'tapfrac': c.tapfrac += e.v; break;
        case 'auto': c.auto += e.v; break;
        case 'offcap': c.offcap += e.v; break;
        case 'offeff': c.offeff += e.v; break;
        case 'evfreq': c.evfreq *= e.v; break;
        case 'evdur': c.evdur *= e.v; break;
        case 'evpow': c.evpow *= e.v; break;
        case 'pgain': c.pgain += e.v; break;
        case 'pearlper': c.pearlEff += e.v; break;
        case 'starper': c.starEff += e.v; break;
        case 'keepPearls': c.keepPearls += e.v; break;
        case 'start': c.start += e.v; break;
        case 'startgens': c.startgens = Math.max(c.startgens, e.v); break;
        case 'keeptap': c.keeptap = true; break;
        case 'autobuy': c.autobuy = true; break;
        case 'genx': c.genx[e.g] *= e.v; break;
        case 'sgain': c.sgain += e.v; break;
        case 'questx': c.questx *= e.v; break;
        case 'colx': c.colx *= e.v; break;
        case 'coldrop': c.coldrop *= e.v; break;
        case 'keepPerks': c.keepPerks = Math.max(c.keepPerks, e.v); break;
        case 'autopres': c.autopres = true; break;
        case 'syn': c.syn.push(e); break;
      }
    }
    var i;
    for (i = 0; i < UPG.length; i++) if (s.upgrades[UPG[i].id]) eff(UPG[i].e);
    for (i = 0; i < D.SHOP.length; i++) if (s.shop[D.SHOP[i].id]) eff(D.SHOP[i].e);
    for (i = 0; i < D.PERKS.length; i++) if (s.perks[D.PERKS[i].id]) eff(D.PERKS[i].e);
    for (i = 0; i < D.ESHOP.length; i++) if (s.eshop[D.ESHOP[i].id]) { eff(D.ESHOP[i].e); if (D.ESHOP[i].e2) eff(D.ESHOP[i].e2); }
    c.offeff = Math.min(1, c.offeff);
    c.pearlMult = Math.pow(1 + c.pearlEff * s.pearlsCycle, BAL.pearlPow);
    c.starMult = Math.pow(1 + c.starEff * s.stars, BAL.starPow);
    c.eonMult = Math.pow(1 + BAL.eonPer * s.eonsAll, BAL.eonPow);
    var nt = treasureCount(s), ns = setsDone(s);
    c.colMult = (1 + 0.03 * c.colx * nt) * (1 + 0.25 * c.colx * ns);
    var ab = 0;
    for (var k = 0; k < D.ACHIEVEMENTS.length; k++) if (s.ach[D.ACHIEVEMENTS[k].id]) ab += D.ACHIEVEMENTS[k].b;
    c.achMult = 1 + 0.01 * ab;
    c.zoneMult = ZONES[s.zone].mult;
    c.perm = clamp(c.pearlMult * c.starMult * c.achMult * c.eonMult * c.colMult);
    c.global = clamp(c.perm * c.allx * c.zoneMult);
    var sum = 0; c.genProd = [];
    for (i = 0; i < GENS.length; i++) {
      var n = s.gens[i], p = 0;
      if (n > 0) {
        var ms = 0; for (var m = 0; m < BAL.milestones.length; m++) if (n >= BAL.milestones[m]) ms++;
        var synm = 1;
        for (var q = 0; q < c.syn.length; q++) if (c.syn[q].g === i) synm += c.syn[q].v * s.gens[c.syn[q].src];
        p = n * GENS[i].prod * Math.pow(2, ms) * c.genx[i] * synm;
      }
      c.genProd.push(clamp(p * c.global)); sum += p;
    }
    c.prod = clamp(sum * c.global);
    c.tapBase = clamp(c.tapx * c.perm * c.zoneMult);
    dirty.bump = 0;
    s._c = c;
    return c;
  }

  function buffMult(s) {
    var m = 1, b = s.buffs;
    if (b.frenzy > 0) m *= EV_MULT.frenzy;
    if (b.wind > 0) m *= EV_MULT.wind;
    if (b.whale > 0) m *= EV_MULT.whale;
    return m;
  }
  function prod(s) { return clamp(calc(s).prod * buffMult(s)); }
  function tapValue(s) {
    var c = calc(s);
    var v = c.tapBase + c.tapfrac * prod(s);
    if (s.buffs.tapfrenzy > 0) v *= TAPFRENZY;
    return clamp(v);
  }

  /* ---------- Добавление света (единая точка входа) ---------- */
  function addLight(s, x) {
    x = clamp(x);
    if (x >= Util.CAP) s.stats.capHit = 1;
    s.light = clamp(s.light + x);
    s.runLight = clamp(s.runLight + x);
    s.totalLight = clamp(s.totalLight + x);
    if (s.light >= Util.CAP) s.stats.capHit = 1;
  }
  function tap(s) {
    var v = tapValue(s);
    addLight(s, v); s.taps++;
    return v;
  }

  /* ---------- Генераторы ---------- */
  function genCostMult(s) { return calc(s).cost * (s.buffs.dolphin > 0 ? 0.5 : 1); }
  function baseCost(s, i) { return GENS[i].cost * genCostMult(s) * Math.pow(BAL.costGrowth, s.gens[i]); }
  function bulkCost(s, i, k) {
    var r = BAL.costGrowth;
    return clamp(baseCost(s, i) * (Math.pow(r, k) - 1) / (r - 1));
  }
  function maxAffordable(s, i) {
    var r = BAL.costGrowth, first = baseCost(s, i);
    if (!(first > 0) || first >= Util.CAP) return 0;
    var k = Math.floor(Math.log(1 + s.light * (r - 1) / first) / Math.log(r) + 1e-9);
    k = Math.max(0, Math.min(k, MAX_OWN - s.gens[i]));
    while (k > 0 && bulkCost(s, i, k) > s.light) k--;
    return k;
  }
  function genUnlocked(s, i) { return GENS[i].zone <= s.zone; }
  /** k — число или 'max'. Возвращает сколько куплено. */
  function buyGen(s, i, k) {
    if (i < 0 || i >= GENS.length || !genUnlocked(s, i)) return 0;
    var n = k === 'max' ? maxAffordable(s, i) : Math.min(k | 0, MAX_OWN - s.gens[i]);
    if (n <= 0) return 0;
    if (k !== 'max') { // не купим «частично»
      if (bulkCost(s, i, n) > s.light) return 0;
    }
    var cost = bulkCost(s, i, n);
    if (cost > s.light) return 0;
    s.light = clamp(s.light - cost);
    s.gens[i] += n; s.bought += n; dirty(s);
    return n;
  }
  function planBuy(s, i, k) { // для UI: сколько и за сколько
    var n = k === 'max' ? Math.max(maxAffordable(s, i), 1) : k;
    n = Math.min(n, MAX_OWN - s.gens[i]);
    return { n: n, cost: n > 0 ? bulkCost(s, i, n) : 0 };
  }

  /* ---------- Улучшения ---------- */
  function upgStatus(s, u) {
    if (typeof u === 'string') u = UPG_BY(u);
    if (s.upgrades[u.id]) return 'owned';
    for (var i = 0; i < u.req.length; i++) if (!s.upgrades[u.req[i]]) return 'locked';
    if (u.cond && s.gens[u.cond.gen] < u.cond.n) return 'locked';
    return 'avail';
  }
  function UPG_BY(id) { return D.UPG[id]; }
  function buyUpgrade(s, id) {
    var u = D.UPG[id];
    if (!u || upgStatus(s, u) !== 'avail' || s.light < u.cost) return false;
    s.light = clamp(s.light - u.cost); s.upgrades[id] = 1; s.upBought++; dirty(s);
    return true;
  }
  function ownedUpgrades(s) { var n = 0; for (var k in s.upgrades) if (s.upgrades[k]) n++; return n; }

  /* ---------- Коллекция ---------- */
  function treasureCount(s) { var n = 0; for (var k in s.treasures) if (s.treasures[k]) n++; return n; }
  function setsDone(s) {
    var n = 0;
    D.TSETS.forEach(function (st, si) { var ok = true; D.TREASURES.forEach(function (t) { if (t.set === si && !s.treasures[t.id]) ok = false; }); if (ok) n++; });
    return n;
  }
  function rollTreasure(s, rng) { // возвращает новое сокровище или null (всё собрано)
    rng = rng || Math.random;
    var pool = [], tot = 0;
    D.TREASURES.forEach(function (t) {
      if (s.treasures[t.id]) return;
      var st = D.TSETS[t.set]; if (st.zone > s.bestZone) return;
      pool.push([t, st.w]); tot += st.w;
    });
    if (!pool.length) return null;
    var r = rng() * tot;
    for (var i = 0; i < pool.length; i++) { r -= pool[i][1]; if (r < 0) return give(pool[i][0]); }
    return give(pool[0][0]);
    function give(t) { s.treasures[t.id] = 1; dirty(s); return t; }
  }

  /* ---------- Зоны ---------- */
  function zoneFor(s) {
    var z = 0;
    for (var i = 0; i < ZONES.length; i++) {
      if (s.runLight >= ZONES[i].need && (!ZONES[i].needAscend || s.ascensions >= ZONES[i].needAscend) && (!ZONES[i].needEra || s.eras >= ZONES[i].needEra)) z = i;
    }
    return z;
  }
  function zoneNext(s) { // следующая зона или null
    var n = s.zone + 1; if (n >= ZONES.length) return null;
    return n;
  }

  /* ---------- Отлив (престиж) и вознесение ---------- */
  function pearlGain(s) {
    var c = calc(s);
    var g = Math.pow(s.runLight / BAL.prestigeBase, BAL.pearlExp) * (1 + c.pgain);
    return Math.floor(clamp(g));
  }
  function starGain(s) { return Math.floor(clamp(Math.pow(s.pearlsCycle / BAL.ascendBase, BAL.starExp) * (1 + calc(s).sgain))); }
  function nextPearlAt(s) { // свет за забег, при котором жемчужин станет на 1 больше
    var c = calc(s), g = pearlGain(s) + 1;
    return Math.pow(g / (1 + c.pgain), 1 / BAL.pearlExp) * BAL.prestigeBase;
  }

  function startRun(s) {
    var c = calc(s);
    s.light = 0; s.runLight = 0; s.gens = zeroGens(); s.buffs = {}; s.star = null;
    s.zone = 0; s.stats.runTime = 0; s.buyAcc = 0;
    var keep = {};
    if (c.keeptap) ['h1', 'h2', 'h3'].forEach(function (id) { if (s.upgrades[id]) keep[id] = 1; });
    s.upgrades = keep; dirty(s);
    c = calc(s);
    s.light = clamp(c.start);
    if (c.startgens > 0) { s.gens[0] = c.startgens; s.gens[1] = c.startgens; s.gens[2] = c.startgens; }
    dirty(s);
    s.evTimer = nextEventDelay(s, Math.random);
  }
  function canPrestige(s) { return pearlGain(s) >= 1; }
  function prestige(s) {
    var g = pearlGain(s);
    if (g < 1) return 0;
    if (!(s.stats.fastestPrestige > 0) || s.stats.runTime < s.stats.fastestPrestige) s.stats.fastestPrestige = s.stats.runTime;
    s.stats.bestRunPearls = Math.max(s.stats.bestRunPearls, g);
    s.pearls += g; s.pearlsCycle += g; s.pearlsAll += g; s.prestiges++;
    startRun(s);
    return g;
  }
  function canAscend(s) { return starGain(s) >= 1; }
  function ascend(s) {
    var g = starGain(s);
    if (g < 1) return 0;
    var c = calc(s);
    var kept = Math.floor(s.pearls * c.keepPearls);
    s.stars += g; s.starsAll += g; s.starsCycle += g; s.ascensions++;
    s.pearls = kept; s.pearlsCycle = 0; s.shop = {};
    dirty(s);
    startRun(s);
    return g;
  }

  /* ---------- Эпоха (третий слой) ---------- */
  function eonGain(s) { return Math.floor(clamp(Math.pow(s.starsCycle / BAL.eraBase, BAL.eraExp))); }
  function canEra(s) { return eonGain(s) >= 1; }
  function nextEonAt(s) { return Math.pow(eonGain(s) + 1, 1 / BAL.eraExp) * BAL.eraBase; }
  function era(s) {
    var g = eonGain(s);
    if (g < 1) return 0;
    var c = calc(s), keepN = c.keepPerks, kept = {};
    D.PERKS.forEach(function (p, i) { if (i < keepN && s.perks[p.id]) kept[p.id] = 1; });
    s.stats.bestEon = Math.max(s.stats.bestEon, g);
    s.eons += g; s.eonsAll += g; s.eras++;
    s.stars = 0; s.starsCycle = 0; s.perks = kept; s.pearls = 0; s.pearlsCycle = 0; s.shop = {};
    dirty(s);
    startRun(s);
    return g;
  }
  function buyEshop(s, id) {
    var it = D.ESHOPI[id];
    if (!it || s.eshop[id] || s.eons < it.cost) return false;
    s.eons -= it.cost; s.eshop[id] = 1; dirty(s); return true;
  }

  function buyShop(s, id) {
    var it = D.SHOPI[id];
    if (!it || s.shop[id] || s.pearls < it.cost) return false;
    s.pearls -= it.cost; s.shop[id] = 1; dirty(s); return true;
  }
  function buyPerk(s, id) {
    var it = D.PERKI[id];
    if (!it || s.perks[id] || s.stars < it.cost) return false;
    s.stars -= it.cost; s.perks[id] = 1; dirty(s); return true;
  }

  /* ---------- События (падающие звёзды) ---------- */
  function nextEventDelay(s, rng) {
    var c = calc(s);
    return (BAL.eventMin + (BAL.eventMax - BAL.eventMin) * rng()) * c.evfreq;
  }
  function pickEvent(rng) {
    var tot = 0, i; for (i = 0; i < D.EVENTS.length; i++) tot += D.EVENTS[i].w;
    var r = rng() * tot;
    for (i = 0; i < D.EVENTS.length; i++) { r -= D.EVENTS[i].w; if (r < 0) return D.EVENTS[i]; }
    return D.EVENTS[0];
  }
  function spawnStar(s, rng) {
    var e = pickEvent(rng);
    s.star = { kind: e.kind, ttl: BAL.eventLife, x: 0.1 + 0.8 * rng(), y: 0.15 + 0.6 * rng() };
    return s.star;
  }
  function applyEvent(s, kind) {
    var c = calc(s), out = { kind: kind, gain: 0, name: '' };
    var ev = D.EVENTS.filter(function (e) { return e.kind === kind; })[0];
    out.name = ev ? ev.name : kind;
    if (kind === 'lucky') {
      var g = (c.prod * 420 + 30 + tapValue(s) * 30) * c.evpow;
      addLight(s, g); out.gain = g; s.luckyTotal = clamp(s.luckyTotal + g);
    } else if (kind === 'meteor') {
      var g2 = (c.prod * 900 + 100) * c.evpow;
      addLight(s, g2); out.gain = g2;
    } else if (kind === 'bottle') {
      s.stats.bottles++;
      var tr = Math.random() < Math.min(0.9, 0.45 * c.coldrop) ? rollTreasure(s) : null;
      if (tr) out.treasure = tr;
      else { var g3 = (c.prod * 180 + 50) * c.evpow; addLight(s, g3); out.gain = g3; }
    } else {
      if (kind === 'dolphin') s.stats.dolphins++;
      s.buffs[kind] = EV_DUR[kind] * c.evdur; dirty(s);
      out.dur = s.buffs[kind];
    }
    s.events++;
    return out;
  }
  function clickStar(s) {
    if (!s.star) return null;
    var k = s.star.kind; s.star = null;
    s.evTimer = nextEventDelay(s, Math.random);
    return applyEvent(s, k);
  }

  /* ---------- Поручения порта ---------- */
  function statNow(s, stat) { return stat === 'totalLight' ? s.totalLight : (s[stat] || 0); }
  function makeQuest(s, rng) {
    rng = rng || Math.random;
    var c = calc(s), types = D.QTYPES.filter(function (q) { return !q.min || q.min(s); });
    var q = types[Math.floor(rng() * types.length)], target;
    if (q.id === 'earn') target = Math.max(200, Math.floor(prod(s) * 60 * (10 + rng() * 20)));
    else target = q.gen(s, rng);
    var mins = q.mins * (0.8 + 0.5 * rng());
    s.questSeq++;
    return { n: s.questSeq, type: q.id, target: target, base: statNow(s, q.stat), mins: mins };
  }
  function ensureQuests(s, rng) {
    if (!Array.isArray(s.quests)) s.quests = [];
    while (s.quests.length < BAL.questSlots) s.quests.push(makeQuest(s, rng));
  }
  function questProgress(s, q) {
    var def = D.QTYPEI[q.type]; if (!def) return 1;
    var d = statNow(s, def.stat) - q.base;
    return Math.max(0, Math.min(1, d / q.target));
  }
  function questReward(s, q) {
    var c = calc(s);
    return { light: Math.max(500, prod(s) * 60 * q.mins) * c.questx, pearls: q.type === 'pres' ? Math.round(2 * c.questx) : 0 };
  }
  function claimQuest(s, idx, rng) {
    var q = s.quests[idx]; if (!q || questProgress(s, q) < 1) return null;
    var r = questReward(s, q), c = calc(s);
    addLight(s, r.light);
    if (r.pearls) { s.pearls += r.pearls; s.pearlsAll += r.pearls; }
    var out = { light: r.light, pearls: r.pearls, treasure: null };
    if ((rng || Math.random)() < BAL.chestChance * Math.min(2, c.coldrop)) out.treasure = rollTreasure(s, rng);
    s.stats.questsDone++;
    s.quests[idx] = makeQuest(s, rng); dirty(s);
    return out;
  }
  function questText(s, q) {
    var def = D.QTYPEI[q.type]; if (!def) return '';
    return def.text.replace('{n}', q.type === 'earn' ? Util.fmt(q.target) : String(q.target));
  }

  /* ---------- Основной тик ---------- */
  function tick(s, dt, rng) {
    rng = rng || Math.random;
    if (!(dt > 0)) return [];
    var notes = [], c = calc(s), i;
    // производство с учётом времени действия баффов
    var base = c.prod, gain;
    var pts = [0, dt];
    ['frenzy', 'wind', 'whale'].forEach(function (b) { if (s.buffs[b] > 0 && s.buffs[b] < dt) pts.push(s.buffs[b]); });
    if (pts.length === 2) gain = base * buffMult(s) * dt;
    else {
      pts.sort(function (a, b) { return a - b; }); gain = 0;
      for (i = 0; i < pts.length - 1; i++) {
        var mid = (pts[i] + pts[i + 1]) / 2, m = 1;
        if (s.buffs.frenzy > mid) m *= EV_MULT.frenzy;
        if (s.buffs.wind > mid) m *= EV_MULT.wind;
        if (s.buffs.whale > mid) m *= EV_MULT.whale;
        gain += base * m * (pts[i + 1] - pts[i]);
      }
    }
    addLight(s, gain);
    if (c.auto > 0) { // автокасание
      var n = c.auto * dt; s.autoAcc += n;
      var whole = Math.floor(s.autoAcc); s.autoAcc -= whole;
      if (whole > 0) addLight(s, tapValue(s) * whole * 0.5 + 0); // автокасание вдвое слабее живого
      s.autoTaps += whole;
    }
    // баффы
    var bchanged = false;
    for (var b in s.buffs) { s.buffs[b] -= dt; if (s.buffs[b] <= 0) { delete s.buffs[b]; bchanged = true; } }
    if (bchanged) dirty(s);
    // автопокупка
    if (c.autobuy) {
      s.buyAcc += dt;
      if (s.buyAcc >= 1) {
        s.buyAcc = 0;
        var best = -1, bestR = Infinity;
        for (i = 0; i < GENS.length; i++) {
          if (!genUnlocked(s, i)) continue;
          var cost = baseCost(s, i);
          if (cost <= s.light * 0.1 && cost / GENS[i].prod < bestR) { bestR = cost / GENS[i].prod; best = i; }
        }
        if (best >= 0) { var k = Math.max(1, Math.min(maxAffordableLimit(s, best, s.light * 0.1), 25)); buyGen(s, best, k); }
      }
    }
    // автоотлив
    if (c.autopres && s.settings.autopres && s.stats.runTime > 60) {
      var pg = pearlGain(s);
      if (pg >= 1 && pg >= Math.max(3, s.pearlsCycle * 0.5)) { prestige(s); s.stats.autoPres++; notes.push({ t: 'autopres', g: pg }); return notes; }
    }
    // зона
    var z = zoneFor(s);
    if (z > s.zone) { s.zone = z; dirty(s); notes.push({ t: 'zone', z: z }); }
    if (z > s.bestZone) s.bestZone = z;
    // статистика
    s.stats.playTime += dt; s.stats.runTime += dt;
    var p = prod(s); if (p > s.stats.maxProd) s.stats.maxProd = p;
    // событие
    if (s.star) {
      s.star.ttl -= dt;
      if (s.star.ttl <= 0) { s.star = null; s.evTimer = nextEventDelay(s, rng); notes.push({ t: 'starGone' }); }
    } else {
      s.evTimer -= dt;
      if (s.evTimer <= 0) { spawnStar(s, rng); notes.push({ t: 'star' }); }
    }
    return notes;
  }
  function maxAffordableLimit(s, i, budget) {
    var save = s.light; s.light = budget; var k = maxAffordable(s, i); s.light = save; return k;
  }

  /* ---------- Оффлайн ---------- */
  function computeOffline(s, now) {
    var elapsed = (now - s.savedAt) / 1000;
    if (!(elapsed >= 60) || elapsed > 86400 * 3650) return null; // <1 мин, часы назад/вперёд или безумные значения
    var c = calc(s), cap = c.offcap * 3600, used = Math.min(elapsed, cap);
    var gain = clamp(c.prod * used * c.offeff);
    return { elapsed: elapsed, used: used, capped: elapsed > cap, eff: c.offeff, gain: gain, capHours: c.offcap };
  }
  function applyOffline(s, now) {
    var r = computeOffline(s, now);
    if (!r) return null;
    addLight(s, r.gain);
    s.stats.offlineTotal = clamp(s.stats.offlineTotal + r.gain); s.stats.offlineCount++;
    s.savedAt = now; s.buffs = {};
    var z = zoneFor(s); if (z > s.zone) { s.zone = z; dirty(s); } if (z > s.bestZone) s.bestZone = z;
    return r;
  }

  /* ---------- Ежедневные награды ---------- */
  function dstr(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dayKey(now) { return dstr(new Date(now)); }
  function prevDayKey(now) { var d = new Date(now); d.setDate(d.getDate() - 1); return dstr(d); }
  function dailyInfo(s, now) {
    var t = dayKey(now), last = s.daily.last, streak;
    if (last === t) return { canClaim: false, streak: s.daily.streak, idx: (s.daily.streak - 1) % 7 };
    if (last && last > t) return { canClaim: false, streak: s.daily.streak, idx: Math.max(0, (s.daily.streak - 1) % 7), clock: true };
    streak = (last && last === prevDayKey(now)) ? s.daily.streak + 1 : 1;
    return { canClaim: true, streak: streak, idx: (streak - 1) % 7, broken: !!last && last !== prevDayKey(now) };
  }
  function claimDaily(s, now) {
    var info = dailyInfo(s, now);
    if (!info.canClaim) return null;
    var r = D.DAILY[info.idx], c = calc(s), out = { reward: r, streak: info.streak, gain: 0, pearls: 0 };
    var sm = Math.min(3, 1 + 0.25 * Math.floor((info.streak - 1) / 7));
    if (r.kind === 'time' || r.kind === 'time+pearls') {
      out.gain = Math.max(c.prod * 60 * r.v * sm, 200 * sm); addLight(s, out.gain);
    }
    if (r.kind === 'pearls' || r.kind === 'time+pearls') {
      out.pearls = Math.round((r.kind === 'pearls' ? r.v : r.p) * sm); s.pearls += out.pearls; s.pearlsAll += out.pearls;
    }
    if (r.kind === 'buff') { s.buffs[r.id] = r.left; dirty(s); }
    s.daily.last = dayKey(now); s.daily.streak = info.streak; s.daily.best = Math.max(s.daily.best, info.streak); s.daily.total++;
    return out;
  }

  /* ---------- Достижения ---------- */
  function achTest(s, t) {
    switch (t.t) {
      case 'taps': return s.taps >= t.n;
      case 'allLight': return s.totalLight >= t.n;
      case 'gen': return s.gens[t.i] >= t.n;
      case 'palette': for (var i = 0; i < t.k; i++) if (s.gens[i] < t.n) return false; return true;
      case 'sumgens': var sum = 0; for (var j = 0; j < s.gens.length; j++) sum += s.gens[j]; return sum >= t.n;
      case 'prestiges': return s.prestiges >= t.n;
      case 'ascensions': return s.ascensions >= t.n;
      case 'streak': return s.daily.best >= t.n;
      case 'events': return s.events >= t.n;
      case 'zone': return s.bestZone >= t.n;
      case 'ups': return ownedUpgrades(s) >= t.n;
      case 'prod': return s.stats.maxProd >= t.n;
      case 'play': return s.stats.playTime >= t.n;
      case 'pearlsAll': return s.pearlsAll >= t.n;
      case 'shop': return Object.keys(s.shop).length >= t.n;
      case 'perks': return Object.keys(s.perks).length >= t.n;
      case 'offline': return s.stats.offlineCount >= t.n;
      case 'eras': return s.eras >= t.n;
      case 'eonsAll': return s.eonsAll >= t.n;
      case 'treasures': return treasureCount(s) >= t.n;
      case 'sets': return setsDone(s) >= t.n;
      case 'quests': return s.stats.questsDone >= t.n;
      case 'starsAll': return s.starsAll >= t.n;
      case 'eshop': return Object.keys(s.eshop).length >= t.n;
      case 'dolphins': return s.stats.dolphins >= t.n;
      case 'bottles': return s.stats.bottles >= t.n;
    }
    return false;
  }
  function checkAch(s, now) {
    var got = [];
    for (var i = 0; i < D.ACHIEVEMENTS.length; i++) {
      var a = D.ACHIEVEMENTS[i];
      if (!s.ach[a.id] && achTest(s, a.test)) { s.ach[a.id] = now || Date.now(); got.push(a); }
    }
    if (got.length) dirty(s);
    return got;
  }
  function achBonusPct(s) { var b = 0; for (var i = 0; i < D.ACHIEVEMENTS.length; i++) if (s.ach[D.ACHIEVEMENTS[i].id]) b += D.ACHIEVEMENTS[i].b; return b; }

  return {
    MAX_OWN: MAX_OWN, EV_DUR: EV_DUR, EV_MULT: EV_MULT, TAPFRENZY: TAPFRENZY,
    newState: newState, calc: calc, dirty: dirty, prod: prod, tapValue: tapValue, buffMult: buffMult,
    addLight: addLight, tap: tap,
    baseCost: baseCost, bulkCost: bulkCost, maxAffordable: maxAffordable, buyGen: buyGen, planBuy: planBuy, genUnlocked: genUnlocked,
    upgStatus: upgStatus, buyUpgrade: buyUpgrade, ownedUpgrades: ownedUpgrades,
    zoneFor: zoneFor, zoneNext: zoneNext,
    pearlGain: pearlGain, starGain: starGain, nextPearlAt: nextPearlAt, canPrestige: canPrestige, prestige: prestige,
    canAscend: canAscend, ascend: ascend, eonGain: eonGain, canEra: canEra, nextEonAt: nextEonAt, era: era, buyEshop: buyEshop,
    treasureCount: treasureCount, setsDone: setsDone, rollTreasure: rollTreasure,
    ensureQuests: ensureQuests, questProgress: questProgress, questReward: questReward, claimQuest: claimQuest, questText: questText, makeQuest: makeQuest, startRun: startRun, buyShop: buyShop, buyPerk: buyPerk,
    nextEventDelay: nextEventDelay, spawnStar: spawnStar, applyEvent: applyEvent, clickStar: clickStar,
    tick: tick, computeOffline: computeOffline, applyOffline: applyOffline,
    dayKey: dayKey, dailyInfo: dailyInfo, claimDaily: claimDaily,
    checkAch: checkAch, achBonusPct: achBonusPct
  };
});
