// Domain types for the renderer. v0.1 — the shape that Movements (UX-003) and the
// mock data provider agree on. The real storage layer (Morpheus) will produce
// events that the read-model projects into rows matching this shape; this file
// is the renderer's contract.
//
// NOTE: `id` will be a ULID in the real implementation per crypto-spec §11.
// v0.1 uses UUID strings for the mock; the rendering code treats them as opaque.

export type MovementType = 'income' | 'expense';

/**
 * Workflow status of a movement.
 * - `approved`  — reconciled / confirmed (default for imported-from-bank rows).
 * - `pending`   — awaiting review (matches `--color-status-pending-*` tokens, Mouse v0.2).
 * - `rejected`  — flagged and excluded from totals by downstream consumers.
 *
 * Note: per team decision 2026-04-19, the real domain has no "pending"
 * transactions at the ledger level — rows are always confirmed at import.
 * The `status` field here is an application-level workflow flag (review
 * state), not an accounting state. Kept distinct so Trinity can render
 * the prototype's Estado column with color-coded badges.
 */
export type MovementStatus = 'pending' | 'approved' | 'rejected';

export interface Movement {
  readonly id: string;
  readonly date: string; // ISO-8601 YYYY-MM-DD (UTC)
  readonly type: MovementType;
  readonly amount: number; // Positive number; sign is implied by `type`.
  readonly currency: 'EUR'; // Rett Spain pilot. Multi-currency deferred.
  readonly description: string;
  readonly account: string; // Display name (e.g. "Banco Santander"). Real impl: account_id → account lookup.
  /**
   * Category label, or `null` when the row has not been categorised yet.
   * `null` is the canonical "uncategorised" signal; the Movements filter bar
   * ("solo sin categorizar") tests for `category == null`.
   */
  readonly category: string | null;
  readonly subcategory: string | null;
  /**
   * Free-form tag labels. Always an array (possibly empty). Order is not
   * semantically meaningful. In the real backend this will map to the
   * reference_data `tags` container (cloud) / `tags` table (SQLite).
   */
  readonly tags: readonly string[];
  readonly status: MovementStatus;
}

export interface DateRange {
  readonly from: Date;
  readonly to: Date;
}

export interface MovementTotals {
  readonly income: number;
  readonly expense: number;
  readonly net: number;
  readonly count: number;
}
