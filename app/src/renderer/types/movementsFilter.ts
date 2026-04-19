// Renderer-side mirror of the movements IPC contract (WI-12).
//
// TODO(WI-12 follow-up): Morpheus is authoring `app/src/shared/ipc-contracts/movements.ts`
// in parallel. Once it lands, replace these inline types with re-exports from there.
// The `MovementRecord` shape mirrors the event payload / read-model projection
// (accountId-based, IDs not labels) — NOT the display-layer `Movement` in
// `types/movement.ts`, which is a view model owned by MovementsScreen.
// WI-14 is responsible for mapping `MovementRecord[]` → display `Movement[]`
// via account/category/tag lookups.

import type { TransactionStatus, TransactionType } from './transaction.js';

/**
 * Filter envelope accepted by `window.opentreasury.movements.list`.
 * All fields optional; omitted fields mean "no constraint on this axis".
 */
export interface MovementsFilter {
  readonly accountId?: string;
  readonly dateFrom?: string; // YYYY-MM-DD inclusive
  readonly dateTo?: string; // YYYY-MM-DD inclusive
  readonly limit?: number; // positive int; default defined by main
  readonly offset?: number; // non-negative int; default 0
}

/**
 * Wire-level movement record returned by the IPC bridge. Same shape as
 * `recentTransactionSchema` in `shared/ipc-contracts/panel.ts` — the Panel's
 * recent-movements table already consumes this.
 *
 * NOTE: `tagIds` / `categoryId` are IDs, not labels. The display-layer
 * `Movement` type in `types/movement.ts` uses labels; a mapper is required
 * before rendering into `MovementsScreen` (WI-14).
 */
export interface MovementRecord {
  readonly id: string;
  readonly date: string; // YYYY-MM-DD
  readonly type: TransactionType;
  readonly amount: number; // positive; sign carried by `type`
  readonly currency: 'EUR';
  readonly description: string;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly subcategoryId: string | null;
  readonly tagIds: readonly string[];
  readonly status: TransactionStatus;
  readonly createdAt: string;
}
