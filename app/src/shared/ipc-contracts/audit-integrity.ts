// SPEC-028 WI-3 (#361) — Chain-verify-on-unlock integrity verdict (IPC view-model).
//
// The renderer-facing projection of the main-process verify-on-unlock result.
// It is deliberately REDACTED: it carries only classification, ULIDs (device
// ids), and counts — never file paths, plaintext, hashes of secrets, or keys
// (renderer isolation R11/R12; PII in logs R15). The verdict is Zod-validated
// at the IPC boundary in both directions.
//
// `failClosed === true` means the workspace MUST NOT open. `category`/`recovery`
// drive how the failure is messaged:
//   - `tamper`      → a genuine integrity break; route to snapshot recovery (R19).
//   - `unavailable` → evidence/key not (yet) present or files still settling
//                     (e.g. cloud-sync lag); message as "still syncing — retry,"
//                     NOT as corruption, even though it still blocks opening.

import { z } from 'zod';

/** Per-device recompute status, mirroring WI-2's `DeviceVerifyStatus`. */
export const integrityDeviceStatusSchema = z.enum([
  'ok',
  'file-missing',
  'file-malformed',
  'truncated',
  'last-event-mismatch',
  'head-mismatch',
]);

export type IntegrityDeviceStatus = z.infer<typeof integrityDeviceStatusSchema>;

export const integrityDeviceSchema = z.object({
  /** Device ULID (safe to surface — not PII, not a secret). */
  deviceId: z.string(),
  status: integrityDeviceStatusSchema,
  /** Complete lines on disk beyond the anchored prefix (expected late peer sync). */
  notYetAnchored: z.number().int().nonnegative(),
});

export type IntegrityDevice = z.infer<typeof integrityDeviceSchema>;

/**
 * Overall verdict status.
 *   OPEN (failClosed=false): `ok` | `no-audit-chain` | `no-anchor`.
 *   FAIL-CLOSED · tamper:    `chain-broken` | `anchor-content-mismatch`.
 *   FAIL-CLOSED · unavailable: `signing-key-missing` | `anchored-file-missing`
 *                              | `anchored-file-truncated` | `files-unstable`.
 */
export const integrityStatusSchema = z.enum([
  'ok',
  'no-audit-chain',
  'no-anchor',
  'chain-broken',
  'anchor-content-mismatch',
  'signing-key-missing',
  'anchored-file-missing',
  'anchored-file-truncated',
  'files-unstable',
]);

export type IntegrityStatus = z.infer<typeof integrityStatusSchema>;

export const integrityCategorySchema = z.enum(['ok', 'tamper', 'unavailable']);
export type IntegrityCategory = z.infer<typeof integrityCategorySchema>;

export const integrityRecoverySchema = z.enum(['none', 'restore', 'retry']);
export type IntegrityRecovery = z.infer<typeof integrityRecoverySchema>;

export const integrityVerdictSchema = z.object({
  status: integrityStatusSchema,
  /** When true, the workspace MUST NOT open. */
  failClosed: z.boolean(),
  category: integrityCategorySchema,
  recovery: integrityRecoverySchema,
  /** Stable machine-readable sub-reason (e.g. the chain verify reason). */
  reason: z.string().optional(),
  /** Per-anchored-device recompute results (empty when no anchor was verified). */
  devices: z.array(integrityDeviceSchema),
  summary: z.object({
    anchoredDeviceCount: z.number().int().nonnegative(),
    notYetAnchoredTotal: z.number().int().nonnegative(),
    /** Device files present on disk but absent from the latest anchor. */
    newDeviceCount: z.number().int().nonnegative(),
  }),
});

export type IntegrityVerdict = z.infer<typeof integrityVerdictSchema>;
