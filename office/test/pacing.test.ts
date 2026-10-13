import { describe, expect, it } from 'vitest';
import type { ActivityEvent } from '../src/core/events';
import { MAX_BEAT, MIN_BEAT, realGap, replayGaps, worldRate } from '../src/core/pacing';
import { Player } from '../src/core/player';
import { fixtureEvents } from './fixture';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('realGap', () => {
  it('should treat out-of-order timestamps as simultaneous', () => {
    expect(realGap('2026-01-01T10:01:00+08:00', '2026-01-01T10:00:00+08:00')).toBe(0);
  });
  it('should squash long waits', () => {
    expect(realGap('2026-01-01T10:00:00+08:00', '2026-01-02T10:00:00+08:00')).toBe(40);
  });
  it('should ignore bad timestamps', () => {
    expect(realGap('nope', '2026-01-01T10:00:00+08:00')).toBe(0);
  });
});

describe('replayGaps', () => {
  const events = fixtureEvents();
  it('should fit the whole run into the target duration', () => {
    expect(sum(replayGaps(events, { target: 60 }))).toBeCloseTo(60, 5);
  });
  it('should keep every event on screen for at least its beat', () => {
    replayGaps(events, { target: 60 }).slice(1).forEach((g) => expect(g).toBeGreaterThanOrEqual(MIN_BEAT));
  });
  it('should give longer real gaps longer screen time', () => {
    const g = replayGaps(events, { target: 60 });
    const i = events.findIndex((e) => e.content === '檔案更新: ch01.md');
    // writing the chapter took two minutes, the meeting lines were simultaneous
    expect(g[i]).toBeGreaterThan(g[i - 2] + 2);
  });
  it('should divide gaps by speed', () => {
    const a = replayGaps(events, { speed: 1 });
    const b = replayGaps(events, { speed: 2 });
    b.forEach((g, i) => expect(g).toBeCloseTo(a[i] / 2));
  });
  it('should not stretch a run that has no time information', () => {
    const flat = events.map((e) => ({ ...e, timestamp: '' }));
    const g = replayGaps(flat, { target: 600 }).slice(1);
    g.forEach((x) => expect(x).toBeLessThanOrEqual(MAX_BEAT));
  });
});

describe('replay', () => {
  const events = fixtureEvents();
  function run(): { trace: string[]; t: number; pos: string } {
    const p = new Player(3, worldRate(1));
    p.enqueue(events, replayGaps(events, { target: 60 }));
    const trace: string[] = [];
    let t = 0;
    while (p.remaining && t < 600) {
      for (const e of p.tick(1 / 60)) trace.push(`${e.i}@${t.toFixed(2)}`);
      t += 1 / 60;
    }
    const a = p.world.actors.writer;
    return { trace, t, pos: `${a.x.toFixed(2)},${a.y.toFixed(2)}` };
  }

  it('should release every event in order, deterministically, close to the target duration', () => {
    const r1 = run();
    expect(r1.trace.map((s) => Number(s.split('@')[0]))).toEqual(events.map((e: ActivityEvent) => e.i));
    expect(r1).toEqual(run());
    expect(r1.t).toBeGreaterThan(50);
    expect(r1.t).toBeLessThan(80);
  });

  it('should tick the run clock forward between events', () => {
    const p = new Player(3);
    p.enqueue(events, replayGaps(events, { target: 60 }));
    const seen: number[] = [];
    for (let i = 0; i < 60 * 40; i++) {
      p.tick(1 / 60);
      if (p.clock !== null) seen.push(p.clock);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(new Set(seen).size).toBeGreaterThan(100);
  });
});
