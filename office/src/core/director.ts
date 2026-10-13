// Director: turns one activity event into character actions. Pure and unit-tested; the World executes them.
import {
  ROLES,
  chapterOf,
  isChapterFile,
  isFinalApproval,
  updatedFile,
  type ActivityEvent,
  type Role,
} from './events';
import type { Spot } from './office';

export type Mode = { kind: 'idle' } | { kind: 'work'; label: string } | { kind: 'meeting'; topic: string };

/** `at` is used by the World for its own ambient trips */
export type Place = 'shelf' | 'library' | 'board';

export type Target = { spot: 'work' | 'meeting' | 'announce' } | { near: Role } | { at: Spot } | { place: Place };

export type Fx =
  | { kind: 'stamp'; label: string }
  | { kind: 'paper'; to: Place }
  | { kind: 'confetti' };

export type Action =
  | { kind: 'goto'; target: Target }
  | { kind: 'say'; text: string; to: Role[] | 'all'; secs: number; think?: boolean }
  | { kind: 'anim'; anim: 'cheer' | 'action' | 'work' | 'idle'; secs: number }
  | { kind: 'fx'; fx: Fx };

export interface Cue {
  who: Role;
  actions: Action[];
  /** nice-to-have (fetching a reference): skipped when the character is already busy */
  optional?: boolean;
  /** new persistent mode (what the character does once its actions are done) */
  mode?: Mode;
}

export type Phase = '籌備中' | '撰寫中' | '審查中' | '修改中' | '已定稿';

export interface BoardUpdate {
  chapter?: number;
  phase?: Phase;
  approved?: number;
  /** a chapter file changed: the manuscript view should show it */
  manuscript?: string;
}

export interface DirectorState {
  modes: Record<Role, Mode>;
  /** modes to restore when the current meeting ends; null when no meeting */
  beforeMeeting: Record<Role, Mode> | null;
  seenChapters: string[];
  /** chapters already celebrated (approval is usually announced several times in a row) */
  celebrated: number[];
}

export interface Direction {
  state: DirectorState;
  cues: Cue[];
  board: BoardUpdate;
}

const IDLE: Mode = { kind: 'idle' };

export const initialDirector = (): DirectorState => ({
  modes: { editor: IDLE, writer: IDLE, world: IDLE, reader: IDLE },
  beforeMeeting: null,
  seenChapters: [],
  celebrated: [],
});

/** Reading time for a bubble: long enough to read, never longer than ~4 s. */
export const sayFor = (text: string) => Math.min(4, Math.max(1.6, 1.3 + text.length * 0.04));

const think = (text: string): Action => ({ kind: 'say', text, to: [], secs: sayFor(text), think: true });
const say = (text: string, to: Role[] | 'all'): Action => ({ kind: 'say', text, to, secs: sayFor(text) });

/** "working — 撰寫第一章" -> ['working', '撰寫第一章'] */
export function splitStatus(content: string): [string, string] {
  const m = /^\s*([a-zA-Z]+)\s*(?:[—–-]+\s*(.*))?$/s.exec(content);
  return m ? [m[1].toLowerCase(), (m[2] ?? '').trim()] : ['', content.trim()];
}

const isMeetingEvent = (e: ActivityEvent) =>
  e.type === 'meeting' || (e.type === 'status' && splitStatus(e.content)[0] === 'meeting');

const PHASE_BY_ROLE: Partial<Record<Role, Phase>> = { writer: '撰寫中', reader: '審查中' };

function messageCues(e: ActivityEvent): Action[] {
  if (e.to === 'all' || e.to.length > 1) return [{ kind: 'goto', target: { spot: 'announce' } }, say(e.content, e.to)];
  if (e.to.length === 1 && e.to[0] !== e.agent) return [{ kind: 'goto', target: { near: e.to[0] } }, say(e.content, e.to)];
  return [say(e.content, [])];
}

/** Where a novel file lives in the office. */
export const placeOf = (file: string): Place =>
  /outline/i.test(file) ? 'board' : /world|character|setting|continuity/i.test(file) ? 'library' : 'shelf';

/** "查閱: x.md" (derived from a run transcript): walk to where the file lives and read it there. */
function readCues(e: ActivityEvent, file: string): Cue[] {
  return [{ who: e.agent, optional: true, actions: [{ kind: 'goto', target: { place: placeOf(file) } }, { kind: 'anim', anim: 'idle', secs: 1.3 }] }];
}

function fileCues(e: ActivityEvent, file: string, s: DirectorState, board: BoardUpdate): Cue[] {
  const to = placeOf(file);
  const actions: Action[] = [{ kind: 'anim', anim: 'work', secs: 0.8 }, { kind: 'fx', fx: { kind: 'paper', to } }];
  if (isChapterFile(file)) {
    board.manuscript = file;
    board.chapter = chapterOf(file) ?? board.chapter;
    board.phase = e.agent === 'writer' ? '撰寫中' : board.phase;
    if (!s.seenChapters.includes(file)) {
      s.seenChapters = [...s.seenChapters, file];
      actions.push({ kind: 'anim', anim: 'cheer', secs: 1.2 }, think(`${file} 初稿完成！`));
    }
  }
  const review = /review|critic|\.r\d+\.json$/i.test(file);
  if (review) board.phase = '審查中';
  // a reviewer's verdict file is handed to the writer in person
  if (review && e.agent !== 'writer') {
    actions.push({ kind: 'goto', target: { near: 'writer' } }, say(`審查意見送到：${file}`, ['writer']));
  }
  return [{ who: e.agent, actions }];
}

function statusCues(e: ActivityEvent, s: DirectorState, board: BoardUpdate): Cue[] {
  const [key, rest] = splitStatus(e.content);
  if (['working', 'reviewing', 'writing', 'busy'].includes(key)) {
    const label = rest || (key === 'reviewing' ? '審稿中' : '工作中');
    s.modes = { ...s.modes, [e.agent]: { kind: 'work', label } };
    board.phase = PHASE_BY_ROLE[e.agent] ?? board.phase;
    if (e.agent === 'writer' && /修改|修稿|v\d/.test(rest)) board.phase = '修改中';
    return [{ who: e.agent, actions: [think(label)], mode: s.modes[e.agent] }];
  }
  if (key === 'idle' || /下線|離線/.test(e.content)) {
    s.modes = { ...s.modes, [e.agent]: IDLE };
    return [{ who: e.agent, actions: rest ? [think(rest)] : [], mode: IDLE }];
  }
  return [{ who: e.agent, actions: e.to.length ? messageCues(e) : [think(e.content)] }];
}

function meetingCues(e: ActivityEvent, s: DirectorState): Cue[] {
  const cues: Cue[] = [];
  if (!s.beforeMeeting) {
    const topic = splitStatus(e.content)[1] || '會議';
    s.beforeMeeting = s.modes;
    const meeting: Mode = { kind: 'meeting', topic };
    s.modes = { editor: meeting, writer: meeting, world: meeting, reader: meeting };
    // everyone stays at the table a moment even if the very next event ends the meeting
    for (const r of ROLES) {
      cues.push({ who: r, actions: [{ kind: 'goto', target: { spot: 'meeting' } }, { kind: 'anim', anim: 'idle', secs: 2.5 }], mode: meeting });
    }
  }
  if (e.type === 'meeting') cues.push({ who: e.agent, actions: [say(e.content, 'all')] });
  return cues;
}

function endMeeting(s: DirectorState): Cue[] {
  if (!s.beforeMeeting) return [];
  const back = s.beforeMeeting;
  s.beforeMeeting = null;
  s.modes = back;
  return ROLES.map((r) => ({ who: r, actions: [], mode: back[r] }));
}

/** Decide what the office does for one event. Never mutates `prev`. */
export function direct(prev: DirectorState, e: ActivityEvent): Direction {
  const s: DirectorState = { ...prev };
  const board: BoardUpdate = {};
  const cues: Cue[] = [];
  const chapter = chapterOf(e.content);
  if (chapter) board.chapter = chapter;

  if (isMeetingEvent(e)) cues.push(...meetingCues(e, s));
  else {
    cues.push(...endMeeting(s));
    const file = e.type === 'task' ? updatedFile(e) : null;
    const read = e.type === 'task' ? /^查閱[:：]\s*(\S+)/.exec(e.content)?.[1] : undefined;
    if (file) cues.push(...fileCues(e, file, s, board));
    else if (read) cues.push(...readCues(e, read));
    else if (e.type === 'status') cues.push(...statusCues(e, s, board));
    else if (e.type === 'decision') {
      cues.push({
        who: 'editor',
        actions: [
          { kind: 'goto', target: { spot: 'work' } },
          { kind: 'anim', anim: 'action', secs: 0.9 },
          { kind: 'fx', fx: { kind: 'stamp', label: '裁決' } },
          say(e.content, 'all'),
        ],
      });
    } else if (e.type === 'reject') {
      cues.push({ who: e.agent, actions: [{ kind: 'fx', fx: { kind: 'stamp', label: '退件' } }, ...messageCues(e)] });
    } else if (e.type === 'message' || e.to.length) cues.push({ who: e.agent, actions: messageCues(e) });
    else cues.push({ who: e.agent, actions: [think(e.content)] });
  }

  if (isFinalApproval(e) && !(chapter && s.celebrated.includes(chapter))) {
    if (chapter) s.celebrated = [...s.celebrated, chapter];
    board.phase = '已定稿';
    board.approved = chapter ?? undefined;
    for (const r of ROLES) {
      const fx: Action[] = r === 'editor' ? [{ kind: 'fx', fx: { kind: 'confetti' } }] : [];
      cues.push({ who: r, actions: [...fx, { kind: 'anim', anim: 'cheer', secs: 1.6 }] });
    }
  }
  return { state: s, cues, board };
}
