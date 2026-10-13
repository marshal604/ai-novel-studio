import { defineConfig } from 'vitest/config';
import { novelData } from './server/data';

export default defineConfig({
  base: './',
  plugins: [novelData()],
  server: { port: 5188 },
  // Phaser alone is ~1.4 MB; one chunk is fine for a local tool
  build: { chunkSizeWarningLimit: 1700 },
  test: { include: ['test/**/*.test.ts'] },
});
