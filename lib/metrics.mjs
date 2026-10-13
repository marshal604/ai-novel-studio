const MANUAL_LOG_WRITE = /activity\.jsonl[\s\S]*?(>>|'a'|"a"|appendFile)|(>>|appendFile)[\s\S]*?activity\.jsonl/;

export function parseJsonLines(text) {
  return text.split('\n').flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

const toolUses = (events) => events
  .filter((e) => e.type === 'assistant')
  .flatMap((e) => (e.message?.content ?? []).filter((c) => c.type === 'tool_use'));

const sum = (items, pick) => items.reduce((total, item) => total + (pick(item) ?? 0), 0);

export function computeMetrics(events) {
  const results = events.filter((e) => e.type === 'result');
  const last = results.at(-1) ?? {};
  const usage = Object.values(last.modelUsage ?? {});
  const tools = toolUses(events);
  const notifications = events.filter((e) => e.type === 'system' && e.subtype === 'task_notification' && e.usage);
  return {
    cost_usd: last.total_cost_usd ?? 0,
    models: Object.keys(last.modelUsage ?? {}),
    tokens: {
      input: sum(usage, (u) => u.inputTokens),
      output: sum(usage, (u) => u.outputTokens),
      cache_read: sum(usage, (u) => u.cacheReadInputTokens),
      cache_write: sum(usage, (u) => u.cacheCreationInputTokens),
    },
    editor_invocations: results.length,
    num_turns: sum(results, (r) => r.num_turns),
    active_ms: sum(results, (r) => r.duration_ms),
    tool_calls: tools.reduce((counts, t) => ({ ...counts, [t.name]: (counts[t.name] ?? 0) + 1 }), {}),
    manual_log_writes: tools.filter((t) => t.name === 'Bash' && MANUAL_LOG_WRITE.test(t.input?.command ?? '')).length,
    subagent_runs: notifications.length,
    subagent_tokens: sum(notifications, (n) => n.usage.total_tokens),
  };
}
