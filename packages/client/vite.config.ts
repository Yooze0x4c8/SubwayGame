/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite config for the SUBWAY client.
 *
 * `@subway/shared` is aliased directly to its TypeScript source so HMR works
 * without a prior `tsc -b` of the shared package. The shared sources import each
 * other with `.js` specifiers (NodeNext style); Vite/esbuild resolve those to
 * the sibling `.ts` files transparently.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@subway/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Client tests: the integration test needs node (real server), component
    // smoke tests need a DOM. jsdom covers both.
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: false,
  },
});
