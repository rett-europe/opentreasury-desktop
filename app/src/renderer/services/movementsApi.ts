// Movements API client — thin wrapper over window.opentreasury.movements.*
// (WI-12). Mirrors the pattern established by `panelApi.ts`.
//
// Scope: pure pass-through. Main-side resolves account / category / tag labels
// before returning, so the array already matches the display-layer shape that
// MovementsScreen consumes (see `shared/ipc-contracts/movements.ts` — the
// response `Movement` aligns 1:1 with `types/movement.ts` minus `readonly`).

import type {
  Movement,
  MovementsListRequest,
} from '../../shared/ipc-contracts/movements.js';

/**
 * List movements matching an optional filter. Omitting `filter` returns the
 * main-side default (every movement, server-sorted DESC by date). The
 * returned array preserves the server's sort order — callers that need a
 * different ordering should sort client-side.
 */
export async function listMovements(filter?: MovementsListRequest): Promise<Movement[]> {
  return window.opentreasury.movements.list(filter);
}
