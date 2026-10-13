// Derive extra replay events for one novel and store them inside this app (data/derived/<slug>.jsonl).
//   npm run import -- <slug> [--transcript run.jsonl]... [--log other/activity.jsonl]...
// --transcript: a `claude -p --output-format stream-json` run; yields which files each role read / wrote.
// --log: another activity.jsonl (e.g. an earlier run kept elsewhere); that novel's events are carried over.
// Output uses the activity.jsonl schema with file names only (no paths or prompts), so it is safe to publish.
// The office merges it into that novel's replay by time.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROLE_NAME, forNovel, parseActivity, type ActivityEvent } from '../src/core/events';
import { importTranscript, type RawEvent } from '../src/core/transcript';

const args = process.argv.slice(2).filter((a) => a !== '--');
const slug = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const values = (flag: string) => args.flatMap((a, i) => (args[i - 1] === flag ? [a] : []));
if (!slug) {
  process.stderr.write('usage: npm run import -- <slug> [--transcript run.jsonl]... [--log activity.jsonl]...\n');
  process.exit(1);
}

const toRaw = (e: ActivityEvent) => ({
  timestamp: e.timestamp,
  agent: ROLE_NAME[e.agent],
  type: e.type,
  content: e.content,
  to: e.to === 'all' ? '全員' : e.to.map((r) => ROLE_NAME[r]).join('、'),
  novel: slug,
});

const lines: (RawEvent | ReturnType<typeof toRaw>)[] = [
  ...values('--log').flatMap((p) => forNovel(parseActivity(readFileSync(p, 'utf8')), slug).map(toRaw)),
  ...values('--transcript').flatMap((p) => importTranscript(readFileSync(p, 'utf8'), slug)),
].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

const dir = resolve(import.meta.dirname, '..', 'data', 'derived');
mkdirSync(dir, { recursive: true });
const out = join(dir, `${slug}.jsonl`);
writeFileSync(out, lines.map((e) => JSON.stringify(e)).join('\n') + '\n');
process.stdout.write(`${lines.length} events -> ${out}\n`);
