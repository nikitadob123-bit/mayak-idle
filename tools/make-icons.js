/* Генерация PNG-иконок из оригинальных SVG. Использует системный Chrome/Chromium через playwright-core. */
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'icons');
const jobs = [
  ['icon.svg', 'icon-192.png', 192], ['icon.svg', 'icon-512.png', 512],
  ['maskable.svg', 'maskable-192.png', 192], ['maskable.svg', 'maskable-512.png', 512],
  ['icon.svg', 'apple-touch-icon.png', 180], ['icon.svg', 'favicon-32.png', 32]
];
(async () => {
  const exe = process.env.CHROME_PATH || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  for (const [src, out, size] of jobs) {
    const svg = fs.readFileSync(path.join(root, src), 'utf8');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(root, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('ok', out, size);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
