// Movements API client — thin wrapper over window.opentreasury.movements.*
// (WI-12). Mirrors the pattern established by `panelApi.ts`.
//
// Scope: pure pass-through. The IPC returns the wire-level `MovementRecord`
// shape (ID-based). Display-layer mapping to labels (`types/movement.ts`) is
// WI-14's job — do NOT add it here; keep this a pure transport wrapper.

import type { MovementRecord, MovementsListRequest } from '../../shared/ipc-contracts/movements.js';

/**
 * List movements matching an optional filter. Omitting `filter` returns the
 * main-side default (every movement, server-sorted DESC by date then createdAt).
 * The returned array preserves the server's sort order — callers that need a
 * different ordering should sort client-side.
 */
export async function listMovements(filter?: MovementsListRequest): Promise<MovementRecord[]> {
  return window.opentreasury.movements.list(filter);
}
