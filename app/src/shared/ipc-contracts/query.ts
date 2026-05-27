// Query IPC contract — generic read-side maintenance operations.
//
// Channel: `query:rehydrate` — instructs the main process to re-read the
// event log from disk and rebuild the in-memory read model. Surfaced as a
// dedicated IPC so any screen (Movimientos, Panel, Insights, Saldo, …) can
// force a refresh when it suspects another instance has appended events to
// the shared workspace (e.g. a OneDrive folder shared between two devices).
//
// The contract is intentionally generic so additional read-side operations
// can be added under the same channel namespace later without breaking
// existing callers.
//
// Multi-instance staleness: trial.3.10 surfaced that the renderer's
// "Refrescar" button only re-projected the cached read model. Two users on
// the same encrypted workspace would not see each other's edits until they
// restarted the app. `query:rehydrate` closes that gap by forcing a fresh
// `eventLog.load()` followed by `replayEvents()` on the main side before the
// renderer issues its follow-up `movements:list` call.

import { z } from 'zod';

// IPC channel name
export const IPC_QUERY_REHYDRATE = 'query:rehydrate';

// ============================================================================
// Request — no parameters. Kept as an empty object (not `z.void()`) so future
// options (e.g. `{ scope: 'config' }`) can be added without a contract break.
// ============================================================================

export const queryRehydrateRequestSchema = z.object({}).strict();
export type QueryRehydrateRequest = z.infer<typeof queryRehydrateRequestSchema>;

// ============================================================================
// Response — discriminated union on `ok`.
//   - ok: true  → eventCount + durationMs for diagnostics / observability
//   - ok: false → error.code + error.message so the renderer can surface a
//                 user-facing toast and decide whether to retry.
// ============================================================================

export const queryRehydrateErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type QueryRehydrateError = z.infer<typeof queryRehydrateErrorSchema>;

export const queryRehydrateSuccessSchema = z.object({
  ok: z.literal(true),
  eventCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
});

export const queryRehydrateFailureSchema = z.object({
  ok: z.literal(false),
  error: queryRehydrateErrorSchema,
});

export const queryRehydrateResponseSchema = z.discriminatedUnion('ok', [
  queryRehydrateSuccessSchema,
  queryRehydrateFailureSchema,
]);
export type QueryRehydrateResponse = z.infer<typeof queryRehydrateResponseSchema>;
