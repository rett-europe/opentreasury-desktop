# SPEC-028 Audit & Evidence — "Anchor, Don't Re-Sign" (Decision)

**Date:** 2026-06-01
**Decision maker:** Neo (architecture), with Switch (security)
**Status:** Accepted — drives the SPEC-028 implementation (issues #357–#362)
**Spec:** [`docs/specs/028-audit-and-evidence.md`](../../docs/specs/028-audit-and-evidence.md) ·
[`docs/security/crypto-spec.md`](../../docs/security/crypto-spec.md) §8 ·
follows up [`neo-027-export-audit-foundation.md`](./neo-027-export-audit-foundation.md)

---

## Context

Issue #351 reframed into a tiered **Audit & Evidence** effort (Tiers 0–2; Tier 3 deferred).
The goal is *evidence*: prove to a third party who changed/exported what, and when.

The app is already event-sourced — every mutation emits a `DomainEvent` persisted append-only in
the AEAD-encrypted multi-device event log (SPEC-026). That log is tamper-**resistant** to outsiders
but **not** signed or hash-chained, so it is **not** tamper-**evident** against the key-holder. The
SPEC-027 `FileAuditLog` *is* signed + hash-chained + verify-before-append, but only wraps exports.

## Decision

**Do not sign every event (Tier 3).** Instead, periodically fold a **signed per-device frontier
snapshot** of the event log into the existing signed audit chain as an `audit.anchor` entry. One
signed, chained anchor makes the whole *observed* event history tamper-evident. A separate external
timestamp (Tier 2) constrains backdating.

Why a *frontier*, not a single rolling head: the merged event timeline (per-device
`events-<deviceId>.ndjson` files merged by ULID sort at `load()`) is **not** append-only — a late
peer event inserts mid-stream. Each device's own file *is* append-only, so the anchor records a
per-device vector `{device_id, file_name, line_count, last_event_id, device_head_hash}` plus a
global `event_log_root`. Verification recomputes each device prefix truncated to the anchored
`line_count`/`last_event_id` and compares. Per-device heads are incrementally maintainable; the
merged timeline is not.

## Resolved open questions

### OQ3 — Tier-0 coverage strategy (WI-1): **append-time enrichment choke-point**
Enrich at the **event-log append boundary**, not by editing each flat event schema. Actor identity
(`actorUserId` / `actorDeviceId` / `actorIdentitySource`), `datasetId`, and `createdAt` are known at
command dispatch and already stamped onto enveloped events; route **all** events through a single
enrichment wrapper at append so flat WI-15-lite config CRUD, `tx.note.*`, `tx.split*`, and import
events carry the same attribution. Rationale: one choke-point, minimal schema churn, additive and
back-compatible. Constraint: enrichment is **additive** — existing readers/projections that ignore
the new fields must keep working; do not change the meaning of existing fields. The full-union
coverage test asserts every `DomainEvent` variant emerges from append with actor/device/dataset/time.

### OQ2 — anchor triggers (WI-2): **on-unlock + on-lock + every N local appends or T elapsed**
Anchor (a) on workspace **unlock** (baseline, after verify), (b) on **lock** (capture final state),
and (c) opportunistically every **N = 1000 local appends** or **T = 15 min** of write activity,
whichever comes first — counting **local** appends only (peer-synced events anchor on the next
local trigger). All best-effort: anchoring MUST NEVER block a data write. Values are tunable
constants, not contract; revisit with telemetry.

> OQ4 (TSA provider) is **not** resolved here — it only gates Tier 2 / WI-5 and will be decided in
> that session.
>
> **OQ4 update (2026-06-01, WI-5 / #362 — resolved autonomously for implementation, FLAG for Switch
> confirmation):**
> - **OQ4a (RFC-3161 codec):** chose a **minimal in-tree DER/CMS codec** (zero new runtime deps),
>   confined to `core/audit/timestamp/rfc3161.ts`, over adding `pkijs`/`asn1js`. Rationale: the
>   codebase deliberately avoids heavy crypto libs, OQ4 was reserved for Switch (so unilaterally
>   adding a large runtime dep is the wrong default), and all *cryptographic* operations still use
>   Node's built-in `crypto` (X.509 chain/validity + `crypto.verify` over `signedAttrs`) — only the
>   mechanical DER parse + the signedAttrs SET-OF re-tag are hand-written, both covered by an
>   exhaustive negative-fixture matrix. The module boundary lets Switch swap in a vetted parser later
>   with no ripple.
> - **OQ4b (provider):** default **freeTSA.org** RFC-3161 (permits general-purpose timestamping,
>   free, publishes a bundleable CA root) behind a `TimestampProvider` abstraction so a commercial TSA
>   or transparency-log provider can drop in later. Transparency-log alternative **deferred for v1**.
>   **Confirm:** freeTSA vs commercial TSA (availability/ToS) and permission to bundle the TSA root.
> - **Deviation flagged:** the pending-timestamp retry queue is implemented as **in-memory advisory
>   state recomputed from the chain**, not an MK-encrypted on-disk blob (spec §6.2 allowed either; a
>   lost queue is harmless because pending is derived from the chain). Revisit if persistence across
>   restarts before the next unlock-drain is desired.
> - **Notable bug caught in WI-5:** the RFC-3161 verifier originally mutated its input token in place
>   (`Buffer.slice` aliases memory during the signedAttrs SET-OF re-tag), which would have corrupted
>   every persisted receipt's stored token. Fixed to copy via `Uint8Array.from`; regression test added.

## Consequences

- The whole observed event history becomes tamper-evident from **one** signed anchor per snapshot —
  no per-event signature cost (performance scales via incremental per-device head hashing, not full
  re-reads).
- The audit data model must be extended (FR4a): `AuditTargetRef` gains `anchor`; `AuditEntry` carries
  a signed canonical anchor/receipt payload; `append()` stops hard-coding `target_ref.type='export'`.
- Anchored event files **MUST NOT be rewritten in place** (the `device_head_hash` is over raw on-disk
  NDJSON lines); migrations re-anchor rather than mutate.
- Honest limitation stands: **tamper-evident + externally timestamped, NOT tamper-proof.** A
  key-holder can still fabricate a fresh consistent history; only the external timestamp constrains
  backdating. Legal review required before any "audit-grade"/"compliance" claim.

## Alternatives considered

- **Per-event Ed25519 signing now (Tier 3).** Rejected for v1 — large surface, needs `escrow.json`
  multi-device trust, and is unnecessary for the evidence goal the anchor already meets. Deferred
  (#359), migration path kept open via recorded device key fingerprints.
- **Single rolling Merkle head over the merged timeline.** Rejected — the merged timeline is not
  append-only, so a single head cannot be incrementally maintained and mid-stream peer inserts would
  spuriously break it. The per-device frontier solves both.
- **Edit each event schema to add actor fields (OQ3 alt).** Rejected — schema churn across many
  variants and back-compat risk vs. one append-time choke-point.
