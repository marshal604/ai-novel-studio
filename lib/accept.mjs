import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bodySha, checkChapter, setStatus } from './chapter.mjs';
import { appendEvents, localTimestamp, ROLES } from './log.mjs';
import { novelDir, setRegistryProgress } from './novel.mjs';
import { chapterId, latestReviews, readJson, REVIEWERS, validateResolution, validateReview } from './review.mjs';

const SERIOUS = ['blocker', 'major'];

function issueFindings(name, data, resolved, waived) {
  const rejected = data.verdict === 'reject';
  return data.issues.filter((i) => !waived.has(i.id)).reduce(
    (acc, i) => {
      const action = resolved.get(i.id);
      if (rejected && SERIOUS.includes(i.severity)) return { ...acc, errors: [...acc.errors, `${name} reject: ${i.id} needs a re-review round or --waive`] };
      if (i.severity === 'blocker') return { ...acc, errors: [...acc.errors, `${name} blocker ${i.id} needs a re-review round or --waive`] };
      if (i.severity === 'major' && action === 'declined') return { ...acc, errors: [...acc.errors, `${name} ${i.id} declined by writer, editor must --waive or require a fix`] };
      if (i.severity === 'major' && action !== 'fixed') return { ...acc, errors: [...acc.errors, `${name} major ${i.id} not fixed in resolution`] };
      if (i.severity === 'minor' && action !== 'fixed') return { ...acc, warnings: [...acc.warnings, `${name} minor ${i.id} left as is`] };
      return acc;
    },
    { errors: [], warnings: [] },
  );
}

function reviewFindings(name, entry, ctx) {
  if (!entry) return { errors: [`missing ${name} review (reviews/${chapterId(ctx.chapter)}.${name}.rN.json)`], warnings: [] };
  const { data } = entry;
  const invalid = validateReview(data);
  if (invalid.length > 0) return { errors: invalid.map((e) => `${name}: ${e}`), warnings: [] };
  if (data.chapter !== ctx.chapter) return { errors: [`${name} review is for chapter ${data.chapter}`], warnings: [] };
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
  const resolutionErrors = resolution ? validateResolution(resolution).map((e) => `resolution: ${e}`) : [];
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

function writeContinuity(path, id, delta) {
  if (delta.length === 0) return;
  const section = `<!-- ${id}:start -->\n## ${id}\n${delta.map((d) => `- ${d}`).join('\n')}\n<!-- ${id}:end -->`;
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const pattern = new RegExp(`<!-- ${id}:start -->[\\s\\S]*?<!-- ${id}:end -->`);
  writeFileSync(path, pattern.test(text) ? text.replace(pattern, section) : `${text.trimEnd()}\n\n${section}\n`);
}

const readOptionalJson = (file, fallback) => (existsSync(file) ? readJson(file) : fallback);

export function acceptChapter(root, slug, chapter, { waive = [], reason = '', canonVerified = false }) {
  const dir = novelDir(root, slug);
  const id = chapterId(chapter);
  const chapterPath = join(dir, 'chapters', `${id}.md`);
  if (!existsSync(chapterPath)) return { errors: [`chapter not found: ${chapterPath}`], warnings: [] };
  const chapterText = readFileSync(chapterPath, 'utf8');
  const reviews = latestReviews(join(dir, 'reviews'), chapter);
  const resolution = readOptionalJson(join(dir, 'reviews', `${id}.resolution.json`), null);
  const result = evaluateAcceptance({ chapter, chapterText, reviews, resolution, waive, reason, canonVerified });
  if (result.errors.length > 0) return result;

  const sha = bodySha(chapterText);
  const recordPath = join(dir, 'accepted.json');
  const record = readOptionalJson(recordPath, { chapters: {} });
  if (record.chapters[chapter]?.sha === sha) return { ...result, noop: true };

  // Each step is idempotent, so a crash mid-way is recovered by re-running accept.
  writeFileSync(chapterPath, setStatus(chapterText, '通過'));
  writeContinuity(join(dir, 'worldbuilding', 'continuity.md'), id, reviews.world.data.continuity_delta ?? []);
  setRegistryProgress(root, slug, `第${chapter}章通過`);
  const entry = { sha, accepted_at: localTimestamp(), waived: waive, ...(reason ? { reason } : {}) };
  writeFileSync(recordPath, `${JSON.stringify({ chapters: { ...record.chapters, [chapter]: entry } }, null, 2)}\n`);
  const waiverNote = waive.length > 0 ? `（豁免 ${waive.join(', ')}：${reason}）` : '';
  appendEvents(root, [
    { agent: ROLES.editor, type: 'decision', content: `第${chapter}章定稿${waiverNote}`, novel: slug },
    { agent: ROLES.editor, type: 'status', content: 'idle', novel: slug },
  ]);
  return result;
}
