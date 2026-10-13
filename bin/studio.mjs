#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { acceptChapter } from '../lib/accept.mjs';
import { bodySha, checkChapter } from '../lib/chapter.mjs';
import { handleHook } from '../lib/hook.mjs';
import { appendEvents, meetingEvents, ROLES } from '../lib/log.mjs';
import { computeMetrics, parseJsonLines } from '../lib/metrics.mjs';
import { currentNovel, newNovel, useNovel } from '../lib/novel.mjs';
import { readJson, validateResolution, validateReview } from '../lib/review.mjs';

const USAGE = `studio <command>
  new <slug> <title>                 scaffold a novel, add registry row, make it current
  use <slug>                         switch the current novel
  log <agent> <type> <content> [--to X] [--novel slug]
  meeting <topic> [--novel slug]     put all four roles in the meeting room
  check <chapter.md>                 frontmatter + length check
  sha <chapter.md>                   body hash for reviews
  review <file.json>                 validate a review or resolution file
  accept <slug> <n> [--waive C1,W2 --reason text] [--canon-verified]
  metrics <stream.jsonl>             cost/turn/tool summary of a claude -p run
  hook                               Claude Code hook entry (reads stdin)`;

const root = process.env.STUDIO_ROOT ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    to: { type: 'string' },
    novel: { type: 'string' },
    waive: { type: 'string' },
    reason: { type: 'string' },
    'canon-verified': { type: 'boolean' },
  },
});
const [command, ...args] = positionals;

const report = ({ errors = [], warnings = [] }) => {
  warnings.forEach((w) => console.warn(`warn: ${w}`));
  errors.forEach((e) => console.error(`error: ${e}`));
  return errors.length > 0 ? 1 : 0;
};

const need = (count) => {
  if (args.length < count) throw new Error(`"${command}" needs ${count} argument(s)\n\n${USAGE}`);
};

const agentName = (raw) => ROLES[raw] ?? raw;

const commands = {
  new: () => { need(2); newNovel(root, args[0], args.slice(1).join(' ')); return 0; },
  use: () => { need(1); useNovel(root, args[0]); return 0; },
  log: () => {
    need(3);
    const [agent, type, ...content] = args;
    appendEvents(root, [{ agent: agentName(agent), type, content: content.join(' '), to: values.to && agentName(values.to), novel: values.novel ?? currentNovel(root) }]);
    return 0;
  },
  meeting: () => { need(1); appendEvents(root, meetingEvents({ novel: values.novel ?? currentNovel(root), topic: args.join(' ') })); return 0; },
  check: () => {
    need(1);
    const result = checkChapter(readFileSync(args[0], 'utf8'));
    console.log(`${result.han} Han chars`);
    return report(result);
  },
  sha: () => { need(1); console.log(bodySha(readFileSync(args[0], 'utf8'))); return 0; },
  review: () => {
    need(1);
    const data = readJson(args[0]);
    const errors = args[0].endsWith('.resolution.json') ? validateResolution(data) : validateReview(data);
    if (errors.length === 0) console.log('ok');
    return report({ errors });
  },
  accept: () => {
    need(2);
    const chapter = Number(args[1]);
    if (!Number.isInteger(chapter) || chapter < 1) throw new Error(`chapter must be a positive integer, got "${args[1]}"`);
    const waive = values.waive ? values.waive.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const result = acceptChapter(root, args[0], chapter, { waive, reason: values.reason ?? '', canonVerified: values['canon-verified'] ?? false });
    if (result.errors.length === 0) console.log(result.noop ? 'already accepted, nothing changed' : `chapter ${chapter} accepted`);
    return report(result);
  },
  metrics: () => { need(1); console.log(JSON.stringify(computeMetrics(parseJsonLines(readFileSync(args[0], 'utf8'))), null, 2)); return 0; },
  hook: () => {
    try {
      handleHook(root, readFileSync(0, 'utf8'));
    } catch (error) {
      console.error(`studio hook skipped: ${error.message}`);
    }
    return 0;
  },
};

try {
  const run = commands[command];
  if (!run) {
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
  } else {
    process.exitCode = run();
  }
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
}
