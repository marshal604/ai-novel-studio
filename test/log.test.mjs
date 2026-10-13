import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEvent, appendEvents, meetingEvents } from '../lib/log.mjs';
import { tempRoot, readEvents } from './helpers.mjs';

test('makeEvent keeps only schema fields and omits empty optional ones', () => {
  const e = makeEvent({ agent: 'H作家', type: 'task', content: 'x', novel: 'b', extra: 1 });
  assert.deepEqual(Object.keys(e), ['timestamp', 'agent', 'type', 'content', 'novel']);
});

test('makeEvent rejects unknown type', () => {
  assert.throws(() => makeEvent({ agent: 'H作家', type: 'reject', content: 'x' }), /type/);
});

test('makeEvent rejects missing agent or content', () => {
  assert.throws(() => makeEvent({ type: 'task', content: 'x' }), /agent/);
  assert.throws(() => makeEvent({ agent: 'H作家', type: 'task' }), /content/);
});

test('timestamp carries a local offset', () => {
  const { timestamp } = makeEvent({ agent: 'H總編', type: 'status', content: 'idle' });
  assert.match(timestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
});

test('appendEvents writes one JSON line per event and creates logs/', () => {
  const root = tempRoot();
  appendEvents(root, [
    { agent: 'H總編', type: 'task', content: 'a' },
    { agent: 'H讀者', type: 'message', content: 'b', to: 'H作家' },
  ]);
  assert.deepEqual(readEvents(root).map((e) => e.content), ['a', 'b']);
});

test('meetingEvents puts every attendee in the meeting room then logs the meeting', () => {
  const events = meetingEvents({ novel: 'b', topic: '第1章 brief' });
  const statuses = events.filter((e) => e.type === 'status');
  assert.equal(statuses.length, 4);
  assert.ok(statuses.every((e) => e.content === 'meeting — 第1章 brief'));
  assert.equal(events.at(-1).type, 'meeting');
  assert.ok(events.every((e) => e.novel === 'b'));
});
