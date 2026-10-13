import { basename, resolve } from 'node:path';
import { appendEvents, ROLES } from './log.mjs';
import { currentNovel } from './novel.mjs';

const IGNORED = /\/logs\/|\/novels\/\.current$/;

const PATH_ROLES = [
  [/\/reviews\/[^/]*\.world\./, ROLES.worldbuilder],
  [/\/reviews\/[^/]*\.resolution\./, ROLES.writer],
  [/\/reviews\//, ROLES.critic],
  [/\/worldbuilding\//, ROLES.worldbuilder],
  [/\/chapters\//, ROLES.writer],
];

const roleForAgent = (type) => (Object.hasOwn(ROLES, type ?? '') ? ROLES[type] : undefined);
const roleForPath = (path) => PATH_ROLES.find(([pattern]) => pattern.test(path))?.[1] ?? ROLES.editor;
const novelFromPath = (path) => path.match(/\/novels\/([^/]+)\//)?.[1];

function fileEvent(root, input) {
  const raw = input.tool_input?.file_path ?? input.tool_response?.filePath;
  if (!raw) return [];
  const path = resolve(root, raw);
  if (IGNORED.test(path)) return [];
  const agent = roleForAgent(input.agent_type) ?? roleForPath(path);
  return [{ agent, type: 'task', content: `檔案更新: ${basename(path)}`, novel: novelFromPath(path) ?? currentNovel(root) }];
}

function subagentEvent(root, input, content) {
  const agent = roleForAgent(input.agent_type);
  if (!agent || agent === ROLES.editor) return [];
  return [{ agent, type: 'status', content, novel: currentNovel(root) }];
}

export function hookEvents(root, input) {
  switch (input.hook_event_name) {
    case 'PostToolUse': return fileEvent(root, input);
    case 'SubagentStart': return subagentEvent(root, input, 'working');
    case 'SubagentStop': return subagentEvent(root, input, 'idle');
    default: return [];
  }
}

// Hooks must never break the session: report problems on stderr and exit cleanly.
export function handleHook(root, stdinText) {
  try {
    const events = hookEvents(root, JSON.parse(stdinText));
    if (events.length > 0) appendEvents(root, events);
  } catch (error) {
    process.stderr.write(`studio hook skipped: ${error.message}\n`);
  }
}
