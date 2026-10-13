import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bodySha, checkChapter, setStatus } from './chapter.mjs';
import { appendEvents, localTimestamp, ROLES } from './log.mjs';
import { novelDir, setRegistryProgress } from './novel.mjs';
import { chapterId, latestReviews, readJson, REVIEWERS, validateResolution, validateReview } from './review.mjs';

const SERIOUS = ['blocker', 'major'];
const MAX_ROUNDS = 2;

function issueFindings(name, data, resolved, waived) {
  return data.issues.filter((i) => !waived.has(i.id)).reduce(
    (acc, i) => {
      const action = resolved.get(i.id);
      if (SERIOUS.includes(i.severity)) {
        const next = data.round >= MAX_ROUNDS ? 'editor must --waive or hold the chapter' : 'needs a round 2 re-review or --waive';
        return { ...acc, errors: [...acc.errors, `${name} r${data.round} ${i.severity} ${i.id} ${next}`] };
      }
      if (action === 'fixed') return acc;
      const why = action === 'declined' ? 'declined by writer' : 'left as is';
      return { ...acc, warnings: [...acc.warnings, `${name} minor ${i.id} ${why}`] };
    },
    { errors: [], warnings: [] },
  );
}

function reviewFindings(name, entry, ctx) {
  if (!entry) return { errors: [`missing ${name} review (reviews/${chapterId(ctx.chapter)}.${name}.rN.json)`], warnings: [] };
  const { data } = entry;
  const invalid = validateReview(data);
  if (invalid.length > 0) return { errors: invalid.map((e) => `${name}: ${e}`), warnings: [] };
  const identity = [
    ...(data.reviewer !== name ? [`${name} slot holds a ${data.reviewer} review`] : []),
    ...(data.chapter !== ctx.chapter ? [`${name} review is for chapter ${data.chapter}`] : []),
    ...(data.round !== entry.round ? [`${name} review says round ${data.round} but file is r${entry.round}`] : []),
    ...(entry.round > MAX_ROUNDS ? [`${name} review round ${entry.round} exceeds the ${MAX_ROUNDS}-round cap`] : []),
  ];
  if (identity.length > 0) return { errors: identity, warnings: [] };
  const issues = issueFindings(name, data, ctx.resolved, ctx.waived);
  const seriousWaived = data.issues.some((i) => SERIOUS.includes(i.severity) && ctx.waived.has(i.id));
  const unsupportedReject = data.verdict === 'reject' && !seriousWaived && issues.errors.length === 0;
  const stale = data.chapter_sha !== ctx.sha;
  const canonStale = name === 'world' && stale && (data.continuity_delta ?? []).length > 0 && !ctx.canonVerified;
  return {
    errors: [
      ...issues.errors,
      ...(unsupportedReject ? [`${name} reject has no waivable issue, run a re-review round`] : []),
      ...(canonStale ? ['world continuity_delta was written for older text, check it then pass --canon-verified'] : []),
    ],
    warnings: [...issues.warnings, ...(stale ? [`${name} review is of older text (sha ${data.chapter_sha})`] : [])],
  };
}

export function evaluateAcceptance({ chapter, chapterText, reviews, resolution, waive, reason, canonVerified }) {
  const check = checkChapter(chapterText);
  const resolutionErrors = !resolution ? []
    : resolution.chapter !== chapter ? [`resolution is for chapter ${resolution.chapter}`]
      : validateResolution(resolution).map((e) => `resolution: ${e}`);
  const ctx = {
    chapter,
    sha: bodySha(chapterText),
    canonVerified,
    waived: new Set(waive),
    resolved: new Map((resolution?.issues ?? []).map((i) => [i.id, i.action])),
  };
  const findings = REVIEWERS.map((name) => reviewFindings(name, reviews[name], ctx));
  const knownIds = new Set(REVIEWERS.flatMap((name) => reviews[name]?.data.issues?.map((i) => i.id) ?? []));
  return {
    errors: [
      ...check.errors,
      ...resolutionErrors,
      ...findings.flatMap((f) => f.errors),
      ...(waive.length > 0 && !reason ? ['--waive needs --reason'] : []),
    ],
    warnings: [
      ...check.warnings,
      ...findings.flatMap((f) => f.warnings),
      ...waive.filter((id) => !knownIds.has(id)).map((id) => `waived id ${id} not found in latest reviews`),
    ],
  };
}

// Replaces the chapter's section so re-accepting revised text never leaves stale canon behind.
function writeContinuity(path, id, delta) {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const pattern = new RegExp(`\\n*<!-- ${id}:start -->[\\s\\S]*?<!-- ${id}:end -->\\n?`);
  const without = text.replace(pattern, '\n').trimEnd();
  const section = delta.length > 0 ? `\n\n<!-- ${id}:start -->\n## ${id}\n${delta.map((d) => `- ${d}`).join('\n')}\n<!-- ${id}:end -->` : '';
  writeFileSync(path, `${without}${section}\n`);
}

const readOptionalJson = (file, fallback) => (existsSync(file) ? readJson(file) : fallback);

function loadChapter(root, slug, chapter) {
  const dir = novelDir(root, slug);
  const id = chapterId(chapter);
  const chapterPath = join(dir, 'chapters', `${id}.md`);
  if (!existsSync(chapterPath)) return { error: `chapter not found: ${chapterPath}` };
  const chapterText = readFileSync(chapterPath, 'utf8');
  const recordPath = join(dir, 'accepted.json');
  const record = readOptionalJson(recordPath, { chapters: {} });
  const sha = bodySha(chapterText);
  return { dir, id, chapterPath, chapterText, recordPath, record, sha, done: record.chapters[chapter]?.sha === sha };
}

// Every step is idempotent and accepted.json is written last, so a crash is recovered by re-running.
function commit(root, slug, chapter, ch, { entry, delta, content }) {
  writeFileSync(ch.chapterPath, setStatus(ch.chapterText, '通過'));
  if (delta) writeContinuity(join(ch.dir, 'worldbuilding', 'continuity.md'), ch.id, delta);
  const chapters = { ...ch.record.chapters, [chapter]: { sha: ch.sha, accepted_at: localTimestamp(), ...entry } };
  setRegistryProgress(root, slug, `第${Math.max(...Object.keys(chapters).map(Number))}章通過`);
  appendEvents(root, [
    { agent: ROLES.editor, type: 'decision', content, novel: slug },
    { agent: ROLES.editor, type: 'status', content: 'idle', novel: slug },
  ]);
  writeFileSync(ch.recordPath, `${JSON.stringify({ chapters }, null, 2)}\n`);
}

export function acceptChapter(root, slug, chapter, { waive = [], reason = '', canonVerified = false }) {
  const ch = loadChapter(root, slug, chapter);
  if (ch.error) return { errors: [ch.error], warnings: [] };
  if (ch.done) return { errors: [], warnings: [], noop: true };
  const reviews = latestReviews(join(ch.dir, 'reviews'), chapter);
  const resolution = readOptionalJson(join(ch.dir, 'reviews', `${ch.id}.resolution.json`), null);
  const result = evaluateAcceptance({ chapter, chapterText: ch.chapterText, reviews, resolution, waive, reason, canonVerified });
  if (result.errors.length > 0) return result;
  const waiverNote = waive.length > 0 ? `（豁免 ${waive.join(', ')}：${reason}）` : '';
  commit(root, slug, chapter, ch, {
    entry: { waived: waive, ...(reason ? { reason } : {}) },
    delta: reviews.world.data.continuity_delta ?? [],
    content: `第${chapter}章定稿${waiverNote}`,
  });
  return result;
}

// For chapters accepted by an earlier workflow: no JSON reviews exist and continuity.md is kept as is.
export function importChapter(root, slug, chapter, source) {
  const ch = loadChapter(root, slug, chapter);
  if (ch.error) return { errors: [ch.error], warnings: [] };
  if (ch.done) return { errors: [], warnings: [], noop: true };
  const result = checkChapter(ch.chapterText);
  if (result.errors.length > 0) return result;
  commit(root, slug, chapter, ch, { entry: { legacy: source }, delta: null, content: `第${chapter}章匯入（${source}）` });
  return result;
}
