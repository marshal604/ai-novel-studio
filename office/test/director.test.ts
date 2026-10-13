import { describe, expect, it } from 'vitest';
import { direct, initialDirector, splitStatus, type Action, type Cue } from '../src/core/director';
import type { ActivityEvent } from '../src/core/events';
import { applyBoard } from '../src/core/player';

const ev = (p: Partial<ActivityEvent>): ActivityEvent => ({
  i: 0, timestamp: '2026-03-22T20:00:00+08:00', agent: 'writer', type: 'task', content: '', to: [], novels: ['n'], ...p,
});
const kinds = (c: Cue | undefined) => c?.actions.map((a) => a.kind);
const cueOf = (cues: Cue[], who: string) => cues.find((c) => c.who === who);

describe('splitStatus', () => {
  it('should split keyword and detail on an em dash', () => {
    expect(splitStatus('working — 撰寫第一章')).toEqual(['working', '撰寫第一章']);
  });
  it('should treat free text as detail without keyword', () => {
    expect(splitStatus('第二章設定審查完成')).toEqual(['', '第二章設定審查完成']);
  });
});

describe('direct', () => {
  it('should send a working character to its desk with a thought bubble', () => {
    const d = direct(initialDirector(), ev({ type: 'status', content: 'working — 撰寫第一章' }));
    const c = cueOf(d.cues, 'writer');
    expect(c?.mode).toEqual({ kind: 'work', label: '撰寫第一章' });
    expect(c?.actions[0]).toMatchObject({ kind: 'say', think: true, text: '撰寫第一章' });
    expect(d.board.phase).toBe('撰寫中');
  });

  it('should walk to the recipient before speaking a message', () => {
    const d = direct(initialDirector(), ev({ type: 'message', content: '第一章完成', to: ['editor'] }));
    const c = cueOf(d.cues, 'writer');
    expect(c?.actions[0]).toEqual({ kind: 'goto', target: { near: 'editor' } });
    expect(c?.actions[1]).toMatchObject({ kind: 'say', to: ['editor'] });
  });

  it('should announce from the whiteboard when talking to everyone', () => {
    const d = direct(initialDirector(), ev({ type: 'message', content: '大家好', to: 'all' }));
    expect(cueOf(d.cues, 'writer')?.actions[0]).toEqual({ kind: 'goto', target: { spot: 'announce' } });
  });

  it('should gather everyone at the meeting table on a meeting', () => {
    const d = direct(initialDirector(), ev({ agent: 'editor', type: 'meeting', content: '召開第二章 Kickoff 會議' }));
    const gotos = d.cues.filter((c) => c.actions.some((a) => a.kind === 'goto' && 'spot' in a.target && a.target.spot === 'meeting'));
    expect(gotos.map((c) => c.who).sort()).toEqual(['editor', 'reader', 'world', 'writer']);
    expect(d.state.beforeMeeting).not.toBeNull();
  });

  it('should restore previous modes when a non-meeting event follows a meeting', () => {
    const s1 = direct(initialDirector(), ev({ type: 'status', content: 'working — 寫稿' })).state;
    const s2 = direct(s1, ev({ agent: 'editor', type: 'meeting', content: '開會' })).state;
    const d = direct(s2, ev({ agent: 'reader', type: 'task', content: '閱讀中' }));
    expect(d.state.beforeMeeting).toBeNull();
    expect(cueOf(d.cues, 'writer')?.mode).toEqual({ kind: 'work', label: '寫稿' });
  });

  it('should make the editor stamp on a decision', () => {
    const d = direct(initialDirector(), ev({ agent: 'editor', type: 'decision', content: '採用方案 B' }));
    const acts = cueOf(d.cues, 'editor')?.actions as Action[];
    expect(acts.map((a) => a.kind)).toEqual(['goto', 'anim', 'fx', 'say']);
    expect(acts[2]).toEqual({ kind: 'fx', fx: { kind: 'stamp', label: '裁決' } });
  });

  it('should fly a paper to the manuscript shelf and celebrate a new chapter file once', () => {
    const e = ev({ content: '檔案更新: ch02.md' });
    const d1 = direct(initialDirector(), e);
    expect(kinds(cueOf(d1.cues, 'writer'))).toEqual(['anim', 'fx', 'anim', 'say']);
    expect(d1.board).toMatchObject({ manuscript: 'ch02.md', chapter: 2 });
    const d2 = direct(d1.state, e);
    expect(kinds(cueOf(d2.cues, 'writer'))).toEqual(['anim', 'fx']);
  });

  it('should send world files to the library and outline to the whiteboard', () => {
    const w = direct(initialDirector(), ev({ agent: 'world', content: '檔案更新: characters.md' }));
    expect(cueOf(w.cues, 'world')?.actions[1]).toEqual({ kind: 'fx', fx: { kind: 'paper', to: 'library' } });
    const o = direct(initialDirector(), ev({ agent: 'editor', content: '檔案更新: outline.md' }));
    expect(cueOf(o.cues, 'editor')?.actions[1]).toEqual({ kind: 'fx', fx: { kind: 'paper', to: 'board' } });
  });

  it('should have everyone cheer on a final approval', () => {
    const d = direct(initialDirector(), ev({ agent: 'editor', type: 'task', content: '完成: 第二章「測試章」最終審核通過，正式定稿' }));
    const cheers = d.cues.filter((c) => c.actions.some((a) => a.kind === 'anim' && a.anim === 'cheer'));
    expect(cheers).toHaveLength(4);
    expect(d.board).toMatchObject({ phase: '已定稿', approved: 2 });
  });

  it('should not mutate the previous state', () => {
    const s = initialDirector();
    const before = JSON.stringify(s);
    direct(s, ev({ type: 'status', content: 'working — 寫稿' }));
    direct(s, ev({ agent: 'editor', type: 'meeting', content: '開會' }));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('applyBoard', () => {
  const base = { chapter: 1, phase: '已定稿' as const, approved: [1], manuscript: 'ch01.md' };
  it('should move the board to the next chapter and reset the phase', () => {
    expect(applyBoard(base, { chapter: 2 })).toMatchObject({ chapter: 2, phase: '籌備中' });
  });
  it('should ignore mentions of earlier chapters', () => {
    expect(applyBoard({ ...base, chapter: 3 }, { chapter: 1 }).chapter).toBe(3);
  });
});

describe('celebration', () => {
  it('should celebrate a chapter approval only once', () => {
    const e = ev({ agent: 'editor', type: 'decision', content: '第二章最終通過。' });
    const d1 = direct(initialDirector(), e);
    const d2 = direct(d1.state, e);
    const cheers = (d: typeof d1) => d.cues.filter((c) => c.actions.some((a) => a.kind === 'anim' && a.anim === 'cheer')).length;
    expect([cheers(d1), cheers(d2)]).toEqual([4, 0]);
  });
});

describe('refactored workflow events', () => {
  it('should treat a bare "working" status as desk work', () => {
    const d = direct(initialDirector(), ev({ type: 'status', content: 'working' }));
    expect(d.cues[0].mode).toEqual({ kind: 'work', label: '工作中' });
  });
  it('should gather everyone for a single studio meeting event and keep them there a moment', () => {
    const d = direct(initialDirector(), ev({ agent: 'editor', type: 'meeting', content: 'studio meeting：第一章簡報' }));
    for (const who of ['editor', 'writer', 'world', 'reader']) {
      expect(d.cues.find((c) => c.who === who)?.actions.map((a) => a.kind)).toEqual(['goto', 'anim']);
    }
    const next = direct(d.state, ev({ type: 'status', content: 'working' }));
    expect(next.state.beforeMeeting).toBeNull();
  });
});
