import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const REVIEWERS = ['critic', 'world'];
export const VERDICTS = ['pass', 'conditional', 'reject'];
export const SEVERITIES = ['blocker', 'major', 'minor'];
const ACTIONS = ['fixed', 'declined'];

export const chapterId = (n) => `ch${String(n).padStart(2, '0')}`;

const isPositiveInt = (v) => Number.isInteger(v) && v > 0;

function issueErrors(issues) {
  if (!Array.isArray(issues)) return ['issues must be an array'];
  const ids = issues.map((i) => i.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  return [
    ...issues.flatMap((item, index) => [
      ...(item.id ? [] : [`issues[${index}] missing id`]),
      ...(SEVERITIES.includes(item.severity) ? [] : [`issues[${index}] severity must be ${SEVERITIES.join('|')}`]),
      ...(item.location ? [] : [`issues[${index}] missing location`]),
      ...(item.suggestion ? [] : [`issues[${index}] missing suggestion`]),
    ]),
    ...duplicates.map((id) => `duplicate issue id "${id}"`),
  ];
}

export function validateReview(data) {
  const errors = [
    ...(REVIEWERS.includes(data.reviewer) ? [] : [`reviewer must be ${REVIEWERS.join('|')}`]),
    ...(isPositiveInt(data.chapter) ? [] : ['chapter must be a positive integer']),
    ...(isPositiveInt(data.round) ? [] : ['round must be a positive integer']),
    ...(data.chapter_sha ? [] : ['missing chapter_sha (run: studio sha <chapter>)']),
    ...(VERDICTS.includes(data.verdict) ? [] : [`verdict must be ${VERDICTS.join('|')}`]),
    ...issueErrors(data.issues),
    ...['highlights', 'continuity_delta', 'questions']
      .filter((key) => data[key] !== undefined && !Array.isArray(data[key]))
      .map((key) => `${key} must be an array`),
  ];
  const hasBlocker = Array.isArray(data.issues) && data.issues.some((i) => i.severity === 'blocker');
  return data.verdict === 'pass' && hasBlocker ? [...errors, 'verdict pass cannot contain a blocker issue'] : errors;
}

export function validateResolution(data) {
  if (!isPositiveInt(data.chapter)) return ['chapter must be a positive integer'];
  if (!Array.isArray(data.issues)) return ['issues must be an array'];
  return data.issues.flatMap((item, index) => [
    ...(item.id ? [] : [`issues[${index}] missing id`]),
    ...(ACTIONS.includes(item.action) ? [] : [`issues[${index}] action must be ${ACTIONS.join('|')}`]),
  ]);
}

export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

export function latestReviews(reviewsDir, chapter) {
  const pattern = new RegExp(`^${chapterId(chapter)}\\.(${REVIEWERS.join('|')})\\.r(\\d+)\\.json$`);
  const files = existsSync(reviewsDir) ? readdirSync(reviewsDir) : [];
  return files.reduce((latest, name) => {
    const match = name.match(pattern);
    if (!match) return latest;
    const [, reviewer, roundText] = match;
    const round = Number(roundText);
    if (latest[reviewer] && latest[reviewer].round >= round) return latest;
    const file = join(reviewsDir, name);
    return { ...latest, [reviewer]: { file, round, data: readJson(file) } };
  }, {});
}
