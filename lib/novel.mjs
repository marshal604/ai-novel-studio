import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appendEvents, localTimestamp, ROLES } from './log.mjs';

const REGISTRY_HEADER = '# 小說專案登記表\n\n| slug | 書名 | 狀態 | 進度 | 最後更新 |\n|------|------|------|------|---------|\n';

const STARTER_FILES = {
  'outline.md': (title) => `# 《${title}》大綱\n\n## 核心概念\n\n## 主要角色\n\n## 章節規劃\n\n## changelog\n`,
  'worldbuilding/world.md': () => '# 世界觀\n\n## 基本設定\n\n## 規則與限制\n\n## 地點\n\n## 術語\n',
  'worldbuilding/characters.md': () => '# 角色\n\n## 語氣速查表\n\n| 角色 | 說話方式 | 口頭禪 |\n|------|----------|--------|\n',
  'worldbuilding/continuity.md': () => '# 連續性追蹤\n\n每章定稿時由 `studio accept` 寫入，請勿手改區段標記。\n',
};

export const novelDir = (root, slug) => join(root, 'novels', slug);
const registryPath = (root) => join(root, 'novels', 'registry.md');
const currentPath = (root) => join(root, 'novels', '.current');
const today = () => localTimestamp().slice(0, 10);

export function assertSlug(slug) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug ?? '')) throw new Error(`invalid slug "${slug}", use lowercase letters, digits and dashes`);
}

export function currentNovel(root) {
  return existsSync(currentPath(root)) ? readFileSync(currentPath(root), 'utf8').trim() : '';
}

export function useNovel(root, slug) {
  assertSlug(slug);
  if (!existsSync(novelDir(root, slug))) throw new Error(`novel "${slug}" not found, run: studio new ${slug} <title>`);
  writeFileSync(currentPath(root), `${slug}\n`);
}

const readRegistry = (root) => (existsSync(registryPath(root)) ? readFileSync(registryPath(root), 'utf8') : REGISTRY_HEADER);

function addRegistryRow(root, slug, title) {
  const text = readRegistry(root);
  if (text.includes(`| ${slug} |`)) return;
  const row = `| ${slug} | ${title} | 進行中 | 籌備中 | ${today()} |\n`;
  writeFileSync(registryPath(root), text.endsWith('\n') ? text + row : `${text}\n${row}`);
}

export function setRegistryProgress(root, slug, progress) {
  const lines = readRegistry(root).split('\n');
  const index = lines.findIndex((line) => line.startsWith(`| ${slug} |`));
  if (index === -1) throw new Error(`novel "${slug}" missing from novels/registry.md`);
  const cells = lines[index].split('|').map((c) => c.trim());
  const updated = `| ${cells[1]} | ${cells[2]} | ${cells[3]} | ${progress} | ${today()} |`;
  writeFileSync(registryPath(root), lines.map((line, i) => (i === index ? updated : line)).join('\n'));
}

export function newNovel(root, slug, title) {
  assertSlug(slug);
  if (!title) throw new Error('title is required');
  const dir = novelDir(root, slug);
  ['worldbuilding', 'briefs', 'chapters', 'reviews'].forEach((sub) => mkdirSync(join(dir, sub), { recursive: true }));
  Object.entries(STARTER_FILES)
    .filter(([file]) => !existsSync(join(dir, file)))
    .forEach(([file, render]) => writeFileSync(join(dir, file), render(title)));
  addRegistryRow(root, slug, title);
  useNovel(root, slug);
  appendEvents(root, [{ agent: ROLES.editor, type: 'task', content: `開新書《${title}》`, novel: slug }]);
}
