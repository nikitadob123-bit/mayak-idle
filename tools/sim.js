/* Симуляция прогрессии «жадным» ботом. Запуск: node tools/sim.js [--json]  */
const E = require('../js/engine.js'), D = require('../js/data.js'), U = require('../js/util.js');
const BAL = D.BAL;

function bestPurchase(s) {
  // ищем покупку с наименьшим сроком окупаемости (cost / прирост выработки)
  const p0 = E.prod(s); let best = null;
  const eff = (cost, dp) => dp > 0 ? cost / dp : Infinity;
  const c0 = E.calc(s);
  for (let i = 0; i < D.GENS.length; i++) {
    if (!E.genUnlocked(s, i) || s.gens[i] >= E.MAX_OWN) continue;
    const cost = E.bulkCost(s, i, 1);
    // маргинальный прирост (учёт рубежей ×2 — приближённо: следующий рубеж считаем сразу, если близко)
    const n = s.gens[i]; let dp = n > 0 ? c0.genProd[i] / n : D.GENS[i].prod * c0.genx[i] * c0.global;
    if (n === 0) dp = D.GENS[i].prod * c0.genx[i] * c0.global;
    const nm = D.BAL.milestones.find(m => m > n);
    if (nm && nm - n <= 3 && n > 0) dp *= 1.6;
    dp *= E.buffMult(s);
    const r = eff(cost, dp);
    if (!best || r < best.r) best = { kind: 'g', i, cost, r };
  }
  for (const u of D.UPGRADES) {
    if (E.upgStatus(s, u) !== 'avail' || u.cost > s.light * 30 + 1e3) continue;
    s.upgrades[u.id] = 1; E.dirty(s); const dp = E.prod(s) - p0; delete s.upgrades[u.id]; E.dirty(s);
    let r = eff(u.cost, dp);
    if (dp === 0) r = u.e.t === 'tapx' || u.e.t === 'tapfrac' || u.e.t === 'auto' ? u.cost / Math.max(1, p0 * 0.02) : (u.cost / Math.max(1, p0 * 0.02)) * 3;
    if (u.e.t === 'cost') r = u.cost / Math.max(1e-9, p0 * 0.05);
    if (!best || r < best.r) best = { kind: 'u', id: u.id, cost: u.cost, r };
  }
  return best;
}

function buyShopAll(s) {
  let bought = true;
  while (bought) {
    bought = false;
    for (const it of D.SHOP) if (!s.shop[it.id] && s.pearls >= it.cost) { E.buyShop(s, it.id); bought = true; }
  }
}
function buyEshopAll(s) { for (const it of D.ESHOP) if (!s.eshop[it.id] && s.eons >= it.cost) E.buyEshop(s, it.id); }
function buyPerks(s) { for (const it of D.PERKS) if (!s.perks[it.id] && s.stars >= it.cost) E.buyPerk(s, it.id); }

/**
 * opts: tapsPerSec (активная игра), activeFrac (доля времени с касаниями), sessionsPerDay (для оффлайн-модели)
 * prestigeRule: (s, sim) => bool
 */
function simulate(opts) {
  const rng = U.makeRng(opts.seed || 1);
  const s = E.newState(0); s.settings.bulk = 1;
  const log = { firstPrestige: null, prestiges: [], ascensions: [], eras: [], zones: {}, milestones: [], tl: [] };
  const cache0 = 0; let t = 0, nextCheck = 0, lastPrestigeT = 0;
  const maxT = (opts.maxDays || 30) * 86400;
  const tapRate = opts.tapsPerSec || 3;
  let dt = 1; const cache = { b: null, n: 0 };
  const dailyHours = opts.hoursPerDay || 2; // сколько времени в сутки игрок реально играет (остальное — оффлайн)
  const sessionsPerDay = opts.sessions || 4;
  while (t < maxT) {
    const day = Math.floor(t / 86400), tod = t % 86400;
    // модель дня: sessionsPerDay сессий, суммарно dailyHours ч. Первая сессия «нулевого дня» — сплошная игра пока не уйдёт первый отлив.
    let active;
    if (opts.firstRunActive && s.prestiges === 0 && t < opts.firstRunActive * 60) active = true;
    else {
      const sesLen = dailyHours * 3600 / sessionsPerDay, gap = 86400 / sessionsPerDay;
      active = (tod % gap) < sesLen;
    }
    if (active) {
      dt = t < 1800 ? 1 : (t < 4 * 3600 ? 3 : (t < 86400 ? 10 : (t < 20 * 86400 ? 30 : 60)));
      // касания
      const ntap = tapRate * dt * (opts.activeFrac == null ? 0.7 : opts.activeFrac);
      const tv = E.tapValue(s); E.addLight(s, tv * ntap); s.taps += ntap;
      // покупки
      for (let guard = 0; guard < 400; guard++) {
        if (!cache.b || ++cache.n > 20) { cache.b = bestPurchase(s); cache.n = 0; }
        const b = cache.b; if (!b || b.cost > s.light) break;
        cache.b = null;
        if (b.kind === 'g') { if (!E.buyGen(s, b.i, 1)) break; } else if (!E.buyUpgrade(s, b.id)) break;
      }
      E.tick(s, dt, rng);
      // ловим звёзды с вероятностью
      if (s.star && rng() < (opts.starCatch == null ? 0.7 : opts.starCatch) * dt / 6) E.clickStar(s);
    } else {
      // оффлайн: ускоряем шагами по 10 минут при постоянном производстве (игрок не тратит) — модель «вернулся, забрал»
      const gapEnd = ((Math.floor(tod / (86400 / sessionsPerDay)) + 1) * (86400 / sessionsPerDay));
      const span = Math.max(1, gapEnd - tod);
      const off = Math.min(span, calcCap(s) * 3600);
      const gain = E.calc(s).prod * off * E.calc(s).offeff;
      E.addLight(s, gain); s.stats.playTime += span; s.stats.runTime += span;
      s.stats.offlineTotal += gain;
      dt = span;
      // автопокупка помощника и зоны
      const z = E.zoneFor(s); if (z > s.zone) { s.zone = z; E.dirty(s); } if (z > s.bestZone) s.bestZone = z;
      s.buffs = {};
    }
    t += dt;
    E.checkAch(s, t);
    for (let z = 1; z < D.ZONES.length; z++) if (s.bestZone >= z && log.zones[z] == null) log.zones[z] = t;
    // решение о престиже
    const gain = E.pearlGain(s);
    if (gain >= 1 && shouldPrestige(s, gain, opts)) {
      const runT = s.stats.runTime;
      const g = E.prestige(s);
      buyShopAll(s);
      log.prestiges.push({ t, pearls: g, total: s.pearlsAll, runT });
      if (log.firstPrestige == null) log.firstPrestige = t;
      lastPrestigeT = t;
    }
    if (E.canAscend(s) && shouldAscend(s, opts)) {
      const g = E.ascend(s); buyPerks(s);
      log.ascensions.push({ t, stars: g, totalStars: s.starsAll });
      buyShopAll(s);
    }
    if (E.canEra(s) && shouldEra(s, opts)) {
      const g = E.era(s); buyEshopAll(s); buyPerks(s); buyShopAll(s);
      log.eras.push({ t, eons: g, totalEons: s.eonsAll, starsBefore: s.starsAll });
    }
    buyPerks(s); if (s.eons > 0) { buyEshopAll(s); if (log.eshopDone == null && Object.keys(s.eshop).length === D.ESHOP.length) log.eshopDone = t; }
    // модель коллекции: одно сокровище на каждые 2 ч активной игры (бутылки/поручения), грубо
    if (active && s.treasureAcc == null) s.treasureAcc = 0;
    if (active) { s.treasureAcc += dt; if (s.treasureAcc > 7200) { s.treasureAcc = 0; E.rollTreasure(s, rng); E.dirty(s); } }
    if (t >= nextCheck) { log.tl.push({ t, light: s.totalLight, prod: E.prod(s), pearls: s.pearlsAll, stars: s.starsAll, eons: s.eonsAll, eras: s.eras, nt: E.treasureCount(s), zone: s.bestZone, ach: Object.keys(s.ach).length }); nextCheck = t + 86400 / 4; }
    if (s.stats.capHit) break;
  }
  log.state = s; log.endT = t;
  return log;
}
function calcCap(s) { return E.calc(s).offcap; }

function shouldPrestige(s, gain, opts) {
  // Первый отлив — как только жемчужин ≥ порога; далее — когда прирост жемчужин ≥ доли текущих
  const first = opts.firstAt || 12;
  if (s.prestiges === 0) return gain >= first;
  const need = Math.max(first, s.pearlsCycle * (opts.ratio == null ? 0.6 : opts.ratio));
  // не чаще, чем раз в 10 минут игрового времени забега
  return gain >= need && s.stats.runTime > (opts.minRun || 600);
}
function shouldEra(s, opts) {
  const g = E.eonGain(s);
  const first = opts.firstEra || 3;
  return g >= Math.max(first, s.eonsAll * 0.5);
}
function shouldAscend(s, opts) {
  const g = E.starGain(s);
  const first = opts.firstAsc || 3;
  return g >= Math.max(first, s.starsCycle * 0.5);
}

function hm(t) { return t < 3600 ? (t / 60).toFixed(1) + ' мин' : t < 86400 ? (t / 3600).toFixed(1) + ' ч' : (t / 86400).toFixed(1) + ' сут'; }

if (require.main === module) {
  const profiles = {
    'Активный (2 ч/день, 4 сессии)': { hoursPerDay: 2, sessions: 4, tapsPerSec: 3, firstRunActive: 90 },
    'Casual (30 мин/день, 3 сессии)': { hoursPerDay: 0.5, sessions: 3, tapsPerSec: 2, firstRunActive: 60 },
    'Хардкор (6 ч/день, 8 сессий)': { hoursPerDay: 6, sessions: 8, tapsPerSec: 4, firstRunActive: 120 },
  };
  const out = {};
  const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
  const days = +process.env.DAYS || 90;
  for (const [name, o] of Object.entries(profiles)) {
    if (only && !name.startsWith(only)) continue;
    o.maxDays = days;
    const r = simulate(o);
    const st = r.state;
    console.log('\n=== ' + name + ' (' + days + ' сут) ===');
    console.log('Первый отлив:', r.firstPrestige == null ? 'нет' : hm(r.firstPrestige), '(жемчужин ' + (r.prestiges[0] && r.prestiges[0].pearls) + ')');
    console.log('Зоны:', Object.entries(r.zones).map(([z, t]) => D.ZONES[z].name + '@' + hm(t)).join('; '));
    console.log('Отливов:', r.prestiges.length, ' Вознесений:', r.ascensions.length, ' Эпох:', r.eras.length);
    console.log('  вознесения:', r.ascensions.slice(0, 5).map((a, i) => '#' + (i + 1) + '@' + hm(a.t) + ' +' + a.stars).join(' | '));
    console.log('  эпохи:', r.eras.slice(0, 8).map((a, i) => '#' + (i + 1) + '@' + hm(a.t) + ' +' + a.eons + '🌀').join(' | '));
    console.log('Хроники: куплено', Object.keys(st.eshop).length + '/' + D.ESHOP.length + (r.eshopDone ? ' (все @' + hm(r.eshopDone) + ')' : ''), ' Сокровищ:', E.treasureCount(st) + '/' + D.TREASURES.length, ' Достижений:', Object.keys(st.ach).length + '/' + D.ACHIEVEMENTS.length);
    console.log('Итог: свет всего', U.fmt(st.totalLight), ' выработка', U.fmt(E.prod(st)) + '/с', ' ⭐', U.fmt(st.starsAll), ' 🌀', U.fmt(st.eonsAll), st.stats.capHit ? '(∞ cap!)' : '(cap не достигнут)');
    console.log('Кривая (сут: всего света / зона / эоны):', r.tl.filter((x, i) => i % 20 === 0).map(x => (x.t / 86400).toFixed(0) + ':' + U.fmt(x.light) + '/z' + x.zone + '/' + x.eons).join('  '));
    out[name] = { firstPrestige: r.firstPrestige, zones: r.zones, prestiges: r.prestiges.length, ascensions: r.ascensions.length, eras: r.eras.slice(0, 20), eshopDone: r.eshopDone || null,
      timeline: r.tl.filter((x, i) => i % 20 === 0).map(x => ({ day: +(x.t / 86400).toFixed(1), light: x.light, prod: x.prod, zone: x.zone, stars: x.stars, eons: x.eons, ach: x.ach })), end: { t: r.endT, total: st.totalLight, eons: st.eonsAll, stars: st.starsAll } };
  }
  if (process.argv.includes('--json')) require('fs').writeFileSync(__dirname + '/../sim-report' + (only ? '-' + only.slice(0, 3) : '') + '.json', JSON.stringify(out, null, 1));
}
module.exports = { simulate, hm };
