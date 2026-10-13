// Vite plugin: serves the project's logs and novels to the office.
//   GET /data/novels.json        registry (slug, title, status)
//   GET /data/novel/<slug>.json  chapters + that novel's events (replay bundle), merged with
//                                office/data/derived/<slug>.jsonl when present (see scripts/import-transcript.ts)
//   GET /data/stream             SSE: `init` with every event, then `events` as activity.jsonl grows (LIVE)
// `vite build` writes the two JSON endpoints as static files so replay works without a server.
import { existsSync, readFileSync, readdirSync, statSync, unwatchFile, watchFile } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { forNovel, parseActivity, type ActivityEvent } from '../src/core/events';
import { mergeTimeline } from '../src/core/transcript';

export interface NovelInfo {
  slug: string;
  title: string;
  status: string;
  progress: string;
}

export interface Chapter {
  file: string;
  title: string;
  status: string;
  text: string;
}

export interface NovelBundle extends NovelInfo {
  chapters: Chapter[];
  events: ActivityEvent[];
}

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

export function readNovels(root: string): NovelInfo[] {
  const rows = read(join(root, 'novels', 'registry.md'))
    .split('\n')
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((c) => c.length >= 6 && c[1] && !/^-+$/.test(c[1]) && c[1] !== 'slug');
  const dir = join(root, 'novels');
  const onDisk = existsSync(dir) ? readdirSync(dir).filter((d) => statSync(join(dir, d)).isDirectory()) : [];
  // only novels that exist on disk; ones on disk but not (yet) in the registry still show up
  const listed = rows.map(([, slug, title, status, progress]) => ({ slug, title, status, progress })).filter((n) => onDisk.includes(n.slug));
  const extra = onDisk.filter((d) => !listed.some((n) => n.slug === d)).map((slug) => ({ slug, title: outlineTitle(root, slug) ?? slug, status: '', progress: '' }));
  return [...listed, ...extra];
}

function outlineTitle(root: string, slug: string): string | null {
  const m = /《([^》]+)》/.exec(read(join(root, 'novels', slug, 'outline.md')));
  return m ? m[1] : null;
}

/** Split YAML-ish front matter from a chapter file. */
export function parseChapter(file: string, raw: string): Chapter {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  const meta = m ? m[1] : '';
  const field = (k: string) => new RegExp(`^${k}:\\s*"?([^"\\n]*)"?`, 'm').exec(meta)?.[1]?.trim() ?? '';
  return { file, title: field('title'), status: field('status'), text: (m ? raw.slice(m[0].length) : raw).trim() };
}

/** this app's own folder (derived replay events live in data/derived/) */
const officeDir = resolve(import.meta.dirname, '..');

export function readBundle(root: string, slug: string): NovelBundle | null {
  if (!/^[\w-]+$/.test(slug)) return null;
  const info = readNovels(root).find((n) => n.slug === slug);
  const dir = join(root, 'novels', slug, 'chapters');
  if (!info && !existsSync(dir)) return null;
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.md$/.test(f)).sort() : [];
  return {
    ...(info ?? { slug, title: outlineTitle(root, slug) ?? slug, status: '', progress: '' }),
    chapters: files.map((f) => parseChapter(f, read(join(dir, f)))),
    events: mergeTimeline(forNovel(readEvents(root), slug), parseActivity(read(join(officeDir, 'data', 'derived', `${slug}.jsonl`)))),
  };
}

export const readEvents = (root: string) => parseActivity(read(join(root, 'logs', 'activity.jsonl')));

function json(res: ServerResponse, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function stream(root: string, res: ServerResponse, onClose: (fn: () => void) => void) {
  const log = join(root, 'logs', 'activity.jsonl');
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  let events = readEvents(root);
  send('init', events);
  const onChange = () => {
    const next = readEvents(root);
    const last = events.at(-1)?.i ?? -1;
    // a shrunk or rewritten log restarts the client from scratch
    if (next.length < events.length) send('init', next);
    else {
      const fresh = next.filter((e) => e.i > last);
      if (fresh.length) send('events', fresh);
    }
    events = next;
  };
  watchFile(log, { interval: 500 }, onChange);
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  onClose(() => {
    unwatchFile(log, onChange);
    clearInterval(ping);
  });
}

export function novelData(): Plugin {
  let root = '';
  return {
    name: 'novel-office-data',
    configResolved(c) {
      // NOVEL_OFFICE_ROOT points the office at another project copy (used to test LIVE without touching logs)
      root = process.env.NOVEL_OFFICE_ROOT ?? resolve(c.root, '..');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        if (url === '/data/novels.json') return json(res, readNovels(root));
        const m = /^\/data\/novel\/([\w-]+)\.json$/.exec(url);
        if (m) {
          const b = readBundle(root, m[1]);
          if (!b) {
            res.statusCode = 404;
            return res.end('unknown novel');
          }
          return json(res, b);
        }
        if (url === '/data/stream') return stream(root, res, (fn) => req.on('close', fn));
        next();
      });
    },
    generateBundle() {
      const novels = readNovels(root);
      this.emitFile({ type: 'asset', fileName: 'data/novels.json', source: JSON.stringify(novels) });
      for (const n of novels) {
        const b = readBundle(root, n.slug);
        if (b) this.emitFile({ type: 'asset', fileName: `data/novel/${n.slug}.json`, source: JSON.stringify(b) });
      }
    },
  };
}
