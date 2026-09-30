/* Симуляция прогрессии «жадным» ботом. Запуск: node tools/sim.js [--json]  */
const E = require('../js/engine.js'), D = require('../js/data.js'), U = require('../js/util.js');
const BAL = D.BAL;

function bestPurchase(s) {
  // ищем покупку с наименьшим сроком окупаемости (cost / прирост выработки)
  const p0 = E.prod(s); let best = null;
  const eff = (cost, dp) => dp > 0 ? cost / dp : Infinity;
  for (let i = 0; i < D.GENS.length; i++) {
    if (!E.genUnlocked(s, i) || s.gens[i] >= E.MAX_OWN) continue;
    const cost = E.bulkCost(s, i, 1);
    s.gens[i]++; E.dirty(s); const dp = E.prod(s) - p0; s.gens[i]--; E.dirty(s);
    // если есть зависимые улучшения, генератор ценнее — но бот жадный
    const r = eff(cost, dp);
    if (!best || r < best.r) best = { kind: 'g', i, cost, r };
  }
  for (const u of D.UPGRADES) {
    if (E.upgStatus(s, u) !== 'avail') continue;
    s.upgrades[u.id] = 1; E.dirty(s); const dp = E.prod(s) - p0; const tapv = 0; delete s.upgrades[u.id]; E.dirty(s);
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
function buyPerks(s) { for (const it of D.PERKS) if (!s.perks[it.id] && s.stars >= it.cost) E.buyPerk(s, it.id); }

/**
 * opts: tapsPerSec (активная игра), activeFrac (доля времени с касаниями), sessionsPerDay (для оффлайн-модели)
 * prestigeRule: (s, sim) => bool
 */
function simulate(opts) {
  const rng = U.makeRng(opts.seed || 1);
  const s = E.newState(0); s.settings.bulk = 1;
  const log = { firstPrestige: null, prestiges: [], ascensions: [], zones: {}, milestones: [], tl: [] };
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
      dt = t < 1800 ? 1 : (t < 4 * 3600 ? 3 : (t < 86400 ? 10 : 30));
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
    buyPerks(s);
    if (t >= nextCheck) { log.tl.push({ t, light: s.totalLight, prod: E.prod(s), pearls: s.pearlsAll, stars: s.starsAll, zone: s.bestZone, ach: Object.keys(s.ach).length }); nextCheck = t + 86400 / 4; }
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
function shouldAscend(s, opts) {
  const g = E.starGain(s);
  const first = opts.firstAsc || 3;
  return g >= Math.max(first, s.starsAll * 0.5);
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
  for (const [name, o] of Object.entries(profiles)) {
    if (only && !name.startsWith(only)) continue;
    o.maxDays = 45;
    const r = simulate(o);
    console.log('\n=== ' + name + ' ===');
    console.log('Первый отлив:', r.firstPrestige == null ? 'нет' : hm(r.firstPrestige), '(жемчужин ' + (r.prestiges[0] && r.prestiges[0].pearls) + ')');
    console.log('Зоны:', Object.entries(r.log ? {} : r.zones).map(([z, t]) => D.ZONES[z].name + '@' + hm(t)).join('; '));
    console.log('Отливов:', r.prestiges.length, ' Вознесений:', r.ascensions.length);
    r.ascensions.slice(0, 8).forEach((a, i) => console.log('  вознесение #' + (i + 1) + ' @ ' + hm(a.t) + ' +' + a.stars + '⭐ (всего ' + a.totalStars + ')'));
    console.log('Достижений:', Object.keys(r.state.ach).length + '/' + D.ACHIEVEMENTS.length, ' Итог за', hm(r.endT), ': свет всего', U.fmt(r.state.totalLight), ' выработка', U.fmt(E.prod(r.state)) + '/с', ' ⭐', r.state.starsAll, ' 🦪', r.state.pearlsAll, r.state.stats.capHit ? '(∞ cap!)' : '');
    console.log('Перки:', Object.keys(r.state.perks).length + '/' + D.PERKS.length, ' Дары:', Object.keys(r.state.shop).length + '/' + D.SHOP.length);
    out[name] = { firstPrestige: r.firstPrestige, zones: r.zones, prestiges: r.prestiges.length, ascensions: r.ascensions.slice(0, 12), timeline: r.tl.filter((x, i) => i % 4 === 0).slice(0, 130), end: { t: r.endT, total: r.state.totalLight } };
  }
  if (process.argv.includes('--json')) require('fs').writeFileSync(__dirname + '/../sim-report.json', JSON.stringify(out, null, 1));
}
module.exports = { simulate, hm };
