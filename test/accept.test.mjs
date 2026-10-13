import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateAcceptance, acceptChapter } from '../lib/accept.mjs';
import { bodySha, parseFrontmatter } from '../lib/chapter.mjs';
import { newNovel } from '../lib/novel.mjs';
import { chapterText, review, issue, resolution } from './factories.mjs';
import { tempRoot, readEvents } from './helpers.mjs';

const text = chapterText();
const sha = bodySha(text);
const slot = (data) => ({ round: data.round, data });
const both = (critic = {}, world = {}) => ({
  critic: slot(review({ chapter_sha: sha, ...critic })),
  world: slot(review({ reviewer: 'world', chapter_sha: sha, ...world })),
});
const evaluate = (overrides) => evaluateAcceptance({ chapter: 1, chapterText: text, reviews: both(), resolution: null, waive: [], reason: '', canonVerified: false, ...overrides });

test('two passing reviews of the current text are accepted', () => {
  assert.deepEqual(evaluate().errors, []);
});

test('a missing reviewer blocks', () => {
  assert.match(evaluate({ reviews: { critic: both().critic } }).errors.join(), /world/);
});

test('invalid chapter frontmatter blocks', () => {
  assert.match(evaluate({ chapterText: chapterText({ omit: ['title'] }) }).errors.join(), /title/);
});

test('a reject verdict blocks unless its serious issues are waived with a reason', () => {
  const reviews = both({ verdict: 'reject', issues: [issue({ severity: 'major' })] });
  assert.match(evaluate({ reviews }).errors.join(), /C1 needs a round 2/);
  assert.match(evaluate({ reviews, waive: ['C1'] }).errors.join(), /reason/);
  assert.deepEqual(evaluate({ reviews, waive: ['C1'], reason: '風格取捨' }).errors, []);
});

test('a blocker inside a conditional review cannot be closed by the writer alone', () => {
  const reviews = both({ verdict: 'conditional', issues: [issue({ severity: 'blocker' })] });
  const fixed = resolution([{ id: 'C1', action: 'fixed' }]);
  assert.match(evaluate({ reviews, resolution: fixed }).errors.join(), /blocker/);
});

test('a writer-declined major still needs round 2 or a waiver', () => {
  const reviews = both({ verdict: 'conditional', issues: [issue({ severity: 'major' })] });
  assert.match(evaluate({ reviews, resolution: resolution([{ id: 'C1', action: 'declined' }]) }).errors.join(), /C1/);
});

test('unresolved minor issues only warn', () => {
  const result = evaluate({ reviews: both({ verdict: 'conditional', issues: [issue()] }) });
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join(), /C1/);
});

test('stale world review with a continuity delta needs --canon-verified', () => {
  const reviews = both({}, { chapter_sha: 'old', continuity_delta: ['立安借了拍'] });
  assert.match(evaluate({ reviews }).errors.join(), /canon/);
  const verified = evaluate({ reviews, canonVerified: true });
  assert.deepEqual(verified.errors, []);
  assert.match(verified.warnings.join(), /older/);
});

const setup = () => {
  const root = tempRoot();
  newNovel(root, 'b', '書');
  const dir = join(root, 'novels', 'b');
  writeFileSync(join(dir, 'chapters', 'ch01.md'), text);
  const put = (name, data) => writeFileSync(join(dir, 'reviews', name), JSON.stringify(data));
  put('ch01.critic.r1.json', review({ chapter_sha: sha }));
  put('ch01.world.r1.json', review({ reviewer: 'world', chapter_sha: sha, continuity_delta: ['立安借了 4U 舊拍'] }));
  return { root, dir };
};

test('acceptChapter commits status, continuity, registry, record and a decision event', () => {
  const { root, dir } = setup();
  const result = acceptChapter(root, 'b', 1, {});
  assert.deepEqual(result.errors, []);
  assert.equal(parseFrontmatter(readFileSync(join(dir, 'chapters', 'ch01.md'), 'utf8')).data.status, '通過');
  assert.match(readFileSync(join(dir, 'worldbuilding', 'continuity.md'), 'utf8'), /<!-- ch01:start -->[\s\S]*4U 舊拍[\s\S]*<!-- ch01:end -->/);
  assert.match(readFileSync(join(root, 'novels', 'registry.md'), 'utf8'), /第1章通過/);
  assert.equal(JSON.parse(readFileSync(join(dir, 'accepted.json'), 'utf8')).chapters['1'].sha, sha);
  assert.ok(readEvents(root).some((e) => e.type === 'decision' && e.content === '第1章定稿'));
});

test('re-running accept on the same text is a no-op', () => {
  const { root, dir } = setup();
  acceptChapter(root, 'b', 1, {});
  const before = readEvents(root).length;
  assert.equal(acceptChapter(root, 'b', 1, {}).noop, true);
  assert.equal(readEvents(root).length, before);
  assert.equal(readFileSync(join(dir, 'worldbuilding', 'continuity.md'), 'utf8').match(/ch01:start/g).length, 1);
});

test('blocked acceptance writes nothing', () => {
  const { root, dir } = setup();
  mkdirSync(join(dir, 'reviews'), { recursive: true });
  writeFileSync(join(dir, 'reviews', 'ch01.critic.r2.json'), JSON.stringify(review({ round: 2, verdict: 'reject', chapter_sha: sha, issues: [issue({ severity: 'blocker' })] })));
  const before = readEvents(root).length;
  assert.ok(acceptChapter(root, 'b', 1, {}).errors.length > 0);
  assert.equal(readEvents(root).length, before);
});

test('a review in the wrong slot does not count as the other reviewer', () => {
  const reviews = both({}, { reviewer: 'critic' });
  assert.match(evaluate({ reviews }).errors.join(), /world slot/);
});

test('a resolution for another chapter is rejected', () => {
  const reviews = both({ verdict: 'conditional', issues: [issue()] });
  assert.match(evaluate({ reviews, resolution: { chapter: 2, issues: [] } }).errors.join(), /resolution/);
});

test('a major issue needs a later review round or a waiver even when fixed', () => {
  const reviews = both({ verdict: 'conditional', issues: [issue({ severity: 'major' })] });
  const fixed = resolution([{ id: 'C1', action: 'fixed' }]);
  assert.match(evaluate({ reviews, resolution: fixed }).errors.join(), /round 2/);
  assert.deepEqual(evaluate({ reviews, resolution: fixed, waive: ['C1'], reason: '已抽查' }).errors, []);
});

test('review rounds above 2 are refused', () => {
  assert.match(evaluate({ reviews: both({ round: 3 }) }).errors.join(), /round/);
});

test('same-text re-run is a no-op even without the original waiver flags', () => {
  const { root, dir } = setup();
  writeFileSync(join(dir, 'reviews', 'ch01.critic.r2.json'), JSON.stringify(review({ round: 2, verdict: 'reject', chapter_sha: sha, issues: [issue({ severity: 'major' })] })));
  assert.deepEqual(acceptChapter(root, 'b', 1, { waive: ['C1'], reason: '裁決' }).errors, []);
  assert.equal(acceptChapter(root, 'b', 1, {}).noop, true);
});

test('re-accepting revised text with no delta removes stale canon', () => {
  const { root, dir } = setup();
  acceptChapter(root, 'b', 1, {});
  const revised = chapterText({ body: '字'.repeat(1999) + '改' });
  const newSha = bodySha(revised);
  writeFileSync(join(dir, 'chapters', 'ch01.md'), revised);
  writeFileSync(join(dir, 'reviews', 'ch01.critic.r2.json'), JSON.stringify(review({ round: 2, chapter_sha: newSha })));
  writeFileSync(join(dir, 'reviews', 'ch01.world.r2.json'), JSON.stringify(review({ reviewer: 'world', round: 2, chapter_sha: newSha })));
  assert.deepEqual(acceptChapter(root, 'b', 1, {}).errors, []);
  assert.doesNotMatch(readFileSync(join(dir, 'worldbuilding', 'continuity.md'), 'utf8'), /4U 舊拍/);
});

test('registry progress reflects the highest accepted chapter', () => {
  const { root, dir } = setup();
  const record = { chapters: { 2: { sha: 'x' } } };
  writeFileSync(join(dir, 'accepted.json'), JSON.stringify(record));
  acceptChapter(root, 'b', 1, {});
  assert.match(readFileSync(join(root, 'novels', 'registry.md'), 'utf8'), /第2章通過/);
});
