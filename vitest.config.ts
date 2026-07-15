import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: { obsidian: resolve(here, 'tests/mocks/obsidian.ts') },
  },
  test: {
    environment: 'node',
    coverage: { provider: 'v8', reporter: ['text', 'html'] },
  },
});
