import { defineConfig } from 'vitest/config';

// Integration test config — ADR-002 §4 / §7.3.
//
// Unit tests (co-located `*.test.ts(x)`) are run by the default config at
// ./vitest.config.ts. This config is scoped to files with the
// `.integration.test.ts(x)` suffix, which exercise real adapters
// (JsonFileEventLog + reducer + real IPC handlers) over a temporary
// filesystem — see `app/src/main/ipc/handlers/bulkUpdate.integration.test.ts`
// for the WI-31c entry point.
//
// Kept as a separate `npm run test:integration` script so the fast unit
// suite (`npm test`) is not penalised by integration-test setup cost and so
// CI can parallelise the two pipelines independently.
export default defineConfig({
  test: {
    include: ['app/src/**/*.integration.test.ts', 'app/src/**/*.integration.test.tsx'],
    environment: 'node',
    globals: false,
    css: true,
    setupFiles: ['app/src/renderer/test-setup.ts'],
  },
});
