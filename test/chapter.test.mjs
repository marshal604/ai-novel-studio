import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, checkChapter, bodySha, setStatus, countHan } from '../lib/chapter.mjs';
import { chapterText } from './factories.mjs';

test('parseFrontmatter reads scalars, quoted strings and the changelog list', () => {
  const { data } = parseFrontmatter(chapterText());
  assert.equal(data.chapter, 1);
  assert.equal(data.title, '週四晚上');
  assert.deepEqual(data.changelog, ['v1: 初稿']);
});

test('a valid chapter has no errors', () => {
  assert.deepEqual(checkChapter(chapterText()).errors, []);
});

test('missing frontmatter is an error', () => {
  assert.match(checkChapter('# 第一章\n內容').errors.join(), /frontmatter/);
});

test('each missing required field is reported', () => {
  const { errors } = checkChapter(chapterText({ omit: ['version', 'changelog'] }));
  assert.equal(errors.length, 2);
});

test('unknown status is an error', () => {
  assert.match(checkChapter(chapterText({ status: '完成' })).errors.join(), /status/);
});

test('length outside 1500-3000 Han characters is only a warning', () => {
  const result = checkChapter(chapterText({ body: '字'.repeat(100) }));
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join(), /length 103/);
});

test('countHan ignores latin, digits and punctuation', () => {
  assert.equal(countHan('立安 32 歲，QA。'), 3);
});

test('bodySha ignores frontmatter changes', () => {
  assert.equal(bodySha(chapterText({ status: '審查中' })), bodySha(chapterText({ status: '通過', version: 3 })));
  assert.notEqual(bodySha(chapterText()), bodySha(chapterText({ body: '別的' })));
});

test('setStatus rewrites only the status line', () => {
  const next = setStatus(chapterText(), '通過');
  assert.equal(parseFrontmatter(next).data.status, '通過');
  assert.equal(parseFrontmatter(next).body, parseFrontmatter(chapterText()).body);
});

test('CRLF files parse like LF files', () => {
  const crlf = chapterText().replace(/\n/g, '\r\n');
  assert.deepEqual(checkChapter(crlf).errors, []);
  assert.equal(bodySha(crlf), bodySha(chapterText()));
});

test('an empty title is reported, not treated as a list', () => {
  const text = chapterText().replace('title: "週四晚上"', 'title:');
  assert.match(checkChapter(text).errors.join(), /title/);
});
