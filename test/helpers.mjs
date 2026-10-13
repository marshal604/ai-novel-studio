import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const tempRoot = () => mkdtempSync(join(tmpdir(), 'studio-'));

export const readEvents = (root) => {
  const file = join(root, 'logs', 'activity.jsonl');
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
