import { defineWorkspace } from 'vitest/config';

/**
 * Vitest workspace so a single `npm test` at the root runs every package with
 * the right environment:
 *   - server + shared: node env, *.test.ts (root vitest.config.ts).
 *   - client: jsdom env + `@subway/shared` source alias + *.test.{ts,tsx}
 *     (packages/client/vite.config.ts).
 */
export default defineWorkspace([
  './vitest.config.ts',
  './packages/client/vite.config.ts',
]);
