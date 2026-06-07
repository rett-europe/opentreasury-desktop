// Dev/test-only boot-phase tracing for diagnosing the e2e perf-gate boot hang.
//
// Gated behind OT_BOOT_TRACE=1 (default off) so it is a no-op on every normal
// `npm run dev` / packaged launch. When enabled it stamps Date.now() around the
// detect → unlock → safeStorage-decrypt → verify-on-unlock → log.load →
// replayEvents → registerDataIpcHandlers sequence that gates the AppShell paint,
// so a stuck launch leaves a clear timeline in the captured main-process log.
//
// The perf gate (.github/workflows/ci.yml) sets OT_BOOT_TRACE=1 and uploads the
// piped main-process log on failure.

const ENABLED = process.env['OT_BOOT_TRACE'] === '1';

/**
 * Emit a single boot-trace line when OT_BOOT_TRACE=1, otherwise a no-op.
 * `phase` is a short stable label like 'unlock:start'; `extra` is optional
 * JSON-serialisable context (kept tiny — no secrets, no event payloads).
 */
export function bootTrace(phase: string, extra?: Record<string, unknown>): void {
  if (!ENABLED) return;
  const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
  // eslint-disable-next-line no-console
  console.log(`[boot-trace] ${phase} t=${Date.now()}${suffix}`);
}
