import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newNovel, useNovel, currentNovel, setRegistryProgress } from '../lib/novel.mjs';
import { tempRoot, readEvents } from './helpers.mjs';

const registry = (root) => readFileSync(join(root, 'novels', 'registry.md'), 'utf8');

test('newNovel scaffolds directories and starter files', () => {
  const root = tempRoot();
  newNovel(root, 'badminton-life', '羽球人生');
  for (const p of ['outline.md', 'worldbuilding/world.md', 'worldbuilding/characters.md', 'worldbuilding/continuity.md', 'briefs', 'chapters', 'reviews']) {
    assert.ok(existsSync(join(root, 'novels', 'badminton-life', p)), p);
  }
});

test('newNovel adds one registry row, sets current novel and logs a task', () => {
  const root = tempRoot();
  newNovel(root, 'badminton-life', '羽球人生');
  newNovel(root, 'badminton-life', '羽球人生');
  assert.equal(registry(root).match(/\| badminton-life \|/g).length, 1);
  assert.equal(currentNovel(root), 'badminton-life');
  assert.equal(readEvents(root)[0].novel, 'badminton-life');
});

test('newNovel does not overwrite existing files', () => {
  const root = tempRoot();
  newNovel(root, 'b', '書');
  const outline = join(root, 'novels', 'b', 'outline.md');
  const before = readFileSync(outline, 'utf8');
  newNovel(root, 'b', '書');
  assert.equal(readFileSync(outline, 'utf8'), before);
});

test('invalid slugs are rejected', () => {
  assert.throws(() => newNovel(tempRoot(), '../x', 't'), /slug/);
  assert.throws(() => useNovel(tempRoot(), 'Bad Slug'), /slug/);
});

test('useNovel requires an existing novel', () => {
  assert.throws(() => useNovel(tempRoot(), 'nope'), /not found/);
});

test('setRegistryProgress updates only the target row', () => {
  const root = tempRoot();
  newNovel(root, 'a', '甲');
  newNovel(root, 'b', '乙');
  setRegistryProgress(root, 'b', '第1章通過');
  const rows = registry(root).split('\n');
  assert.match(rows.find((r) => r.startsWith('| b |')), /第1章通過/);
  assert.match(rows.find((r) => r.startsWith('| a |')), /籌備中/);
});
