/* E2E: headless Chrome, телефонный размер. Запуск: node tools/e2e.js [baseUrl]  */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), http = require('http');
const BASE = process.argv[2] || null;
const outDir = path.join(__dirname, '..', 'shots');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function serve() {
  const root = path.join(__dirname, '..');
  return new Promise(res => { const srv = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); } r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(0, '127.0.0.1', () => res(srv)); });
}
async function closeModals(page){ for(let i=0;i<12;i++){ await page.waitForTimeout(200); const n=await page.locator('.modal .btn').count(); if(!n) return; await page.locator('.modal .btn').last().click({force:true}).catch(()=>{}); } }
let ok = 0, bad = 0; const check = (n, c, extra) => { if (c) { ok++; console.log('  ✓', n, extra || ''); } else { bad++; console.log('  ✗', n, extra || ''); } };
(async () => {
  let srv = null, url = BASE;
  if (!url) { srv = await serve(); url = 'http://127.0.0.1:' + srv.address().port + '/'; }
  const exe = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium'].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ru-RU', timezoneId: 'Europe/Minsk' });
  const page = await ctx.newPage();
  const errors = [], failed = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => failed.push(r.url()));
  const external = []; page.on('request', r => { if (!r.url().startsWith(url) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  console.log('Загрузка', url);
  check('заголовок', (await page.title()) === 'Хозяин маяка');
  check('нет внешних запросов', external.length === 0, external.join(','));
  // тап
  const scene = await page.locator('#tapBtn').boundingBox();
  for (let i = 0; i < 30; i++) { await page.touchscreen.tap(scene.x + scene.width / 2, scene.y + scene.height / 2); await page.waitForTimeout(30); }
  let st = await page.evaluate(() => ({ light: __mayak.s.light, taps: __mayak.s.taps }));
  check('касания дают свет', st.taps >= 25 && st.light >= 25, JSON.stringify(st));
  await page.screenshot({ path: path.join(outDir, '1-start.png') });
  // купить свечу
  await page.evaluate(() => { __mayak.s.light = 5000; });
  await page.locator('#genList .row .buy').nth(0).click();
  await page.locator('#genList .row .buy').nth(0).click();
  st = await page.evaluate(() => __mayak.s.gens.slice(0, 3));
  check('покупка генератора кликом', st[0] === 2, JSON.stringify(st));
  await page.locator('#bulkbar button[data-bulk="10"]').click();
  await page.locator('#genList .row .buy').nth(1).click();
  st = await page.evaluate(() => __mayak.s.gens.slice(0, 3));
  check('bulk x10', st[1] === 10 || st[1] === 0, JSON.stringify(st));
  await page.locator('#bulkbar button[data-bulk="1"]').click();
  // улучшения
  await page.locator('#nav button[data-tab="upg"]').click();
  await page.evaluate(() => { __mayak.s.light = 1e6; });
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => Object.keys(__mayak.s.upgrades).length);
  await page.locator('#upgList .row.can .buy').first().click();
  const after = await page.evaluate(() => Object.keys(__mayak.s.upgrades).length);
  check('покупка улучшения кликом', after === before + 1);
  await page.screenshot({ path: path.join(outDir, '2-upgrades.png') });
  // геймплей: пропуск времени, зона, звезда
  await page.locator('#nav button[data-tab="gens"]').click();
  await page.evaluate(() => { const s = __mayak.s; s.light = 3e8; s.runLight = 2e6; s.gens[0] = 30; s.gens[1] = 20; s.gens[2] = 10; s.evTimer = 0.2; });
  await page.waitForTimeout(1800);
  check('зона сменилась и показано окно', await page.evaluate(() => __mayak.s.zone >= 2) && await page.locator('.modal').count() > 0);
  await page.screenshot({ path: path.join(outDir, '3-zone-modal.png') });
  await page.locator('.modal .btn').first().click(); await page.waitForTimeout(200);
  const starVisible = await page.locator('#starBtn:visible').count();
  check('падающая звезда появилась', starVisible === 1);
  if (starVisible) { await page.evaluate(() => document.getElementById('starBtn').click()); await page.waitForTimeout(200); check('звезда поймана', await page.evaluate(() => __mayak.s.events >= 1)); }
  // ежедневная
  await page.locator('#nav button[data-tab="rew"]').click(); await page.waitForTimeout(300);
  await page.locator('#dailyBtn').click(); await page.waitForTimeout(200);
  check('ежедневная награда получена', await page.evaluate(() => __mayak.s.daily.streak === 1));
  await closeModals(page);
  await page.evaluate(() => { __mayak.s.runLight = 5e12; __mayak.s.light = 1e12; });
  await closeModals(page);
  await page.locator('#nav button[data-tab="pres"]').click(); await page.waitForTimeout(600); await closeModals(page);
  await page.screenshot({ path: path.join(outDir, '4-prestige.png'), fullPage: false });
  await page.locator('#pr-btn').click(); await page.waitForTimeout(200);
  await page.locator('.modal .btn.gold').last().click(); await page.waitForTimeout(500);
  st = await page.evaluate(() => ({ p: __mayak.s.prestiges, pearls: __mayak.s.pearls, l: __mayak.s.light }));
  check('отлив через UI', st.p === 1 && st.pearls > 0, JSON.stringify(st));
  // настройки / экспорт / импорт
  await page.locator('#nav button[data-tab="more"]').click(); await page.waitForTimeout(300);
  await page.locator('#set-sound').click();
  check('звук выключается', await page.evaluate(() => __mayak.s.settings.sound === false));
  await page.locator('#btn-export').click();
  const code = await page.locator('#expTa').inputValue();
  check('экспорт даёт код', code.startsWith('MAYAK1:') && code.length > 100);
  await page.locator('.modal .btn.ghost').click();
  await page.screenshot({ path: path.join(outDir, '5-stats.png') });
  // reload → сохранение
  await page.evaluate(() => __mayak.save());
  await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1200);
  st = await page.evaluate(() => ({ p: __mayak.s.prestiges, ach: Object.keys(__mayak.s.ach).length }));
  check('сохранение пережило перезагрузку', st.p === 1, JSON.stringify(st));
  // оффлайн: отдельный контекст с заранее подготовленным сохранением (3 часа назад)
  {
    const S = require('../js/save.js'), E = require('../js/engine.js');
    const st0 = E.newState(Date.now() - 3 * 3600e3); st0.gens[0] = 100; st0.gens[1] = 50; st0.runLight = 5e5; st0.totalLight = 5e5; st0.savedAt = Date.now() - 3 * 3600e3; st0.settings.tab = 'gens';
    const txt = S.serialize(st0);
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const pg = await c2.newPage();
    await pg.addInitScript(t => { if (!localStorage.getItem('mayak-idle.save')) localStorage.setItem('mayak-idle.save', t); }, txt);
    await pg.goto(url, { waitUntil: 'load' }); await pg.waitForTimeout(1500);
    const title = await pg.locator('.modal h2').first().textContent().catch(() => '');
    check('окно «С возвращением» после оффлайна (3 ч)', /возвращением/.test(title), title);
    const gain = await pg.locator('.modal .big').first().textContent().catch(() => '');
    check('сумма оффлайна показана', /\+/.test(gain), gain);
    await pg.screenshot({ path: path.join(outDir, '6-welcome.png') });
    await c2.close();
  }
  // service worker / manifest
  const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); if (!r) return null; await navigator.serviceWorker.ready; return { scope: r.scope, active: !!r.active }; });
  check('service worker зарегистрирован', !!(sw && sw.active), JSON.stringify(sw));
  await page.waitForTimeout(500);
  const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]').href; const m = await (await fetch(l)).json(); const res = []; for (const i of m.icons) { const r = await fetch(new URL(i.src, l)); res.push([i.src, r.status, r.headers.get('content-type')]); } return { m, res }; });
  const m = man.m;
  check('manifest поля', m.name && m.short_name && m.display === 'standalone' && m.orientation === 'portrait' && m.theme_color && m.background_color && m.start_url);
  check('manifest иконки 192/512/maskable', ['192x192', '512x512'].every(sz => m.icons.some(i => i.sizes === sz && i.purpose === 'any')) && m.icons.some(i => i.purpose === 'maskable' && i.sizes === '512x512'));
  check('иконки отдаются', man.res.every(r => r[1] === 200), JSON.stringify(man.res.map(r => r[1])));
  const cacheKeys = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { ks, n: (await c.keys()).length }; });
  check('версионный кэш заполнен', cacheKeys.n >= 18 && /mayak-idle-v/.test(cacheKeys.ks[0]), JSON.stringify(cacheKeys));
  // офлайн-режим
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'load' }).catch(e => console.log('reload offline err', e.message)); await page.waitForTimeout(1200);
  const offOk = await page.evaluate(() => !!window.__mayak && document.getElementById('genList').children.length > 5);
  check('игра грузится офлайн (из кэша SW)', offOk);
  await ctx.setOffline(false);
  // мета-теги
  const meta = await page.evaluate(() => ({ vp: document.querySelector('meta[name=viewport]').content, apple: !!document.querySelector('link[rel=apple-touch-icon]'), theme: !!document.querySelector('meta[name=theme-color]') }));
  check('meta: viewport-fit=cover, apple-touch-icon, theme-color', /viewport-fit=cover/.test(meta.vp) && meta.apple && meta.theme);
  // ширина: нет горизонтального скролла
  const ov = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('нет горизонтального переполнения', ov);
  console.log('Ошибки консоли:', errors.length ? errors : 'нет');
  check('нет ошибок консоли', errors.length === 0);
  // десктоп
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const e2 = []; p2.on('console', m => { if (m.type() === 'error') e2.push(m.text()); }); p2.on('pageerror', e => e2.push(e.message));
  await p2.goto(url); await p2.waitForTimeout(1000); await p2.keyboard.press('Space'); await p2.waitForTimeout(200);
  check('десктоп: пробел = касание, без ошибок', (await p2.evaluate(() => __mayak.s.taps)) >= 1 && e2.length === 0, e2.join(';'));
  await p2.screenshot({ path: path.join(outDir, '7-desktop.png') });
  await browser.close(); if (srv) srv.close();
  console.log(`\nE2E: ${ok} ок, ${bad} ошибок`); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
