// Movements API client — thin wrapper over window.opentreasury.movements.*
// (WI-12). Mirrors the pattern established by `panelApi.ts`.
//
// Scope: pure pass-through. The read-model projection is Morpheus's
// responsibility; the renderer is just a typed caller.

import type {
  MovementRecord,
  MovementsFilter,
} from '../types/movementsFilter.js';

/**
 * List movements matching an optional filter. Omitting `filter` returns the
 * main-side default (typically "most recent, bounded by a default limit").
 * The returned array preserves the server's sort order — callers that need
 * a different ordering should sort client-side.
 */
export async function listMovements(
  filter?: MovementsFilter,
): Promise<MovementRecord[]> {
  return window.opentreasury.movements.list(filter);
}
