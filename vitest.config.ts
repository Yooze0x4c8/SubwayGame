import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Discover *.test.ts across all packages. 0 tests is acceptable at M0.
    include: ['packages/**/src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
  },
});
