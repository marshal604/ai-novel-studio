// Screenshot helper: node art/shot.mjs <out-prefix> [--url=...] [--at=5,20,40] (seconds of demo time)
import { chromium } from 'playwright';
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const out = process.argv[2] ?? 'shot';
const url = arg('url', 'http://localhost:5188/?demo&replay=badminton-life');
const at = arg('at', '3').split(',').map(Number);
const dpr = Number(arg('dpr', 2));
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: dpr });
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto(url);
if (url.includes('demo')) {
  await page.waitForFunction(() => '__demo' in window, null, { timeout: 30000 });
  let t = 0;
  for (const s of at) {
    const r = await page.evaluate((n) => window.__demo.advance(n), Math.round((s - t) * 60));
    t = s;
    await page.screenshot({ path: `${out}_${s}.png` });
    console.log('shot', s, JSON.stringify(r));
  }
} else {
  await page.waitForTimeout(Number(arg('wait', 4000)));
  await page.screenshot({ path: `${out}.png` });
}
await browser.close();
