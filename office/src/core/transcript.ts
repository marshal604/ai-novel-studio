// Optional importer: derive extra activity events from a `claude -p --output-format stream-json` run.
// activity.jsonl only says what the team *reported*; the transcript shows which files each role actually
// read and wrote, and when. Output uses the activity.jsonl schema, with file basenames only.
import { ROLE_NAME, type ActivityEvent, type Role } from './events';

export interface RawEvent {
  timestamp: string;
  agent: string;
  type: 'task';
  content: string;
  novel: string;
}

interface ToolUse {
  name: string;
  input: Record<string, unknown>;
}

interface Line {
  type?: string;
  timestamp?: string;
  parent_tool_use_id?: string | null;
  task_description?: string;
  message?: { content?: unknown };
}

const ROLE_BY_PREFIX: [RegExp, Role][] = [
  [/H總編|editor|main/i, 'editor'],
  [/H作家|writer/i, 'writer'],
  [/H世觀|world/i, 'world'],
  [/H讀者|critic|reader/i, 'reader'],
];

const roleOfTask = (desc: string | undefined): Role =>
  ROLE_BY_PREFIX.find(([re]) => desc && re.test(desc))?.[1] ?? 'editor';

const base = (p: string) => p.split('/').pop() ?? p;

/** Which novel files (basenames) a shell command writes and reads. Heuristic, good enough for a time-lapse. */
export function filesInCommand(cmd: string, slug: string): { writes: string[]; reads: string[] } {
  if (!cmd.includes(slug)) return { writes: [], reads: [] };
  const md = (re: RegExp) => [...cmd.matchAll(re)].map((m) => base(m[1]));
  const vars = new Map([...cmd.matchAll(/\b(\w+)\s*=\s*['"]([^'"]+\.md)['"]/g)].map((m) => [m[1], m[2]]));
  const opened = [...cmd.matchAll(/open\(\s*(\w+)\s*,\s*['"][wa]/g)].map((m) => vars.get(m[1])).filter((p): p is string => !!p);
  const writes = [
    ...md(/>>?\s*['"]?([\w./-]+\.md)/g),
    ...md(/sed -i\s+(?:''\s+)?(?:-e\s+)?'[^']*'\s+([\w./-]+\.md)/g),
    ...opened.map(base),
  ];
  const all = md(/([\w./-]+\.md)/g);
  // other novels, logs and team files are not part of this novel's story
  const ok = (f: string) => !/^(registry|meeting_notes|writer|worldbuilder|critic|CLAUDE|MEMORY)\.md$/.test(f);
  const otherNovel = (f: string) => new RegExp(`novels/(?!${slug})[\\w-]+/[\\w/.-]*${f.replace('.', '\\.')}`).test(cmd);
  const w = [...new Set(writes)].filter((f) => ok(f) && !otherNovel(f));
  // a command that appends to the activity log only *mentions* files in its messages: not a read
  const logging = cmd.includes('activity.jsonl');
  const r = logging ? [] : [...new Set(all)].filter((f) => ok(f) && !w.includes(f) && !otherNovel(f));
  return { writes: w, reads: r };
}

function toolUses(l: Line): ToolUse[] {
  const c = l.message?.content;
  if (!Array.isArray(c)) return [];
  return c.filter((b): b is ToolUse => !!b && typeof b === 'object' && (b as { type?: string }).type === 'tool_use');
}

/** Convert a stream-json transcript into derived events for `slug` (reads: 查閱, writes: 檔案更新). */
export function importTranscript(text: string, slug: string): RawEvent[] {
  const out: RawEvent[] = [];
  const push = (timestamp: string, who: Role, content: string) => {
    const last = out.at(-1);
    // the same file touched twice in a row by the same role is one visible action
    if (last && last.agent === ROLE_NAME[who] && last.content === content) return;
    out.push({ timestamp, agent: ROLE_NAME[who], type: 'task', content, novel: slug });
  };
  for (const raw of text.split('\n')) {
    let l: Line;
    try {
      l = JSON.parse(raw) as Line;
    } catch {
      continue;
    }
    if (l.type !== 'assistant' || !l.timestamp) continue;
    const who = l.parent_tool_use_id ? roleOfTask(l.task_description) : 'editor';
    for (const t of toolUses(l)) {
      const path = typeof t.input.file_path === 'string' ? t.input.file_path : '';
      const inNovel = path.includes(`/novels/${slug}/`);
      if (t.name === 'Read' && inNovel) push(l.timestamp, who, `查閱: ${base(path)}`);
      else if ((t.name === 'Write' || t.name === 'Edit') && inNovel) push(l.timestamp, who, `檔案更新: ${base(path)}`);
      else if (t.name === 'Bash' && typeof t.input.command === 'string') {
        const f = filesInCommand(t.input.command, slug);
        for (const w of f.writes) push(l.timestamp, who, `檔案更新: ${w}`);
        for (const r of f.reads.slice(0, 3)) push(l.timestamp, who, `查閱: ${r}`);
      }
    }
  }
  return out;
}

/**
 * Merge derived events into the novel's log by time. Log events keep their own order (it is the truth);
 * a derived event goes right before the first log event that happened after it.
 */
export function mergeTimeline(log: readonly ActivityEvent[], derived: readonly ActivityEvent[]): ActivityEvent[] {
  const t = (e: ActivityEvent) => Date.parse(e.timestamp);
  const key = (e: ActivityEvent) => `${t(e)}|${e.agent}|${e.type}|${e.content}`;
  const inLog = new Set(log.map(key));
  // derived files may carry lines that are also in the log (same run imported twice): keep one copy
  const extra = derived.filter((e) => !inLog.has(key(e))).sort((a, b) => t(a) - t(b));
  const out: ActivityEvent[] = [];
  let k = 0;
  for (const e of log) {
    while (k < extra.length && t(extra[k]) < t(e)) out.push(extra[k++]);
    out.push(e);
  }
  out.push(...extra.slice(k));
  return out.map((e, i) => ({ ...e, i }));
}
