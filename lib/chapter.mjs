import { createHash } from 'node:crypto';

export const CHAPTER_STATUSES = ['審查中', '條件通過修改中', '退件修改中', '通過'];
const REQUIRED = ['chapter', 'title', 'version', 'status', 'last_modified', 'changelog'];
const LENGTH = { min: 1500, max: 3000 };
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

const scalar = (raw) => {
  const v = raw.trim().replace(/^"(.*)"$/, '$1');
  return /^\d+$/.test(v) ? Number(v) : v;
};

// ponytail: tiny YAML subset (key: value + one-level "- item" lists), swap for a YAML lib if frontmatter grows
export function parseFrontmatter(raw) {
  const text = raw.replace(/\r\n/g, '\n');
  const match = text.match(FRONTMATTER);
  if (!match) return { data: null, body: text };
  const data = {};
  let listKey = null;
  for (const line of match[1].split('\n')) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      data[listKey] = [...data[listKey], scalar(item[1])];
      continue;
    }
    const pair = line.match(/^(\w+):\s*(.*)$/);
    if (!pair) continue;
    listKey = pair[2] === '' ? pair[1] : null;
    data[pair[1]] = listKey ? [] : scalar(pair[2]);
  }
  return { data, body: text.slice(match[0].length) };
}

export const countHan = (text) => (text.match(/\p{Script=Han}/gu) ?? []).length;

export const bodySha = (text) => createHash('sha256').update(parseFrontmatter(text).body).digest('hex').slice(0, 16);

export function checkChapter(text) {
  const { data, body } = parseFrontmatter(text);
  if (!data) return { errors: ['missing frontmatter block (--- ... ---)'], warnings: [], han: countHan(text) };
  const isEmpty = (key) => data[key] === undefined || data[key] === '' || (key !== 'changelog' && Array.isArray(data[key]));
  const missing = REQUIRED.filter(isEmpty);
  const errors = [
    ...missing.map((key) => `frontmatter missing "${key}"`),
    ...(data.status !== undefined && !CHAPTER_STATUSES.includes(data.status)
      ? [`invalid status "${data.status}", expected ${CHAPTER_STATUSES.join('|')}`]
      : []),
    ...(data.changelog !== undefined && (!Array.isArray(data.changelog) || data.changelog.length === 0) ? ['changelog must be a non-empty list'] : []),
  ];
  const han = countHan(body);
  const warnings = han < LENGTH.min || han > LENGTH.max ? [`length ${han} Han chars, target ${LENGTH.min}-${LENGTH.max}`] : [];
  return { errors, warnings, han };
}

export function setStatus(raw, status) {
  return raw.replace(/\r\n/g, '\n').replace(FRONTMATTER, (block) => block.replace(/^status:.*$/m, `status: ${status}`));
}
