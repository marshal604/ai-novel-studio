import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chapterText, review } from './factories.mjs';
import { tempRoot, readEvents } from './helpers.mjs';

const CLI = new URL('../bin/studio.mjs', import.meta.url).pathname;
const studio = (root, args, input) => spawnSync('node', [CLI, ...args], { env: { ...process.env, STUDIO_ROOT: root }, input, encoding: 'utf8' });

test('a chapter goes from new novel to accepted through the CLI', () => {
  const root = tempRoot();
  assert.equal(studio(root, ['new', 'b', '羽球人生']).status, 0);
  const dir = join(root, 'novels', 'b');
  const chapter = join(dir, 'chapters', 'ch01.md');
  writeFileSync(chapter, chapterText());
  assert.equal(studio(root, ['check', chapter]).status, 0);
  const sha = studio(root, ['sha', chapter]).stdout.trim();
  const critic = join(dir, 'reviews', 'ch01.critic.r1.json');
  writeFileSync(critic, JSON.stringify(review({ chapter_sha: sha })));
  assert.equal(studio(root, ['review', critic]).status, 0);
  assert.equal(studio(root, ['accept', 'b', '1']).status, 1, 'world review still missing');
  writeFileSync(join(dir, 'reviews', 'ch01.world.r1.json'), JSON.stringify(review({ reviewer: 'world', chapter_sha: sha })));
  const accepted = studio(root, ['accept', 'b', '1']);
  assert.equal(accepted.status, 0, accepted.stderr);
});

test('log maps role keys to Chinese names and defaults to the current novel', () => {
  const root = tempRoot();
  studio(root, ['new', 'b', '書']);
  assert.equal(studio(root, ['log', 'critic', 'message', '寫得好', '--to', 'writer']).status, 0);
  const e = readEvents(root).at(-1);
  assert.deepEqual([e.agent, e.to, e.novel], ['H讀者', 'H作家', 'b']);
});

test('log rejects types outside the schema', () => {
  assert.equal(studio(tempRoot(), ['log', 'editor', 'reject', 'x']).status, 1);
});

test('hook reads stdin and always exits 0', () => {
  const root = tempRoot();
  assert.equal(studio(root, ['hook'], '{broken').status, 0);
  studio(root, ['hook'], JSON.stringify({ hook_event_name: 'SubagentStart', agent_type: 'writer' }));
  assert.equal(readEvents(root).at(-1).content, 'working');
});
