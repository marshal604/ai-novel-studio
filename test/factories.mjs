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
