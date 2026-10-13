import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics, parseJsonLines } from '../lib/metrics.mjs';

const toolUse = (name, input, parent = null) => ({ type: 'assistant', parent_tool_use_id: parent, message: { content: [{ type: 'tool_use', name, input }] } });
const result = (cost, duration, turns, usage) => ({ type: 'result', total_cost_usd: cost, duration_ms: duration, num_turns: turns, modelUsage: usage });

const events = [
  toolUse('Agent', { description: 'H作家' }),
  toolUse('Bash', { command: 'python3 -c "open(\'logs/activity.jsonl\',\'a\')"' }, 'toolu_1'),
  toolUse('Bash', { command: 'tail logs/activity.jsonl' }, 'toolu_1'),
  toolUse('SendMessage', { to: 'main' }, 'toolu_1'),
  { type: 'system', subtype: 'task_notification', usage: { total_tokens: 1000, tool_uses: 3, duration_ms: 50 } },
  { type: 'system', subtype: 'task_notification', usage: { total_tokens: 500, tool_uses: 1, duration_ms: 20 } },
  result(0.5, 100, 3, { sonnet: { inputTokens: 1, outputTokens: 10, cacheReadInputTokens: 100, cacheCreationInputTokens: 5, costUSD: 0.5 } }),
  result(0.8, 40, 1, { sonnet: { inputTokens: 2, outputTokens: 20, cacheReadInputTokens: 300, cacheCreationInputTokens: 7, costUSD: 0.8 } }),
];

test('cost and tokens come from the last (cumulative) result', () => {
  const m = computeMetrics(events);
  assert.equal(m.cost_usd, 0.8);
  assert.deepEqual(m.tokens, { input: 2, output: 20, cache_read: 300, cache_write: 7 });
  assert.deepEqual(m.models, ['sonnet']);
});

test('editor re-entries, turns and active time are summed across results', () => {
  const m = computeMetrics(events);
  assert.equal(m.editor_invocations, 2);
  assert.equal(m.num_turns, 4);
  assert.equal(m.active_ms, 140);
});

test('tool calls are counted by name and hand-written log appends are detected', () => {
  const m = computeMetrics(events);
  assert.deepEqual(m.tool_calls, { Agent: 1, Bash: 2, SendMessage: 1 });
  assert.equal(m.manual_log_writes, 1);
});

test('subagent runs and tokens come from task notifications', () => {
  const m = computeMetrics(events);
  assert.equal(m.subagent_runs, 2);
  assert.equal(m.subagent_tokens, 1500);
});

test('parseJsonLines skips blank and broken lines', () => {
  assert.equal(parseJsonLines('{"a":1}\n\nnot json\n{"b":2}\n').length, 2);
});
