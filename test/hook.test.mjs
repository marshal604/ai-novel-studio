import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hookEvents, handleHook } from '../lib/hook.mjs';
import { newNovel } from '../lib/novel.mjs';
import { tempRoot, readEvents } from './helpers.mjs';

const write = (file_path, extra = {}) => ({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path }, ...extra });

test('file writes are attributed by agent_type first', () => {
  const [e] = hookEvents('/r', write('/r/novels/b/outline.md', { agent_type: 'critic' }));
  assert.equal(e.agent, 'H讀者');
  assert.equal(e.novel, 'b');
  assert.equal(e.content, '檔案更新: outline.md');
});

test('without agent_type, the path decides the role', () => {
  const agentFor = (p) => hookEvents('/r', write(p))[0].agent;
  assert.equal(agentFor('/r/novels/b/chapters/ch01.md'), 'H作家');
  assert.equal(agentFor('/r/novels/b/worldbuilding/world.md'), 'H世觀');
  assert.equal(agentFor('/r/novels/b/reviews/ch01.world.r1.json'), 'H世觀');
  assert.equal(agentFor('/r/novels/b/reviews/ch01.critic.r1.json'), 'H讀者');
  assert.equal(agentFor('/r/novels/b/briefs/ch01.md'), 'H總編');
});

test('log files and the current-novel marker are ignored', () => {
  assert.deepEqual(hookEvents('/r', write('/r/logs/activity.jsonl')), []);
  assert.deepEqual(hookEvents('/r', write('/r/novels/.current')), []);
});

test('subagent start/stop become working/idle status for office roles', () => {
  const root = tempRoot();
  newNovel(root, 'b', '書');
  const [start] = hookEvents(root, { hook_event_name: 'SubagentStart', agent_type: 'writer' });
  const [stop] = hookEvents(root, { hook_event_name: 'SubagentStop', agent_type: 'worldbuilder' });
  assert.deepEqual([start.agent, start.type, start.content, start.novel], ['H作家', 'status', 'working', 'b']);
  assert.deepEqual([stop.agent, stop.content], ['H世觀', 'idle']);
});

test('subagents outside the office are ignored', () => {
  assert.deepEqual(hookEvents('/r', { hook_event_name: 'SubagentStart', agent_type: 'Explore' }), []);
  assert.deepEqual(hookEvents('/r', { hook_event_name: 'SubagentStart', agent_type: 'toString' }), []);
});

test('handleHook never throws on bad input and appends valid events', () => {
  const root = tempRoot();
  assert.doesNotThrow(() => handleHook(root, 'not json'));
  handleHook(root, JSON.stringify(write(`${root}/novels/b/chapters/ch01.md`)));
  assert.equal(readEvents(root).length, 1);
});

test('relative log paths are ignored too', () => {
  assert.deepEqual(hookEvents('/r', write('logs/activity.jsonl')), []);
});
