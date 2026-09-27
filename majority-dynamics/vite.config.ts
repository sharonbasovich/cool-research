import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        lab: resolve(import.meta.dirname, 'lab/index.html'),
        histories: resolve(import.meta.dirname, 'histories/index.html'),
        proofMap: resolve(import.meta.dirname, 'proof-map/index.html'),
      },
    },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
