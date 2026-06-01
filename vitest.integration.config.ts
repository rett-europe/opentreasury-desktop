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
//
// `--expose-gc` is forced onto the worker process (`poolOptions.*.execArgv`)
// so `global.gc` is deterministically available. The 100k-row XLSX memory gate
// (`exportService.memory.integration.test.ts`) relies on a forced GC to take a
// clean, reproducible heap baseline; without this flag the GC call silently
// no-ops and the measurement becomes timing-dependent and flaky on CI.
export default defineConfig({
  test: {
    include: ['app/src/**/*.integration.test.ts', 'app/src/**/*.integration.test.tsx'],
    environment: 'node',
    globals: false,
    setupFiles: ['app/src/renderer/test-setup.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { execArgv: ['--expose-gc'] },
    },
  },
});
