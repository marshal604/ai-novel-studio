import { describe, expect, it } from 'vitest';
import { layoutBubbles, wrapText } from '../src/core/bubbles';
import { chapterOf, parseActivity } from '../src/core/events';
import { Grid, findPath } from '../src/core/grid';
import { SPOTS, buildGrid } from '../src/core/office';
import { ROLES } from '../src/core/events';

describe('findPath', () => {
  it('should route around an obstacle without cutting corners', () => {
    const g = new Grid(5, 5);
    g.block(2, 0, 1, 4);
    const p = findPath(g, { x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(p[0]).toEqual({ x: 0, y: 0 });
    expect(p.at(-1)).toEqual({ x: 4, y: 0 });
    expect(p.some((t) => t.x === 2 && t.y < 4)).toBe(false);
    for (let i = 1; i < p.length; i++) {
      const [a, b] = [p[i - 1], p[i]];
      if (a.x !== b.x && a.y !== b.y) expect(g.walkable(b.x, a.y) && g.walkable(a.x, b.y)).toBe(true);
    }
  });
  it('should return null when the goal is walled off', () => {
    const g = new Grid(5, 5);
    g.block(2, 0, 1, 5);
    expect(findPath(g, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeNull();
  });
  it('should connect every role spot in the office', () => {
    const g = buildGrid();
    for (const a of ROLES) for (const b of ROLES) {
      expect(findPath(g, SPOTS[a].work, SPOTS[b].meeting), `${a}->${b}`).not.toBeNull();
    }
  });
});

describe('wrapText', () => {
  it('should wrap CJK text and add an ellipsis on overflow', () => {
    const lines = wrapText('一二三四五六七八九十', 4, 2);
    expect(lines).toEqual(['一二三四', '五六七…']);
  });
  it('should count ASCII as narrower', () => {
    expect(wrapText('abcdefg', 4, 3)).toEqual(['abcdefg']);
  });
});

describe('layoutBubbles', () => {
  it('should stack overlapping bubbles without overlap', () => {
    const placed = layoutBubbles(
      [{ id: 1, ax: 100, ay: 100, w: 80, h: 30 }, { id: 2, ax: 110, ay: 100, w: 80, h: 30 }],
      { w: 500, h: 500 },
    );
    const [a, b] = placed;
    expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(30);
  });
  it('should keep bubbles inside the map', () => {
    const [p] = layoutBubbles([{ id: 1, ax: 2, ay: 5, w: 80, h: 30 }], { w: 500, h: 500 });
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });
});

describe('parseActivity', () => {
  it('should carry the novel forward, back-fill the head and drop non-novel files', () => {
    const text = [
      '{"timestamp":"t","agent":"H總編","type":"task","content":"開始"}',
      'not json',
      '{"timestamp":"t","agent":"H作家","type":"message","content":"hi","to":"H總編","novel":"a"}',
      '{"timestamp":"t","agent":"system","type":"task","content":"檔案更新: world.md"}',
      '{"timestamp":"t","agent":"H總編","type":"task","content":"檔案更新: MEMORY.md","novel":""}',
      '{"timestamp":"t","agent":"H讀者","type":"meeting","content":"x","to":"全員","novel":"a,b"}',
    ].join('\n');
    const ev = parseActivity(text);
    expect(ev.map((e) => e.novels.join('+'))).toEqual(['a', 'a', 'a', 'a+b']);
    expect(ev[1].to).toEqual(['editor']);
    expect(ev[2].agent).toBe('world');
    expect(ev[3].to).toBe('all');
  });
});

describe('chapterOf', () => {
  it.each([['第三章審查', 3], ['第十二章', 12], ['第二十章', 20], ['Ch04 通過', 4], ['ch01.md', 1], ['沒有', null]])('%s -> %s', (s, n) => {
    expect(chapterOf(s as string)).toBe(n);
  });
});

describe('wrapText punctuation', () => {
  it('should not start a line with closing punctuation', () => {
    expect(wrapText('一二三四」五', 4, 3)).toEqual(['一二三四」', '五']);
  });
});

describe('World', () => {
  it('should never park two announcers on the same tile', async () => {
    const { World } = await import('../src/core/world');
    const w = new World(1);
    const say = { kind: 'say' as const, text: '大家好', to: 'all' as const, secs: 2 };
    w.apply((['writer', 'world', 'reader'] as const).map((who) => ({ who, actions: [{ kind: 'goto' as const, target: { spot: 'announce' as const } }, say] })));
    let talking = 0;
    for (let i = 0; i < 60 * 20; i++) {
      w.step(1 / 60);
      const at = (['writer', 'world', 'reader'] as const)
        .filter((r) => w.actors[r].current?.action.kind === 'say')
        .map((r) => `${Math.floor(w.actors[r].x / 32)},${Math.floor(w.actors[r].y / 32)}`);
      talking += at.length;
      expect(new Set(at).size).toBe(at.length);
    }
    expect(talking).toBeGreaterThan(0);
  });
});

describe('layoutBubbles crowding', () => {
  it('should place three bubbles from neighbours near the top without any overlap', () => {
    const boxes = [0, 1, 2].map((i) => ({ id: i + 1, ax: 420 + i * 32, ay: 150, w: 180, h: 52 }));
    const placed = layoutBubbles(boxes, { w: 896, h: 672 });
    for (const a of placed) for (const b of placed) {
      if (a.id >= b.id) continue;
      const overlap = a.x < b.x + 180 && b.x < a.x + 180 && a.y < b.y + 52 && b.y < a.y + 52;
      expect(overlap, `${a.id}/${b.id}`).toBe(false);
    }
  });
});

describe('layoutBubbles faces', () => {
  it('should never move a bubble below its natural spot', () => {
    const boxes = [0, 1, 2].map((i) => ({ id: i + 1, ax: 420 + i * 32, ay: 300, w: 180, h: 52 }));
    for (const p of layoutBubbles(boxes, { w: 896, h: 672 })) expect(p.y).toBeLessThanOrEqual(300 - 52);
  });
});

describe('layoutBubbles avoid', () => {
  it('should keep bubbles off the areas to avoid', () => {
    const head = { x: 90, y: 60, w: 32, h: 34 };
    const [p] = layoutBubbles([{ id: 1, ax: 100, ay: 120, w: 120, h: 40 }], { w: 500, h: 500 }, [head]);
    const hit = p.x < head.x + head.w && head.x < p.x + 120 && p.y < head.y + head.h && head.y < p.y + 40;
    expect(hit).toBe(false);
  });
});

describe('collapseBursts', () => {
  const line = (sec: number, agent = 'H作家', content = '檔案更新: ch02.md') =>
    JSON.stringify({ timestamp: `2026-01-01T10:00:${String(sec).padStart(2, '0')}+08:00`, agent, type: 'task', content, novel: 'n' });
  it('should keep one event per save burst', async () => {
    const { collapseBursts } = await import('../src/core/events');
    const ev = parseActivity([line(0), line(1), line(2), line(5, 'H讀者'), line(9), line(40)].join('\n'));
    expect(collapseBursts(ev).map((e) => `${e.agent}@${e.timestamp.slice(17, 19)}`)).toEqual(['writer@00', 'reader@05', 'writer@40']);
  });
});
