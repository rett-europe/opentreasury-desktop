// Event-sourced domain event type definitions (ADR-001 Option A / ADR-002 §4).
// Zod schemas will live in src/shared/events/ as feature PRDs arrive; this file
// carries only skeleton TS types so the compiler has a target.
//
// TODO(C10, R8): every mutation event MUST produce a matching audit entry
//   per crypto-spec §8. Tracked in src/core/audit/ (future).

/** ULID (ADR-001 C11). 26-char Crockford base32. */
export type Ulid = string;

/** Discriminator for the event log. One `type` per semantic action. */
export type DomainEventType =
  | 'tx.created'
  | 'tx.edited'
  | 'tx.deleted'
  | 'account.created'
  | 'category.created';

export interface DomainEventBase {
  readonly id: Ulid;
  readonly type: DomainEventType;
  readonly datasetId: Ulid;
  readonly actorDeviceId: Ulid;
  readonly createdAt: string; // ISO 8601 UTC
  readonly dekVersion: number;
}

// Concrete event shapes arrive with their feature PRDs (PRD-001 Movements lands `tx.*` first).
// This file intentionally exports only the base — see ADR-002 §5.4 for traceability rules.
