// Synthetic novel run for tests: a neutral story ("測試小說"), shaped like a real one-chapter run.
import { parseActivity, type ActivityEvent } from '../src/core/events';

const SLUG = 'demo-novel';

function line(min: number, sec: number, agent: string, type: string, content: string, to = '') {
  const ts = `2026-01-01T10:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}+08:00`;
  return JSON.stringify({ timestamp: ts, agent, type, content, to, novel: SLUG });
}

export function fixtureLog(): string {
  return [
    line(0, 0, 'H總編', 'message', '收到指示：開新小說《測試小說》', '人類'),
    line(0, 5, 'H總編', 'task', '檔案更新: outline.md'),
    line(0, 30, 'H世觀', 'status', 'working — 建立世界觀'),
    line(1, 40, 'H世觀', 'task', '檔案更新: world.md'),
    line(1, 41, 'H世觀', 'task', '檔案更新: characters.md'),
    line(1, 50, 'H世觀', 'message', '設定就緒，請先讀 worldbuilding/', 'H作家'),
    line(2, 0, 'H作家', 'task', '查閱: world.md'),
    ...['H總編', 'H作家', 'H世觀', 'H讀者'].map((a) => line(2, 10, a, 'status', 'meeting — 第一章 kickoff')),
    line(2, 10, 'H總編', 'meeting', '簡報第一章：主角第一次上場', '全員'),
    line(2, 10, 'H作家', 'meeting', '計畫：笑點放在前三段', '全員'),
    line(2, 10, 'H總編', 'decision', '全員對齊，第一章開工', 'H作家'),
    line(2, 12, 'H作家', 'status', 'working — 撰寫第一章'),
    line(4, 30, 'H作家', 'task', '檔案更新: ch01.md'),
    line(4, 31, 'H作家', 'message', '第一章 v1 完成，請審', 'H讀者、H世觀'),
    line(4, 50, 'H讀者', 'task', '查閱: ch01.md'),
    line(5, 40, 'H讀者', 'task', '檔案更新: ch01_review.md'),
    line(5, 41, 'H讀者', 'message', '條件通過：結尾再收一點', 'H作家'),
    line(6, 10, 'H作家', 'task', '檔案更新: ch01.md'),
    line(6, 30, 'H總編', 'decision', '第一章 v2 最終通過', '全員'),
    line(6, 30, 'H總編', 'message', '里程碑！第一章完成，大家辛苦了', '全員'),
    line(6, 31, 'H讀者', 'message', '恭喜！', '全員'),
  ].join('\n');
}

export const fixtureEvents = (): ActivityEvent[] => parseActivity(fixtureLog());
