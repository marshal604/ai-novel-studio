// Batch-generate sprite sheets with Codex image generation (adapted from digimon-survivor/art/gen.mjs).
// Usage: node art/gen.mjs [id ...] [--force] [--jobs=3]
// Output: art/raw/<id>.png (copied from ~/.codex/generated_images/<session>/).
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const roster = JSON.parse(readFileSync(join(here, 'roster.json'), 'utf8'));
const rawDir = join(here, 'raw');
mkdirSync(rawDir, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes('--force');
const jobs = Number(args.find((a) => a.startsWith('--jobs='))?.split('=')[1] ?? 3);
const ids = args.filter((a) => !a.startsWith('--'));
const todo = (ids.length ? ids : Object.keys(roster.jobs)).filter((id) => force || !existsSync(join(rawDir, `${id}.png`)));

function prompt(job) {
  const ref = job.ref === 'ref/style_seed.png'
    ? 'Copy ONLY the art style of the attached reference (outline weight, shading, pixel density, chibi proportions); do NOT copy its character, hat or pole.'
    : 'Match the attached reference sheet EXACTLY: same outline weight, palette warmth, head-to-body ratio, pixel density and character size per cell.';
  return [
    'Use your image generation tool to create exactly ONE square 1024x1024 image.',
    roster.style,
    ref,
    job.layout === 'props' ? roster.propsLayout : roster.sheetLayout,
    job.prompt,
    'Do not write any files yourself and do not run shell commands; just generate the image and reply "done".',
  ].join(' ');
}

function newestPng(dir) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

function run(id) {
  const job = roster.jobs[id];
  return new Promise((resolve) => {
    const child = spawn('codex', ['exec', '--skip-git-repo-check', '-s', 'read-only', prompt(job), '-i', join(here, job.ref)], {
      cwd: here,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('close', () => {
      const sid = out.match(/session id:\s*([0-9a-f-]+)/)?.[1];
      const png = sid ? newestPng(join(homedir(), '.codex', 'generated_images', sid)) : null;
      if (png) {
        copyFileSync(png, join(rawDir, `${id}.png`));
        process.stdout.write(`ok   ${id}\n`);
        resolve(true);
      } else {
        const why = out.match(/ERROR:[^\n]*/)?.[0] ?? out.trim().split('\n').slice(-2).join(' | ');
        process.stdout.write(`FAIL ${id}: ${why}\n`);
        resolve(false);
      }
    });
  });
}

let next = 0;
async function worker() {
  while (next < todo.length) await run(todo[next++]);
}
process.stdout.write(`generating ${todo.length} image(s) with ${jobs} job(s)\n`);
await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, worker));
