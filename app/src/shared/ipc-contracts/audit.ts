// SPEC-028 WI-4 (#360) — Audit & Evidence viewer IPC contract (read-only).
//
// Three renderer→main `invoke` channels, all Zod-validated at the boundary in
// both directions (FR12 / AC10, R12/C13). The renderer receives ONLY the
// validated view-models below — never plaintext file paths, ciphertext, master
// key material, or signing keys. All decrypt / file-read / signature-verify /
// hashing stays in main; these schemas are the entire renderer-visible surface.
//
//   - `audit:verifyStatus`      → the integrity banner state + per-device
//                                 "anchored through" + external-timestamp state
//                                 (derived from the LAST unlock verdict + a
//                                 read-only pass over the audit chain — no
//                                 re-verify is triggered by navigation, §2).
//   - `audit:listSigned`        → the "Registro firmado" lane: signed,
//                                 hash-chained audit entries (exports, anchors,
//                                 timestamp receipts) for a period.
//   - `audit:listChangeHistory` → the "Historial de cambios" lane: event-derived
//                                 change history (date · actor · device · action
//                                 · account) with HONEST `unknown` attribution
//                                 for pre-coverage / flat events (§3.4).
//
// There is deliberately NO renderer-invokable anchor-write or export channel
// here: anchoring is a main-process lifecycle concern (unlock/lock/interval),
// and the evidence-export bundle (WI-6) is a separate, deferred increment.
//
// This module is import-safe from renderer, preload, and main (shared zone).

import { z } from 'zod';

// ============================================================================
// Channel name constants
// ============================================================================

export const IPC_AUDIT_VERIFY_STATUS = 'audit:verifyStatus';
export const IPC_AUDIT_LIST_SIGNED = 'audit:listSigned';
export const IPC_AUDIT_LIST_CHANGE_HISTORY = 'audit:listChangeHistory';

// ============================================================================
// Primitive schemas
// ============================================================================

/** ISO calendar date `YYYY-MM-DD` (filter bounds, inclusive). */
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'must be YYYY-MM-DD');

/**
 * An opaque identifier (device / actor / account ULID). Surfaced as-is: a ULID
 * is neither a secret nor PII (the actor's *display name* is not derivable from
 * it without the local directory). We intentionally do NOT tighten this to the
 * 26-char ULID regex — flat WI-15-lite config events carry `z.string().min(1)`
 * ids, and the viewer must render those faithfully rather than refuse them.
 */
const opaqueIdSchema = z.string().min(1).max(64);

// ============================================================================
// audit:verifyStatus
// ============================================================================

/**
 * Integrity-banner state (spec §4.1). Conveyed by text + icon in the renderer,
 * never colour alone. `integrity-error` and `unavailable` are the fail-closed
 * states reachable when the viewer is the unlock-time tamper destination
 * (entry point #4); the normal viewer only ever shows the first three.
 */
export const auditBannerSchema = z.enum([
  'verified', // chain verified, every known device anchored to its head
  'verified-unsealed-tail', // verified, but events exist after the last anchor (informational)
  'no-anchors', // nothing anchored yet (new workspace)
  'integrity-error', // BLOCKING tamper (failClosed, category=tamper)
  'unavailable', // BLOCKING but recoverable (still syncing) (failClosed, category=unavailable)
]);
export type AuditBanner = z.infer<typeof auditBannerSchema>;

/** Per-anchor external-timestamp state, derived at read time (FR13–FR15). */
export const auditTimestampStateSchema = z.enum([
  'timestamped', // a matching audit.anchor.timestamped receipt exists
  'pending', // anchored locally, no external receipt yet (offline / queued)
  'none', // not anchored, so no timestamp applies
]);
export type AuditTimestampState = z.infer<typeof auditTimestampStateSchema>;

/** Per-device recompute status, mirroring the WI-3 verify verdict. */
export const auditDeviceAnchorStatusSchema = z.enum([
  'ok',
  'file-missing',
  'file-malformed',
  'truncated',
  'last-event-mismatch',
  'head-mismatch',
]);
export type AuditDeviceAnchorStatus = z.infer<typeof auditDeviceAnchorStatusSchema>;

/** A single device's "anchored through" chip (spec §4.1). */
export const auditDeviceStatusSchema = z.object({
  deviceId: opaqueIdSchema,
  /** True for the device this process is running on (`Este dispositivo`). */
  isCurrentDevice: z.boolean(),
  status: auditDeviceAnchorStatusSchema,
  /** ISO timestamp of the anchor that sealed this device's frontier, or null. */
  anchoredThrough: z.string().datetime().nullable(),
  /** Complete lines on disk beyond the anchored prefix (expected late peer sync). */
  notYetAnchored: z.number().int().nonnegative(),
  timestamp: auditTimestampStateSchema,
});
export type AuditDeviceStatus = z.infer<typeof auditDeviceStatusSchema>;

export const auditVerifyStatusRequestSchema = z.object({}).strict();
export type AuditVerifyStatusRequest = z.infer<typeof auditVerifyStatusRequestSchema>;

export const auditVerifyStatusResponseSchema = z.object({
  banner: auditBannerSchema,
  /** When true the workspace did NOT open normally — render the blocking view. */
  failClosed: z.boolean(),
  category: z.enum(['ok', 'tamper', 'unavailable']),
  recovery: z.enum(['none', 'restore', 'retry']),
  /** Stable machine-readable sub-reason (e.g. the chain verify reason). */
  reason: z.string().optional(),
  /** Total complete lines on disk beyond every anchored prefix (amber chip). */
  unsealedTailCount: z.number().int().nonnegative(),
  devices: z.array(auditDeviceStatusSchema),
});
export type AuditVerifyStatusResponse = z.infer<typeof auditVerifyStatusResponseSchema>;

// ============================================================================
// audit:listSigned — "Registro firmado" lane
// ============================================================================

export const auditSignedActionSchema = z.enum([
  'export.csv',
  'export.xlsx',
  'report.generate',
  'audit.anchor',
  'audit.anchor.timestamped',
  'audit.export',
]);
export type AuditSignedAction = z.infer<typeof auditSignedActionSchema>;

export const auditSignedResultSchema = z.enum(['started', 'succeeded', 'failed']);
export type AuditSignedResult = z.infer<typeof auditSignedResultSchema>;

/**
 * One signed, hash-chained audit entry projected for display. `lane: 'signed'`
 * is carried per-row so a screen-reader user (and a printed report) can always
 * tell an audit-grade entry from event-derived history (spec §3.3, AC9).
 */
export const signedEntryViewSchema = z.object({
  lane: z.literal('signed'),
  seq: z.number().int().positive(),
  /** ISO 8601 UTC entry timestamp. */
  timestamp: z.string().datetime(),
  action: auditSignedActionSchema,
  result: auditSignedResultSchema,
  /** Signing device ULID (provenance — proves key continuity, not identity). */
  actorDeviceId: opaqueIdSchema,
  /** Anchor frontier date (`observed_at`) — present only on `audit.anchor` rows. */
  anchoredThrough: z.string().datetime().nullable(),
  /** Device count in the anchored frontier — present only on `audit.anchor` rows. */
  deviceCount: z.number().int().nonnegative().nullable(),
  /** Per-anchor external-timestamp state (derived). `none` for non-anchor rows. */
  timestamp_state: auditTimestampStateSchema,
});
export type SignedEntryView = z.infer<typeof signedEntryViewSchema>;

export const auditListSignedRequestSchema = z
  .object({
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
  })
  .strict();
export type AuditListSignedRequest = z.infer<typeof auditListSignedRequestSchema>;

export const auditListSignedResponseSchema = z.object({
  entries: z.array(signedEntryViewSchema),
  /** Total before the date filter — lets the UI show "showing N of M". */
  totalCount: z.number().int().nonnegative(),
});
export type AuditListSignedResponse = z.infer<typeof auditListSignedResponseSchema>;

// ============================================================================
// audit:listChangeHistory — "Historial de cambios" lane
// ============================================================================

/**
 * Honest attribution (spec §3.4). The viewer MUST NOT render an actor/device it
 * cannot source, and MUST NOT infer one from the currently-unlocked session.
 *   - `known`              → real actor/device from an attributed event envelope.
 *   - `unknown`/`pre-coverage` → older mutation event written before coverage.
 *   - `unknown`/`flat`     → flat event (config/note/split/import) that records
 *                            *what* + *when* but not *who* until the M2 work lands.
 */
export const changeHistoryActorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('known'), userId: opaqueIdSchema }),
  z.object({ kind: z.literal('unknown'), reason: z.enum(['pre-coverage', 'flat']) }),
]);
export type ChangeHistoryActor = z.infer<typeof changeHistoryActorSchema>;

export const changeHistoryDeviceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('known'), deviceId: opaqueIdSchema }),
  z.object({ kind: z.literal('unknown') }),
]);
export type ChangeHistoryDevice = z.infer<typeof changeHistoryDeviceSchema>;

/**
 * One event-derived change-history row. `lane: 'history'` and the honest
 * attribution unions are the renderer's only attribution source — there is no
 * raw envelope, ciphertext, or path here (AC10).
 */
export const changeHistoryRowSchema = z.object({
  lane: z.literal('history'),
  /** Event ULID — stable row key. */
  eventId: opaqueIdSchema,
  /** ISO 8601 UTC — when the change occurred (the event's own timestamp). */
  occurredAt: z.string().datetime(),
  /** Raw domain-event `type`; the renderer maps it to a localized action label. */
  action: z.string().min(1),
  actor: changeHistoryActorSchema,
  device: changeHistoryDeviceSchema,
  /** Account/category context ULID, when the event carries one. */
  accountId: opaqueIdSchema.nullable(),
  /** Resolved account label (from the read model), when resolvable. */
  accountLabel: z.string().nullable(),
});
export type ChangeHistoryRow = z.infer<typeof changeHistoryRowSchema>;

export const auditListChangeHistoryRequestSchema = z
  .object({
    dateFrom: isoDateSchema.optional(),
    dateTo: isoDateSchema.optional(),
    /** Restrict to events touching any of these account ULIDs. */
    accountIds: z.array(opaqueIdSchema).max(1000).optional(),
    /** Restrict to events attributed to any of these device ULIDs. */
    deviceIds: z.array(opaqueIdSchema).max(1000).optional(),
  })
  .strict();
export type AuditListChangeHistoryRequest = z.infer<typeof auditListChangeHistoryRequestSchema>;

export const auditListChangeHistoryResponseSchema = z.object({
  rows: z.array(changeHistoryRowSchema),
  /** Total before the filters — lets the UI show "showing N of M". */
  totalCount: z.number().int().nonnegative(),
});
export type AuditListChangeHistoryResponse = z.infer<typeof auditListChangeHistoryResponseSchema>;
