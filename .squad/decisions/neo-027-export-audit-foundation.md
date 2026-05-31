# SPEC-027 Export — Thin Audit Foundation (Decision)

**Date:** 2026-06-01
**Decision maker:** Neo (architecture), with Switch (security)
**Status:** Accepted — implemented in the SPEC-027 export PR
**Spec:** [`docs/specs/027-export.md`](../../docs/specs/027-export.md) ·
[`docs/security/crypto-spec.md`](../../docs/security/crypto-spec.md) §8

---

## Context

SPEC-027 FR18/AC12 require a **signed audit entry written before the first byte**
of every export. The full audit subsystem that crypto-spec §8 assumes
(hash-chained chunk files, Ed25519 device signing keys, `escrow.json`
cross-device trust) **did not exist** at implementation time. Export is the first
feature to require a real, verifiable audit trail, so we had to decide how much of
§8 to build now versus defer.

## Decision

Build a **thin but real audit foundation**, scoped to what export needs, rather
than stub the audit or build the entire §8 subsystem up front.

Delivered in `app/src/core/audit/`:

1. **`AuditLog` interface + `FileAuditLog`** that appends **hash-chained**
   (`seq`, `prev_entry_hash` via BLAKE2b-256), **Ed25519-signed** entries to an
   **MK-encrypted** chunk (`.treasury/audit/current.chunk.v1`,
   `nonce(24) || XChaCha20-Poly1305(ct||tag)`).
2. **Lazy device signing keypair.** An Ed25519 keypair is generated on first
   audit write and persisted **MK-sealed** next to the chunk
   (`signing-key.v1`). The private key is never renderer-visible. The public-key
   fingerprint (BLAKE2b-256) is recorded in a genesis entry and in each entry's
   `signature.signing_device_id` / key-fingerprint fields.
3. **Entry shape matches crypto-spec §8** (`seq`, `ts`, `actor_device_id`,
   `action` ∈ {`export.csv`, `export.xlsx`}, `result`, `after_hash`,
   `prev_entry_hash`, `signature`). `after_hash` is the BLAKE2b-256 of the
   canonical-JSON **filter set with labels hashed** (never raw label values).
4. **Append-only, verify-before-write.** `append` first verifies the whole chain
   (seq monotonicity, `prev_entry_hash`, canonical entry hash, key fingerprint,
   Ed25519 signature) and **fails closed** — a corrupt or tampered chunk
   **blocks the export** (`EXPORT_AUDIT_FAILED`). A `result:"started"` entry is
   written before the first byte; a `succeeded` / `failed` completion entry with
   the same export id follows. Failures are logged **both on-chain**
   (`result:"failed"`) **and to local diagnostics**.

## Consequences

- Export is unblocked with a genuinely verifiable, tamper-evident audit trail —
  not a stub.
- The chain is verified on every append (and is therefore verified before the
  first export of a session). This satisfies FR18/AC12 today.

## Deferred (explicit follow-up — NOT silently dropped)

Tracked as a follow-up issue; these do **not** block export:

- **Full chain-verification-on-open / on-unlock** as a standalone subsystem step
  (currently verification runs at append time, which covers the export path).
- **`escrow.json` cross-device trust** and multi-device signing-key distribution.
- **Audit viewer UX** (reading/printing the audit log in-app).

Migration path: the lazily-generated device signing key is bound to the existing
`deviceId`; when `escrow.json` lands, existing public-key fingerprints already
recorded in genesis/entry metadata become the trust anchors.

## Alternatives considered

- **Stub the audit (log to diagnostics only).** Rejected — violates FR18/AC12 and
  the §8 "audit-first" security guarantee; would have to be torn out later.
- **Build the entire §8 subsystem now** (escrow, viewer, on-open verify).
  Rejected — large scope unrelated to export; would delay an urgent feature with
  no immediate consumer for the extra surface.
