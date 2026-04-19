import { defineConfig } from 'vitest/config';

// Co-located unit test config — ADR-002 §4 / §7.3.
// Integration tests use a separate config at ./vitest.integration.config.ts (TODO).
export default defineConfig({
  test: {
    include: ['app/src/**/*.test.ts', 'app/src/**/*.test.tsx'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
  },
});
