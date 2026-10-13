import { describe, expect, it } from 'vitest';
import { parseActivity } from '../src/core/events';
import { filesInCommand, importTranscript, mergeTimeline } from '../src/core/transcript';

const slug = 'demo-novel';
const tool = (ts: string, name: string, input: object, task?: string) =>
  JSON.stringify({
    type: 'assistant', timestamp: ts, parent_tool_use_id: task ? 'toolu_1' : null, task_description: task,
    message: { content: [{ type: 'tool_use', name, input }] },
  });

describe('filesInCommand', () => {
  it('should find heredoc writes and plain reads', () => {
    const f = filesInCommand(`cd novels/${slug}/worldbuilding && cat > world.md <<'EOF'\nx\nEOF\ncat characters.md`, slug);
    expect(f).toEqual({ writes: ['world.md'], reads: ['characters.md'] });
  });
  it('should find python writes through a path variable', () => {
    const f = filesInCommand(`python3 - <<'EOF'\np='novels/${slug}/chapters/ch01.md'\nopen(p,'w').write(s)\nEOF`, slug);
    expect(f.writes).toEqual(['ch01.md']);
  });
  it('should not treat file names inside activity log messages as reads', () => {
    const f = filesInCommand(`echo '{"content":"讀 ch01.md","novel":"${slug}"}' >> logs/activity.jsonl`, slug);
    expect(f.reads).toEqual([]);
  });
  it('should ignore commands about other novels', () => {
    expect(filesInCommand('cat novels/other/outline.md', slug)).toEqual({ writes: [], reads: [] });
  });
});

describe('importTranscript', () => {
  const text = [
    tool('2026-01-01T02:00:00Z', 'Read', { file_path: `/x/novels/${slug}/outline.md` }),
    tool('2026-01-01T02:00:05Z', 'Write', { file_path: `/x/novels/${slug}/chapters/ch01.md` }, 'H作家 撰寫'),
    tool('2026-01-01T02:00:06Z', 'Write', { file_path: `/x/novels/${slug}/chapters/ch01.md` }, 'H作家 撰寫'),
    tool('2026-01-01T02:00:07Z', 'Read', { file_path: '/x/novels/other/outline.md' }, 'H讀者 審查'),
    'not json',
  ].join('\n');
  it('should map tool calls to roles and file events, collapsing repeats', () => {
    const ev = importTranscript(text, slug);
    expect(ev.map((e) => `${e.agent} ${e.content}`)).toEqual(['H總編 查閱: outline.md', 'H作家 檔案更新: ch01.md']);
    expect(ev.every((e) => e.novel === slug)).toBe(true);
  });
});

describe('mergeTimeline', () => {
  it('should slot derived events in by time without reordering the log', () => {
    const log = parseActivity([
      '{"timestamp":"2026-01-01T10:00:00+08:00","agent":"H總編","type":"task","content":"a","novel":"n"}',
      '{"timestamp":"2026-01-01T10:05:00+08:00","agent":"H作家","type":"task","content":"c","novel":"n"}',
    ].join('\n'));
    const derived = parseActivity('{"timestamp":"2026-01-01T02:02:00Z","agent":"H作家","type":"task","content":"b","novel":"n"}');
    const m = mergeTimeline(log, derived);
    expect(m.map((e) => e.content)).toEqual(['a', 'b', 'c']);
    expect(m.map((e) => e.i)).toEqual([0, 1, 2]);
  });
});
