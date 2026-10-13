import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const EVENT_TYPES = ['task', 'message', 'status', 'decision', 'meeting'];
export const ROLES = { editor: 'H總編', writer: 'H作家', worldbuilder: 'H世觀', critic: 'H讀者' };

const pad = (n) => String(Math.abs(n)).padStart(2, '0');

export function localTimestamp(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const local = new Date(date.getTime() + offset * 60_000).toISOString().slice(0, 19);
  const sign = offset >= 0 ? '+' : '-';
  return `${local}${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
}

export function makeEvent({ agent, type, content, to, novel }) {
  if (!agent) throw new Error('event needs an agent');
  if (!EVENT_TYPES.includes(type)) throw new Error(`invalid event type "${type}", expected ${EVENT_TYPES.join('|')}`);
  if (!content) throw new Error('event needs content');
  return {
    timestamp: localTimestamp(),
    agent,
    type,
    content,
    ...(to ? { to } : {}),
    ...(novel ? { novel } : {}),
  };
}

export function appendEvents(root, events) {
  const lines = events.map((e) => JSON.stringify(makeEvent(e))).join('\n');
  mkdirSync(join(root, 'logs'), { recursive: true });
  appendFileSync(join(root, 'logs', 'activity.jsonl'), `${lines}\n`);
}

export function meetingEvents({ novel, topic, attendees = Object.values(ROLES) }) {
  return [
    ...attendees.map((agent) => ({ agent, type: 'status', content: `meeting — ${topic}`, novel })),
    { agent: ROLES.editor, type: 'meeting', content: topic, novel },
  ];
}
