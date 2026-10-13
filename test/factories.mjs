export const chapterText = ({ chapter = 1, status = '審查中', version = 1, body = '字'.repeat(2000), omit = [] } = {}) => {
  const fields = {
    chapter: `chapter: ${chapter}`,
    title: 'title: "週四晚上"',
    version: `version: ${version}`,
    status: `status: ${status}`,
    last_modified: 'last_modified: 2026-10-14',
    changelog: 'changelog:\n  - v1: 初稿',
  };
  const head = Object.entries(fields).filter(([k]) => !omit.includes(k)).map(([, v]) => v).join('\n');
  return `---\n${head}\n---\n\n# 第一章\n\n${body}\n`;
};

export const issue = (overrides = {}) => ({
  id: 'C1', severity: 'minor', location: '第3段', quote: '原文', evidence: '', suggestion: '改短', ...overrides,
});

export const review = (overrides = {}) => ({
  reviewer: 'critic', chapter: 1, round: 1, chapter_sha: 'abc', verdict: 'pass',
  issues: [], highlights: [], continuity_delta: [], questions: [], ...overrides,
});

export const resolution = (issues = []) => ({ chapter: 1, issues });
