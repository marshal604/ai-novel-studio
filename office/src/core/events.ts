// Parse logs/activity.jsonl into typed events. Pure: shared by the browser and the Vite data plugin.

export const ROLES = ['editor', 'writer', 'world', 'reader'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAME: Record<Role, string> = { editor: 'H總編', writer: 'H作家', world: 'H世觀', reader: 'H讀者' };
export const ROLE_COLOR: Record<Role, string> = { editor: '#e0604f', writer: '#e8a33a', world: '#5fae6a', reader: '#9c82d6' };

export type EventType = 'task' | 'message' | 'status' | 'decision' | 'meeting' | 'reject';

export interface ActivityEvent {
  /** line index in activity.jsonl (stable id, also the true order: timestamps are unreliable) */
  i: number;
  timestamp: string;
  agent: Role;
  type: EventType;
  content: string;
  /** recipients; 'all' for 全體 / 全員; empty when talking to nobody in the office (e.g. 人類老闆) */
  to: Role[] | 'all';
  /** novel slugs this event belongs to (after carry-forward) */
  novels: string[];
}

const TYPES: readonly string[] = ['task', 'message', 'status', 'decision', 'meeting', 'reject'];

export function roleOf(name: string): Role | null {
  const hit = ROLES.find((r) => name.includes(ROLE_NAME[r]));
  return hit ?? null;
}

export function parseTo(raw: unknown): Role[] | 'all' {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  if (/全體|全員|全部|大家/.test(raw)) return 'all';
  return ROLES.filter((r) => raw.includes(ROLE_NAME[r]));
}

interface RawLine {
  timestamp?: unknown;
  agent?: unknown;
  type?: unknown;
  content?: unknown;
  to?: unknown;
  novel?: unknown;
}

const splitNovels = (v: unknown): string[] | null =>
  typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null;

/**
 * Parse JSONL text. Malformed lines are skipped (the log is hand- and hook-written).
 * Untagged events inherit the last explicit novel; events before the first tag inherit the first tag.
 * An explicit empty novel ("novel":"") marks files outside any novel (memory files etc.) and is dropped.
 */
export function parseActivity(text: string): ActivityEvent[] {
  const parsed: { raw: RawLine; i: number }[] = [];
  text.split('\n').forEach((line, i) => {
    const s = line.trim();
    if (!s) return;
    try {
      const raw = JSON.parse(s) as RawLine;
      if (raw && typeof raw === 'object' && typeof raw.content === 'string') parsed.push({ raw, i });
    } catch {
      // ponytail: a half-written last line (live tail) is skipped; it is re-read once complete
    }
  });
  const firstTag = parsed.map((p) => splitNovels(p.raw.novel)).find((n) => n && n.length) ?? [];
  let current = firstTag;
  const out: ActivityEvent[] = [];
  for (const { raw, i } of parsed) {
    const tag = splitNovels(raw.novel);
    if (tag && tag.length) current = tag;
    if (tag && !tag.length) continue;
    const type = typeof raw.type === 'string' && TYPES.includes(raw.type) ? (raw.type as EventType) : 'task';
    out.push({
      i,
      timestamp: typeof raw.timestamp === 'string' ? raw.timestamp : '',
      agent: roleOf(typeof raw.agent === 'string' ? raw.agent : '') ?? fileOwner(String(raw.content)),
      type,
      content: String(raw.content).trim(),
      to: parseTo(raw.to),
      novels: current,
    });
  }
  return out;
}

/** Same routing as the PostToolUse hook in .claude/settings.json, used for agent-less lines. */
export function fileOwner(content: string): Role {
  if (/world|characters|settings|continuity/.test(content)) return 'world';
  if (/review/.test(content)) return 'reader';
  if (/ch\d+|chapter/.test(content)) return 'writer';
  return 'editor';
}

/** File name from a hook event ("檔案更新: ch01.md"), else null. */
export function updatedFile(e: ActivityEvent): string | null {
  const m = /^檔案更新[:：]\s*(\S+)/.exec(e.content);
  return m ? m[1] : null;
}

export const isChapterFile = (f: string) => /^ch\d+.*\.md$/i.test(f) && !/review/i.test(f);

export const isFinalApproval = (e: ActivityEvent) =>
  /最終(審核)?通過|最終審核.{0,6}通過|正式定稿|正式通過|章\s*定稿/.test(e.content);

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };

/** Chapter number mentioned in an event ("第三章", "Ch03", "ch03.md"), else null. */
export function chapterOf(text: string): number | null {
  const cn = /第([一二三四五六七八九十]{1,3}|\d+)章/.exec(text);
  if (cn) {
    const s = cn[1];
    if (/^\d+$/.test(s)) return Number(s);
    if (s.length === 1) return CN_NUM[s] ?? null;
    // 十一..十九, 二十..: good enough for novels under 100 chapters
    const [a, b, c] = [...s];
    if (a === '十') return 10 + (CN_NUM[b] ?? 0);
    return (CN_NUM[a] ?? 0) * 10 + (c ? CN_NUM[c] ?? 0 : 0);
  }
  const en = /\bch(?:apter)?\s*0*(\d+)/i.exec(text);
  return en ? Number(en[1]) : null;
}

export const forNovel = (events: ActivityEvent[], slug: string) => events.filter((e) => e.novels.includes(slug));

/** The novel the team is working on right now: the tag of the latest event. */
export const currentNovel = (events: ActivityEvent[]): string | null => events.at(-1)?.novels.at(-1) ?? null;

const CN_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export const chapterLabel = (n: number | null) => (n === null ? '準備中' : `第${n <= 10 ? CN_DIGITS[n] : n}章`);

/**
 * Drop repeated identical file events from the same role within `windowSec` (one save burst = one action):
 * a writer making nine quick edits to ch02.md should look like one page, not nine.
 */
export function collapseBursts(events: readonly ActivityEvent[], windowSec = 15): ActivityEvent[] {
  const last = new Map<string, number>();
  return events.filter((e) => {
    if (!updatedFile(e)) return true;
    const key = `${e.agent}|${e.content}`;
    const t = Date.parse(e.timestamp);
    const prev = last.get(key);
    if (Number.isFinite(t)) last.set(key, t);
    return !(prev !== undefined && Number.isFinite(t) && t - prev <= windowSec * 1000);
  });
}
