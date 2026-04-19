// Domain types for the renderer. v0.1 — the shape that Movements (UX-003) and the
// mock data provider agree on. The real storage layer (Morpheus) will produce
// events that the read-model projects into rows matching this shape; this file
// is the renderer's contract.
//
// NOTE: `id` will be a ULID in the real implementation per crypto-spec §11.
// v0.1 uses UUID strings for the mock; the rendering code treats them as opaque.

export type MovementType = 'income' | 'expense';

export interface Movement {
  readonly id: string;
  readonly date: string; // ISO-8601 YYYY-MM-DD (UTC)
  readonly type: MovementType;
  readonly amount: number; // Positive number; sign is implied by `type`.
  readonly currency: 'EUR'; // Rett Spain pilot. Multi-currency deferred.
  readonly description: string;
  readonly account: string; // Display name (e.g. "Banco Santander"). Real impl: account_id → account lookup.
  readonly category: string;
  readonly subcategory: string | null;
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
