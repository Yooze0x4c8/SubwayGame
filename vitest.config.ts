import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Server + shared: node env. The client package runs under its own Vite
    // config (jsdom + `@subway/shared` source alias) via the root workspace, so
    // it is excluded here to avoid a second, mis-configured run.
    include: ['packages/**/src/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'packages/client/**'],
    environment: 'node',
    passWithNoTests: true,
  },
});
