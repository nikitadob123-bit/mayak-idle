/* E2E миграции и обновления: старая версия (v1.0.0, сохранение v2) → новая версия (v2.0.0, сохранение v3).
 * Запуск: node tools/e2e-migrate.js <путь-к-каталогу-старой-версии>  (например, git archive v1.0.0)  */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), http = require('http');
const OLD = process.argv[2], NEW = path.join(__dirname, '..'), outDir = path.join(NEW, 'shots');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
let root = OLD;
const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(f).pipe(r); });
let ok = 0, bad = 0; const check = (n, c, x) => { c ? ok++ : bad++; console.log(c ? '  ✓' : '  ✗', n, x || ''); };
(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const fixture = fs.readFileSync(path.join(NEW, 'test/fixtures/v2-save.txt'), 'utf8');
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push(e.message));
  // 1. старая версия: подсовываем сохранение v2 (сделанное «реальной» v1.0.0-логикой) и загружаем
  await page.addInitScript(t => { if (!localStorage.getItem('mayak-idle.save')) localStorage.setItem('mayak-idle.save', t); }, fixture);
  await page.goto(url, { waitUntil: 'load' }); await page.waitForTimeout(1500);
  const oldInfo = await page.evaluate(async () => { await navigator.serviceWorker.ready; const ks = await caches.keys(); return { v: __mayak.s.v, gens: __mayak.s.gens.length, ks, pearls: __mayak.s.pearls, light: __mayak.s.light }; });
  check('старая версия: сохранение v2, 14 генераторов, кэш v1.0.0', oldInfo.v === 2 && oldInfo.gens === 14 && oldInfo.ks.join() === 'mayak-idle-v1.0.0', JSON.stringify(oldInfo));
  // типичный случай: игрок уже открывал игру раньше (страница под контролем SW) — перезагружаем
  await page.evaluate(() => __mayak.save()); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  await page.evaluate(() => __mayak.save());
  while (await page.locator('.modal .btn').count()) await page.locator('.modal .btn').last().click({ force: true }).catch(() => {});
  // 2. «выкатываем» новую версию и просим SW проверить обновление
  root = NEW;
  await page.evaluate(() => __swReg.update()); await page.waitForTimeout(1500);
  const waiting = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r.waiting, active: !!r.active }; });
  check('новый SW ждёт (не активируется сам)', waiting.waiting && waiting.active, JSON.stringify(waiting));
  const tst = await page.locator('#updGo').count();
  check('показана кнопка «Обновить сейчас»', tst === 1);
  await page.screenshot({ path: path.join(outDir, '10-update-toast.png') });
  const oldMarkup = await page.evaluate(() => document.querySelectorAll('#genList .row').length);
  check('до нажатия работает старая версия (14 огней + строка-замок)', oldMarkup === 15, String(oldMarkup));
  // 3. нажимаем «Обновить сейчас»
  await Promise.all([page.waitForEvent('load', { timeout: 15000 }).catch(() => null), page.locator('#updGo').click()]);
  await page.waitForFunction(() => window.__mayak && __mayak.s.v === 3 && document.querySelectorAll('#genList .row').length === 24, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const nw = await page.evaluate(async () => { const ks = await caches.keys(); const s = __mayak.s; return { ks, v: s.v, gens: s.gens.slice(0, 6), n: s.gens.length, pearls: s.pearls, prestiges: s.prestiges, stars: s.stars, ascensions: s.ascensions, upg: Object.keys(s.upgrades).length, ach: Object.keys(s.ach).length, streak: s.daily.streak, theme: s.settings.theme, taps: s.taps, total: s.totalLight, zone: s.bestZone, rows: document.querySelectorAll('#genList .row').length, eras: s.eras, starsCycle: s.starsCycle, offline: s.stats.offlineCount }; });
  check('после обновления: страница v2.0.0 (23 генератора), сохранение v3', nw.v === 3 && nw.n === 23, JSON.stringify(nw));
  check('старый кэш удалён, остался mayak-idle-v2.0.0', nw.ks.join() === 'mayak-idle-v2.0.0', nw.ks.join());
  check('прогресс не потерян', JSON.stringify(nw.gens) === '[120,80,45,30,12,5]' && nw.pearls === 40 && nw.prestiges === 9 && nw.stars === 3 && nw.ascensions === 1 && nw.upg === 10 && nw.ach >= 5 && nw.streak === 4 && nw.theme === 'dawn' && nw.taps === 1234 && nw.total >= 9.9e15 && nw.zone === 6, JSON.stringify(nw));
  check('поля v3 инициализированы', nw.eras === 0 && nw.starsCycle === 5);
  const ver = await page.evaluate(async () => (await (await fetch('sw.js')).text()).match(/VERSION = '([^']+)'/)[1]);
  check('sw.js отдаёт версию 2.0.0', ver === '2.0.0', ver);
  await page.screenshot({ path: path.join(outDir, '11-after-migration.png') });
  // 4. свежий контекст без сохранения: новая версия ставится сразу (без «обновления»)
  console.log('Ошибки консоли:', errors.length ? errors : 'нет'); check('нет ошибок консоли', errors.length === 0);
  await browser.close(); srv.close();
  console.log(`\nМиграция/обновление: ${ok} ок, ${bad} ошибок`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
