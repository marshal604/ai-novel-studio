// Turn the recorded master (art/rec/<slug>.mp4) into README media in docs/media/:
//   office-timelapse.mp4      1920x1080 60 fps master
//   office-timelapse-web.mp4  1280x720 30 fps, < 10 MB
//   office-timelapse.gif      ~10 s from the given segments (default: none -> first 10 s), < 5 MB
// Usage: node art/media.mjs [--slug=badminton-life] [--gif=33-38,88-93]
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
const src = join(here, 'rec', `${arg('slug', 'badminton-life')}.mp4`);
const out = join(here, '..', 'docs', 'media');
mkdirSync(out, { recursive: true });

function ff(args) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
}
const mb = (f) => (statSync(f).size / 1e6).toFixed(1);

const master = join(out, 'office-timelapse.mp4');
copyFileSync(src, master);

// web copy: lower the quality until it fits under 10 MB
const web = join(out, 'office-timelapse-web.mp4');
for (const crf of [26, 29, 32, 35]) {
  ff(['-i', master, '-vf', 'scale=1280:720:flags=lanczos,fps=30', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(crf),
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', web]);
  if (statSync(web).size < 10e6) break;
}

// gif: concatenate the chosen segments, 960 px wide, 15 fps, shared palette
const segs = arg('gif', '0-10').split(',').map((s) => s.split('-').map(Number));
const parts = segs.map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS[s${i}]`).join(';');
const concat = `${segs.map((_, i) => `[s${i}]`).join('')}concat=n=${segs.length}:v=1:a=0[c]`;
const gif = join(out, 'office-timelapse.gif');
for (const width of [960, 800, 720]) {
  const look = `[c]fps=15,scale=${width}:-1:flags=lanczos,split[x][y];[x]palettegen=max_colors=128[p];[y][p]paletteuse=dither=bayer:bayer_scale=4`;
  ff(['-i', master, '-filter_complex', `${parts};${concat};${look}`, gif]);
  if (statSync(gif).size < 5e6) break;
}
process.stdout.write(`master ${mb(master)} MB, web ${mb(web)} MB, gif ${mb(gif)} MB -> ${out}\n`);
