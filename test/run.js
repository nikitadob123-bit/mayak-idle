/* Юнит-тесты логики без браузера. Запуск: node test/run.js */
const assert = require('assert');
const U = require('../js/util.js'), D = require('../js/data.js'), E = require('../js/engine.js'), S = require('../js/save.js');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; console.log('  ✓', name); } catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); } }
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), a + ' ≉ ' + b);
class Store { constructor() { this.m = {}; } getItem(k) { return k in this.m ? this.m[k] : null; } setItem(k, v) { this.m[k] = String(v); } removeItem(k) { delete this.m[k]; } }

console.log('Форматирование чисел');
t('малые числа', () => { assert.strictEqual(U.fmt(0), '0'); assert.strictEqual(U.fmt(999), '999'); assert.strictEqual(U.fmt(12.9), '12'); });
t('K/M/B/T', () => { assert.strictEqual(U.fmt(1500), '1.50K'); assert.strictEqual(U.fmt(2.5e6), '2.50M'); assert.strictEqual(U.fmt(3.21e9), '3.21B'); assert.strictEqual(U.fmt(4.5e12), '4.50T'); assert.strictEqual(U.fmt(123456), '123K'); });
t('граница округления 999.9K → 1.00M', () => { assert.strictEqual(U.fmt(999999), '1.00M'); });
t('научная запись', () => { assert.strictEqual(U.fmt(1e15), '1.00e15'); assert.strictEqual(U.fmt(2.5e100), '2.50e100'); assert.strictEqual(U.fmt(9.999e20), '10.00e20' === U.fmt(9.999e20) ? '10.00e20' : U.fmt(9.999e20)); assert.ok(!/10\.00e/.test(U.fmt(9.9999e20))); });
t('∞ cap и мусор', () => { assert.strictEqual(U.fmt(1e300), '∞ cap'); assert.strictEqual(U.fmt(Infinity), '∞ cap'); assert.strictEqual(U.fmt(NaN), '0'); assert.strictEqual(U.clamp(NaN), 0); assert.strictEqual(U.clamp(-5), 0); assert.strictEqual(U.clamp(1e400), U.CAP); });
t('fmtTime', () => { assert.strictEqual(U.fmtTime(59), '59с'); assert.strictEqual(U.fmtTime(3700), '1ч 1м'); assert.strictEqual(U.fmtTime(90000), '1д 1ч'); });

console.log('Данные');
t('≥10 генераторов, ≥30 улучшений, ≥5 зон, ≥40 достижений', () => { assert.ok(D.GENS.length >= 10 && D.UPGRADES.length >= 30 && D.ZONES.length >= 5 && D.ACHIEVEMENTS.length >= 40); });
t('цены генераторов строго растут (экспонента)', () => { for (let i = 1; i < D.GENS.length; i++) assert.ok(D.GENS[i].cost / D.GENS[i - 1].cost > 5); });
t('уникальные id, все prereq существуют, нет циклов', () => {
  const ids = new Set(); D.UPGRADES.forEach(u => { assert.ok(!ids.has(u.id), u.id); ids.add(u.id); });
  D.UPGRADES.forEach(u => u.req.forEach(r => assert.ok(D.UPG[r], u.id + ' -> ' + r)));
  const seen = {}, stack = {}; const dfs = id => { if (stack[id]) throw new Error('цикл ' + id); if (seen[id]) return; stack[id] = 1; D.UPG[id].req.forEach(dfs); stack[id] = 0; seen[id] = 1; }; D.UPGRADES.forEach(u => dfs(u.id));
  const aid = new Set(); D.ACHIEVEMENTS.forEach(a => { assert.ok(!aid.has(a.id), a.id); aid.add(a.id); });
});
t('все улучшения достижимы (при бесконечных ресурсах)', () => {
  const s = E.newState(0); s.light = 1e200; D.GENS.forEach((g, i) => s.gens[i] = 500); E.dirty(s);
  let n = 1; while (n) { n = 0; D.UPGRADES.forEach(u => { if (E.buyUpgrade(s, u.id)) n++; }); }
  assert.strictEqual(E.ownedUpgrades(s), D.UPGRADES.length);
});

console.log('Стоимость и покупка');
t('цена n-го генератора = base * 1.15^n', () => { const s = E.newState(0); near(E.baseCost(s, 0), 15); s.gens[0] = 10; near(E.baseCost(s, 0), 15 * Math.pow(1.15, 10)); });
t('bulkCost = сумма геом. прогрессии', () => { const s = E.newState(0); s.gens[1] = 3; let sum = 0; for (let k = 0; k < 10; k++) sum += 100 * Math.pow(1.15, 3 + k); near(E.bulkCost(s, 1, 10), sum); });
t('maxAffordable совпадает с полным перебором', () => { for (const L of [14, 15, 200, 5e3, 1e6, 1e12]) { const s = E.newState(0); s.light = L; s.gens[0] = 7; let k = 0, c = 0; while (k < 1500) { const n = 15 * Math.pow(1.15, 7 + k); if (c + n > L) break; c += n; k++; } assert.strictEqual(E.maxAffordable(s, 0), Math.min(k, 1500 - 7), 'L=' + L); } });
t('покупка x1 / x10 / x100 / max списывает верную сумму', () => {
  const s = E.newState(0); s.light = 1e9; const c10 = E.bulkCost(s, 0, 10); assert.strictEqual(E.buyGen(s, 0, 10), 10); near(s.light, 1e9 - c10); assert.strictEqual(s.gens[0], 10);
  assert.strictEqual(E.buyGen(s, 0, 100), 100); assert.strictEqual(s.gens[0], 110);
  const n = E.maxAffordable(s, 0); assert.strictEqual(E.buyGen(s, 0, 'max'), n); assert.ok(s.light >= 0);
});
t('нельзя купить без денег и в закрытой зоне', () => { const s = E.newState(0); s.light = 10; assert.strictEqual(E.buyGen(s, 0, 1), 0); s.light = 1e15; assert.strictEqual(E.buyGen(s, 5, 1), 0); assert.strictEqual(E.buyGen(s, 0, 10), 10); });
t('рубежи ×2 на 10/25/50…', () => { const s = E.newState(0); s.gens[0] = 9; E.dirty(s); const p9 = E.calc(s).genProd[0] / 9; s.gens[0] = 10; E.dirty(s); near(E.calc(s).genProd[0] / 10, p9 * 2); s.gens[0] = 25; E.dirty(s); near(E.calc(s).genProd[0] / 25, p9 * 4); });
t('улучшения: нужны prereq и условия', () => {
  const s = E.newState(0); s.light = 1e12; assert.ok(!E.buyUpgrade(s, 'h2')); assert.ok(E.buyUpgrade(s, 'h1')); assert.ok(E.buyUpgrade(s, 'h2'));
  assert.ok(!E.buyUpgrade(s, 'g0_0'), 'нужна свеча'); s.gens[0] = 1; assert.ok(E.buyUpgrade(s, 'g0_0')); assert.ok(!E.buyUpgrade(s, 'g0_0'), 'дважды нельзя');
});
t('касание x2 от улучшения и % от выработки', () => { const s = E.newState(0); near(E.tapValue(s), 1); s.light = 1e5; E.buyUpgrade(s, 'h1'); near(E.tapValue(s), 2); s.gens[0] = 100; s.upgrades.h3 = 1; E.dirty(s); assert.ok(E.tapValue(s) > 2 + 0.019 * E.prod(s)); });

console.log('Зоны');
t('зоны открываются по пороговому свету', () => { const s = E.newState(0); assert.strictEqual(E.zoneFor(s), 0); s.runLight = 2.5e3; assert.strictEqual(E.zoneFor(s), 1); s.runLight = 5e15; assert.strictEqual(E.zoneFor(s), 5, 'зона 6 требует вознесения'); s.ascensions = 1; assert.strictEqual(E.zoneFor(s), 6); });
t('tick повышает зону и даёт уведомление', () => { const s = E.newState(0); s.runLight = 3e3; const n = E.tick(s, 1); assert.ok(n.some(x => x.t === 'zone') && s.zone === 1); });

console.log('Отлив (престиж)');
t('формула жемчужин', () => { const s = E.newState(0); s.runLight = D.BAL.prestigeBase * 0.99; assert.strictEqual(E.pearlGain(s), 0); s.runLight = 1e14; near(E.pearlGain(s), Math.floor(Math.pow(1e14 / D.BAL.prestigeBase, D.BAL.pearlExp))); });
t('прирост монотонен по свету', () => { const s = E.newState(0); let last = 0; for (let e = 6; e < 60; e += 2) { s.runLight = Math.pow(10, e); const g = E.pearlGain(s); assert.ok(g >= last); last = g; } });
t('отлив сбрасывает забег, сохраняет мета', () => {
  const s = E.newState(0); s.runLight = 1e12; s.light = 5e11; s.gens[0] = 40; s.upgrades.w1 = 1; s.taps = 77; s.ach.tap0 = 1; s.stats.playTime = 500; E.dirty(s);
  const g = E.pearlGain(s); assert.ok(g >= 1); assert.strictEqual(E.prestige(s), g);
  assert.strictEqual(s.pearls, g); assert.strictEqual(s.prestiges, 1); assert.strictEqual(s.light, 0); assert.strictEqual(s.gens[0], 0); assert.strictEqual(s.zone, 0); assert.ok(!s.upgrades.w1);
  assert.strictEqual(s.taps, 77); assert.ok(s.ach.tap0); assert.strictEqual(s.stats.playTime, 500);
});
t('жемчужины дают множитель', () => { const s = E.newState(0); s.gens[0] = 10; E.dirty(s); const p0 = E.prod(s); s.pearlsCycle = 100; E.dirty(s); near(E.prod(s), p0 * Math.pow(1 + 0.02 * 100, D.BAL.pearlPow)); });
t('отлив недоступен без порога', () => { const s = E.newState(0); s.runLight = 100; assert.strictEqual(E.prestige(s), 0); assert.strictEqual(s.prestiges, 0); });
t('дар «Стартовый запас» и «Помощники» работают после отлива', () => {
  const s = E.newState(0); s.pearls = 100; assert.ok(E.buyShop(s, 's1')); assert.ok(E.buyShop(s, 's6')); s.runLight = 1e12; E.prestige(s);
  assert.ok(s.light >= 1000); assert.strictEqual(s.gens[0], 10);
});
t('память руки сохраняет h1–h3', () => { const s = E.newState(0); s.pearls = 100; E.buyShop(s, 's3'); s.upgrades = { h1: 1, h2: 1, w1: 1 }; E.dirty(s); s.runLight = 1e12; E.prestige(s); assert.ok(s.upgrades.h1 && s.upgrades.h2 && !s.upgrades.w1); });

console.log('Вознесение');
t('звёзды из жемчужин цикла', () => { const s = E.newState(0); s.pearlsCycle = D.BAL.ascendBase - 1; assert.strictEqual(E.starGain(s), 0); s.pearlsCycle = D.BAL.ascendBase * 4; assert.strictEqual(E.starGain(s), 2); });
t('вознесение сбрасывает жемчужины/дары, сохраняет звёзды/созвездия/достижения', () => {
  const s = E.newState(0); s.pearlsCycle = 10000; s.pearls = 500; s.pearlsAll = 10000; s.prestiges = 30; s.shop.s1 = 1; s.ach.tap0 = 1; s.stars = 2; s.perks.c1 = 1; s.runLight = 1e10; E.dirty(s);
  const g = E.starGain(s); assert.ok(g >= 1); assert.strictEqual(E.ascend(s), g);
  assert.strictEqual(s.stars, 2 + g); assert.strictEqual(s.pearls, 0); assert.strictEqual(s.pearlsCycle, 0); assert.deepStrictEqual(s.shop, {}); assert.ok(s.perks.c1 && s.ach.tap0); assert.strictEqual(s.ascensions, 1); assert.strictEqual(s.prestiges, 30);
});
t('созвездие «Память жемчуга» оставляет 10%', () => { const s = E.newState(0); s.pearlsCycle = 10000; s.pearls = 500; s.perks.c6 = 1; E.dirty(s); E.ascend(s); assert.strictEqual(s.pearls, 50); });
t('покупка созвездий за звёзды', () => { const s = E.newState(0); s.stars = 1; assert.ok(E.buyPerk(s, 'c1')); assert.strictEqual(s.stars, 0); assert.ok(!E.buyPerk(s, 'c2')); });

console.log('Оффлайн');
t('меньше минуты — ничего', () => { const s = E.newState(0); s.gens[0] = 100; s.savedAt = 0; assert.strictEqual(E.computeOffline(s, 30000), null); });
t('прирост = выработка × время × эффективность', () => { const s = E.newState(0); s.gens[0] = 100; E.dirty(s); s.savedAt = 0; const r = E.computeOffline(s, 3600 * 1000); near(r.gain, E.calc(s).prod * 3600 * 0.5); assert.ok(!r.capped); });
t('лимит 8 часов', () => { const s = E.newState(0); s.gens[0] = 100; E.dirty(s); s.savedAt = 0; const r = E.computeOffline(s, 5 * 86400e3); near(r.used, 8 * 3600); assert.ok(r.capped); });
t('улучшения и дары увеличивают лимит/эффективность', () => { const s = E.newState(0); s.upgrades.w3 = 1; s.upgrades.w4 = 1; s.shop.s4 = 1; s.perks.c4 = 1; E.dirty(s); const c = E.calc(s); near(c.offcap, 8 + 4 + 8 + 16); near(c.offeff, 0.65); });
t('часы назад (отрицательное время) и безумные значения игнорируются', () => { const s = E.newState(0); s.gens[0] = 10; s.savedAt = 1e12; assert.strictEqual(E.computeOffline(s, 1000), null); s.savedAt = 0; assert.strictEqual(E.computeOffline(s, 1e15), null); });
t('applyOffline добавляет свет и статистику', () => { const s = E.newState(0); s.gens[0] = 100; E.dirty(s); s.savedAt = 0; const r = E.applyOffline(s, 7200e3); assert.ok(s.light > 0 && s.stats.offlineCount === 1); near(s.light, r.gain); });

console.log('События');
t('спавн звезды по таймеру и клик даёт бонус', () => { const s = E.newState(0); s.gens[0] = 50; E.dirty(s); s.evTimer = 0.5; E.tick(s, 1, () => 0.1); assert.ok(s.star); const before = s.light; const r = E.clickStar(s); assert.ok(r && r.gain > 0 && s.light > before); assert.strictEqual(s.star, null); });
t('звезда исчезает по таймауту', () => { const s = E.newState(0); s.star = { kind: 'lucky', ttl: 1, x: .5, y: .5 }; E.tick(s, 2); assert.strictEqual(s.star, null); });
t('баффы: безумие ×7 и корректное окончание в середине тика', () => { const s = E.newState(0); s.gens[0] = 100; E.dirty(s); const base = E.calc(s).prod; s.buffs.frenzy = 5; E.tick(s, 10, () => 0.9); near(s.runLight, base * (5 * 7 + 5 * 1), 1e-9); assert.ok(!s.buffs.frenzy); });
t('золотые пальцы ×20 для касания', () => { const s = E.newState(0); s.buffs.tapfrenzy = 10; near(E.tapValue(s), 20); });

console.log('Ежедневные награды');
{
  const d = (y, m, dd, h = 12) => new Date(y, m - 1, dd, h).getTime();
  t('первая награда, серия, повтор в тот же день', () => { const s = E.newState(0); const r = E.claimDaily(s, d(2026, 5, 1)); assert.ok(r && r.streak === 1); assert.strictEqual(E.claimDaily(s, d(2026, 5, 1, 20)), null); });
  t('следующий день продлевает серию, пропуск — сбрасывает', () => { const s = E.newState(0); E.claimDaily(s, d(2026, 5, 1)); E.claimDaily(s, d(2026, 5, 2)); assert.strictEqual(s.daily.streak, 2); E.claimDaily(s, d(2026, 5, 3)); assert.strictEqual(s.daily.streak, 3); const r = E.claimDaily(s, d(2026, 5, 6)); assert.strictEqual(r.streak, 1); assert.strictEqual(s.daily.best, 3); });
  t('переход через конец месяца/года', () => { const s = E.newState(0); E.claimDaily(s, d(2026, 12, 31)); const r = E.claimDaily(s, d(2027, 1, 1)); assert.strictEqual(r.streak, 2); });
  t('часы назад — награда недоступна', () => { const s = E.newState(0); E.claimDaily(s, d(2026, 5, 10)); assert.strictEqual(E.claimDaily(s, d(2026, 5, 2)), null); });
  t('цикл из 7 дней, награды растут', () => { const s = E.newState(0); s.gens[0] = 50; E.dirty(s); for (let i = 0; i < 8; i++) { const r = E.claimDaily(s, d(2026, 6, 1 + i)); assert.ok(r); if (i === 4) assert.ok(r.pearls > 0); } assert.strictEqual(s.daily.streak, 8); });
}

console.log('Достижения');
t('выдаются и дают бонус к выработке', () => { const s = E.newState(0); s.gens[0] = 10; E.dirty(s); const p = E.prod(s); s.taps = 1; const got = E.checkAch(s, 1); assert.ok(got.some(a => a.id === 'tap0')); assert.ok(E.prod(s) > p); assert.strictEqual(E.checkAch(s, 2).length, 0 + E.checkAch(s, 2).length); });
t('бонус достижений = сумма b%', () => { const s = E.newState(0); s.ach.tap0 = 1; s.ach.asc0 = 1; assert.strictEqual(E.achBonusPct(s), 1 + 5); });

console.log('Сохранение / загрузка / миграция');
t('roundtrip сериализации', () => { const s = E.newState(5); s.light = 12345.5; s.gens[3] = 9; s.upgrades.h1 = 1; s.settings.theme = 'dawn'; const p = S.parseAny(S.serialize(s), 5); assert.strictEqual(p.light, 12345.5); assert.strictEqual(p.gens[3], 9); assert.ok(p.upgrades.h1); assert.strictEqual(p.settings.theme, 'dawn'); });
t('save/load через localStorage-мок + резервная копия', () => { const st = new Store(), s = E.newState(); s.light = 1; S.save(s, st); s.light = 2; S.save(s, st); assert.ok(st.getItem(D.BACKUP_KEY)); const r = S.load(st); assert.strictEqual(r.status, 'ok'); assert.strictEqual(r.state.light, 2); });
t('битый основной слот → резервная копия', () => { const st = new Store(), s = E.newState(); s.light = 1; S.save(s, st); s.light = 2; S.save(s, st); st.setItem(D.SAVE_KEY, st.getItem(D.SAVE_KEY).slice(0, -5)); const r = S.load(st); assert.strictEqual(r.status, 'restored-backup'); assert.strictEqual(r.state.light, 1); });
t('всё повреждено → новая игра, мусор сохранён отдельно', () => { const st = new Store(); st.setItem(D.SAVE_KEY, 'абракадабра'); const r = S.load(st); assert.ok(r.status.startsWith('corrupt')); assert.strictEqual(r.state.light, 0); assert.strictEqual(st.getItem(D.SAVE_KEY + '.corrupt'), 'абракадабра'); });
t('пустое хранилище → новая игра', () => { assert.strictEqual(S.load(new Store()).status, 'new'); });
t('изменённый вручную JSON (неверная контрольная сумма) отвергается', () => { const s = E.newState(); const txt = S.serialize(s).replace('"light":0', '"light":999'); assert.throws(() => S.deserializeRaw(txt)); });
t('sanitize: NaN/Infinity/отрицательные/строки/чужие ключи', () => {
  const p = S.sanitize({ light: NaN, runLight: -5, totalLight: Infinity, taps: 'abc', gens: [1e9, -3, 'x', null], upgrades: { h1: 1, evil: 1 }, zone: 99, settings: { theme: 'hack', bulk: 7 }, pearls: 1e999, ach: { nope: 1, tap0: 1 } }, 0);
  assert.strictEqual(p.light, 0); assert.strictEqual(p.runLight, 0); assert.strictEqual(p.totalLight, U.CAP); assert.strictEqual(p.taps, 0); assert.strictEqual(p.gens[0], E.MAX_OWN); assert.strictEqual(p.gens[1], 0); assert.strictEqual(p.gens[2], 0);
  assert.ok(p.upgrades.h1 && !p.upgrades.evil); assert.strictEqual(p.zone, D.ZONES.length - 1); assert.strictEqual(p.settings.theme, 'night'); assert.strictEqual(p.settings.bulk, 1); assert.strictEqual(p.pearls, U.CAP); assert.ok(p.ach.tap0 && !p.ach.nope);
  assert.ok(isFinite(E.prod(p)));
});
t('sanitize(null/строка/число) → новая игра', () => { [null, undefined, 5, 'x', []].forEach(v => assert.strictEqual(S.sanitize(v, 0).light, 0)); });
t('миграция v1 → v2', () => {
  const old = { v: 1, light: 500, runLight: 500, totalLight: 900, gens: [3, 1], prestigePoints: 7, era: 1 };
  const body = JSON.stringify(old), txt = S.hash(body) + '|' + body; const p = S.parseAny(txt, 0);
  assert.strictEqual(p.v, D.SAVE_VERSION); assert.strictEqual(p.pearls, 7); assert.strictEqual(p.zone, 1); assert.strictEqual(p.gens[0], 3); assert.ok(p.daily && p.stars === 0);
});
t('сохранение из будущей версии отвергается', () => { const body = JSON.stringify({ v: 99 }); assert.throws(() => S.parseAny(S.hash(body) + '|' + body, 0), /newer/); });
t('экспорт → импорт (включая кириллицу/эмодзи в настройках)', () => { const s = E.newState(); s.light = 42; s.pearls = 3; s.settings.tab = 'gens'; const code = S.exportCode(s); assert.ok(code.startsWith('MAYAK1:')); const p = S.importCode('\n ' + code.slice(0, 20) + '\n' + code.slice(20) + ' '); assert.strictEqual(p.light, 42); assert.strictEqual(p.pearls, 3); });
t('импорт мусора → ошибка', () => { ['', 'hello', 'MAYAK1:', 'MAYAK1:@@@@', 'MAYAK1:' + Buffer.from('12345678|{}').toString('base64')].forEach(c => assert.throws(() => S.importCode(c))); });
t('save с недоступным хранилищем не бросает', () => { const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); } }; assert.strictEqual(S.save(E.newState(), bad), false); assert.strictEqual(S.load(bad).status, 'new'); });

console.log('Числовая безопасность');
t('предел 1e300: свет не превышает CAP, NaN не появляется', () => {
  const s = E.newState(0); s.light = 1e299; s.gens.fill(1500); s.upgrades.w9 = 1; s.perks.c10 = 1; s.stars = 1e290; s.pearlsCycle = 1e290; E.dirty(s);
  for (let i = 0; i < 20; i++) E.tick(s, 3600);
  assert.ok(isFinite(s.light) && s.light <= U.CAP && s.totalLight <= U.CAP && s.runLight <= U.CAP); assert.strictEqual(s.stats.capHit, 1); assert.strictEqual(U.fmt(s.light), '∞ cap');
  assert.ok(isFinite(E.prod(s)) && isFinite(E.pearlGain(s)) && isFinite(E.starGain(s)));
});
t('1000 случайных тиков/покупок не ломают инварианты', () => {
  const rng = U.makeRng(7), s = E.newState(0);
  for (let i = 0; i < 1000; i++) { const r = rng(); if (r < .3) E.tap(s); else if (r < .6) E.buyGen(s, Math.floor(rng() * 14), [1, 10, 100, 'max'][Math.floor(rng() * 4)]); else if (r < .7) E.buyUpgrade(s, D.UPGRADES[Math.floor(rng() * D.UPGRADES.length)].id); else E.tick(s, rng() * 20, rng); s.light += rng() * 1e6 * Math.pow(10, i / 60); }
  assert.ok(s.light >= 0 && isFinite(s.light)); s.gens.forEach(g => assert.ok(g >= 0 && g <= E.MAX_OWN));
});

console.log('\nИтого: ' + pass + ' пройдено, ' + fail + ' упало');
process.exit(fail ? 1 : 0);
