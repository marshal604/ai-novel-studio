import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateReview, validateResolution, latestReviews } from '../lib/review.mjs';
import { review, issue, resolution } from './factories.mjs';
import { tempRoot } from './helpers.mjs';

test('a well-formed review is valid', () => {
  assert.deepEqual(validateReview(review({ verdict: 'conditional', issues: [issue()] })), []);
});

test('verdict, reviewer and round are checked', () => {
  const errors = validateReview(review({ verdict: 'ok', reviewer: 'bob', round: 0 }));
  assert.equal(errors.length, 3);
});

test('each issue needs id, a known severity, location and suggestion', () => {
  const errors = validateReview(review({ issues: [{ id: 'C1', severity: 'huge' }] }));
  assert.match(errors.join(), /severity/);
  assert.match(errors.join(), /location/);
  assert.match(errors.join(), /suggestion/);
});

test('duplicate issue ids are rejected', () => {
  assert.match(validateReview(review({ issues: [issue(), issue()] })).join(), /duplicate/);
});

test('pass with a blocker is contradictory', () => {
  assert.match(validateReview(review({ issues: [issue({ severity: 'blocker' })] })).join(), /blocker/);
});

test('resolution actions must be fixed or declined', () => {
  assert.deepEqual(validateResolution(resolution([{ id: 'C1', action: 'fixed', note: '' }])), []);
  assert.match(validateResolution(resolution([{ id: 'C1', action: 'maybe' }])).join(), /action/);
});

test('latestReviews picks the highest round per reviewer', () => {
  const dir = join(tempRoot(), 'reviews');
  mkdirSync(dir);
  const put = (name, data) => writeFileSync(join(dir, name), JSON.stringify(data));
  put('ch01.critic.r1.json', review({ round: 1 }));
  put('ch01.critic.r2.json', review({ round: 2 }));
  put('ch01.world.r1.json', review({ reviewer: 'world' }));
  put('ch02.world.r3.json', review({ reviewer: 'world', chapter: 2, round: 3 }));
  const latest = latestReviews(dir, 1);
  assert.equal(latest.critic.round, 2);
  assert.equal(latest.world.round, 1);
});
