// Query API client — thin wrapper over window.opentreasury.query.*.
//
// `rehydrate()` forces the main process to re-read the on-disk event log and
// rebuild its in-memory read model. The renderer calls this before issuing a
// follow-up data fetch (e.g. `listMovements`) so it picks up events written
// by other desktop instances that share the same encrypted workspace.

import type { QueryRehydrateResponse } from '../../shared/ipc-contracts/query.js';

/**
 * Force the main process to re-read the event log from disk. Returns a
 * discriminated union — callers should check `result.ok` and surface a toast
 * on failure rather than throwing across the IPC boundary.
 */
export async function rehydrate(): Promise<QueryRehydrateResponse> {
  return window.opentreasury.query.rehydrate();
}
