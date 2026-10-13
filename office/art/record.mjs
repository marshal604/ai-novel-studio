// Records the ?demo replay frame-by-frame: a perfectly smooth 60 fps video regardless of machine speed.
// Usage: node art/record.mjs [--replay=badminton-life] [--speed=1] [--from=0] [--seconds=600] [--url=http://localhost:5188/]
// Output: art/rec/frames/%05d.jpg, then (if ffmpeg is installed) art/rec/<replay>.mp4
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const replay = arg('replay', 'badminton-life');
const url = `${arg('url', 'http://localhost:5188/')}?demo&replay=${replay}&speed=${arg('speed', 1)}`;
const from = Number(arg('from', 0));
const maxFrames = Number(arg('seconds', 600)) * 60;
const out = join(here, 'rec');
const frames = join(out, 'frames');
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
page.on('pageerror', (e) => process.stdout.write(`pageerror: ${e.message}\n`));
await page.goto(url);
await page.waitForFunction(() => '__demo' in window, null, { timeout: 30000 });
if (from > 0) await page.evaluate((n) => window.__demo.advance(n), Math.round(from * 60));

let done = false;
let i = 0;
const t0 = Date.now();
while (!done && i < maxFrames) {
  done = (await page.evaluate(() => window.__demo.advance(1))).done;
  await page.screenshot({ path: join(frames, `${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
  i++;
  if (i % 600 === 0) process.stdout.write(`frame ${i} (${i / 60}s of video, ${((Date.now() - t0) / 1000).toFixed(0)}s elapsed)\n`);
}
await browser.close();
process.stdout.write(`done: ${i} frames\n`);

const mp4 = join(out, `${replay}.mp4`);
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '60', '-i', join(frames, '%05d.jpg'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-vf', 'scale=1920:-2', mp4], { stdio: 'inherit' });
process.stdout.write(ff.status === 0 ? `video: ${mp4}\n` : 'ffmpeg not available: frames only\n');
