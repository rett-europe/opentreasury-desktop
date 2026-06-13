# SPEC-028 — Audit & Evidence

> **Status:** Draft · **Owner:** Niobe (spec/UX structure) · **Last updated:** 2026-06-01
> **Architecture lead:** Neo · **Security lead:** Switch · **Product:** Link / Pedro · **Docs:** Oracle
> **Paired PRD:** Pending — PRD-028 reservation needed in `docs/product/prd-plan.md`
> **Paired UX:** [`docs/ux/specs/spec-028-audit-evidence-viewer.md`](../ux/specs/spec-028-audit-evidence-viewer.md)
> **Paired Design:** Pending (Mouse — viewer/print visual polish)
> **Supersedes the deferred-work checklist in:** issue #351 (this spec reframes it)
> **Required reading:** [`crypto-spec.md`](../security/crypto-spec.md) §8 ·
> [`.squad/decisions/neo-027-export-audit-foundation.md`](../../.squad/decisions/neo-027-export-audit-foundation.md)

---

## 1. Summary

OpenTreasury already records *who changed what, and when* for the data that matters — every
transaction mutation is an append-only `DomainEvent` carrying actor, device and timestamp, and
SPEC-027 added a signed, hash-chained, fail-closed audit log for exports. **Audit & Evidence**
turns that latent material into something an NGO treasurer can *hand to a third party* — an
auditor, a bank, a regulator — to demonstrate the integrity and provenance of their treasury
history.

It does so without the cost of signing every event. The design principle is **"anchor, don't
re-sign":** periodically fold a signed snapshot of the event log's per-device state into the
existing signed audit chain (an `audit.anchor` entry). One signed anchor makes the whole observed
event history **tamper-evident**; binding the anchor to an external trusted timestamp (RFC-3161)
constrains **backdating**. The feature ships in evidence tiers (0–2; Tier 3 explicitly deferred)
and adds a read-only **Audit & Evidence viewer** with an evidence-export bundle the treasurer can
produce on demand — because evidence you cannot produce when asked is worthless.

This spec is honest about its ceiling: in a self-custodied desktop app where the user holds every
key, the strongest truthful claim is **"tamper-evident + externally timestamped," not
"tamper-proof."** See §8.

## 2. Problem

María (the NGO treasurer persona, [`docs/product/vision.md`](../product/vision.md) §2) is
periodically asked to *prove* something about the treasury to someone outside the organisation:

- The annual external **auditor** asks "show me every change to the 2025 accounts, who made it,
  and confirm nothing was edited after the fact."
- A **bank** or **grant body** asks for an evidence pack tied to a specific reporting period.
- The board, after a volunteer leaves, asks "can we be sure the history wasn't quietly rewritten?"

Today the raw material exists but is **not presentable and not provably intact**:

1. **No way to read it.** The audit log and the event-derived change history have no in-app
   viewer; the audit log can only be inspected by tests.
2. **No way to export it as evidence.** There is no bundle a regulator can receive and verify
   offline.
3. **Not tamper-evident against the key-holder.** The event log is AEAD-encrypted (SPEC-026) so
   an *outsider* without the master key cannot read or forge it — but it is **not** hash-chained
   or signed across events, so the *key-holder/operator* could decrypt, rewrite, and re-encrypt
   the entire log with no chain to break. Only the SPEC-027 export entries are signed+chained,
   and only for exports.
4. **Partial attribution.** Only transaction create/update/delete events carry actor/device
   fields today; config, note, split and import events are "flat" (deferred to M2) and record
   *what/when* but not *who* (see §6.1).
5. **No external time anchor.** Even a signed local chain can be rebuilt wholesale and
   *backdated* by the key-holder; nothing currently ties it to time the user cannot fake.

Issue #351 framed this as "finish crypto-spec §8" (chain-verify-on-open, `escrow.json`
multi-device trust, an audit viewer, a broader action enum). After discussion with Pedro we
reframed it around the actual **purpose — compliance/evidence** — and scoped it to Tiers 0–2,
deferring the most expensive cryptographic machinery (Tier 3) because the anchor approach reaches
the evidence goal without it.

## 3. Users & Scenarios

**Primary persona:** **María**, NGO treasurer — time-poor, not tech-savvy, occasionally has to
satisfy an external party. (Vision §2.)

**Secondary persona:** the **external auditor / regulator / bank officer** who *receives* the
evidence bundle and may verify it offline. They never open OpenTreasury; their needs constrain the
bundle format and the honesty of the claims it makes.

- **Scenario A — Annual audit evidence pack.** María opens *Auditoría* / *Audit*, filters to
  `2025-01-01 → 2025-12-31`, and exports an **evidence bundle**: the signed audit entries (incl.
  anchors), the event-derived change history for the period, the device public-key manifest, and
  a verification report stating which anchors were externally timestamped. She hands it to the
  auditor on a USB drive.
- **Scenario B — Integrity check after offboarding.** A volunteer's device was removed. On her
  next unlock, the app runs **chain-verify-on-unlock**; the audit chain and the latest anchor
  recompute cleanly, and the viewer shows a green "Verified — anchored through {date}, externally
  timestamped" banner per device. María is reassured.
- **Scenario C — Tamper detected.** Someone edited an old event file outside the app. On unlock,
  verification fails (the recomputed device-head hash no longer matches the last anchor). The app
  **fails closed**: it surfaces a workspace-level integrity error and routes María to snapshot
  recovery (R19) rather than opening normally.
- **Scenario D — Reviewing a single change.** While preparing a board answer, María opens the
  viewer, filters the change history to one account, and sees each mutation with actor/device/
  timestamp and a provenance label distinguishing *signed audit entries* from *event-derived
  history*.
- **Scenario E — Offline timestamping.** An anchor is created while María is offline. The external
  timestamp request is **queued**; the anchor is still written and signed locally, and the viewer
  marks it "pending external timestamp." When network returns, the timestamp is attached and the
  status flips to "externally timestamped." Her data writes were never blocked.

## 4. Requirements

### 4.1 Functional

#### Tier 0 — Coverage ledger (normalization)

- **FR1 — Mutation event inventory.** The implementation MUST enumerate every mutation IPC handler
  and every `DomainEvent` variant in `app/src/core/events/schemas.ts`, classifying each as
  *attributed* (carries `actorUserId`, `actorDeviceId`, `actorIdentitySource`, `datasetId`) or
  *flat* (today: all config `*Created/*Updated/*Archived/*Unarchived/*Deleted`, `tx.note.*`,
  `tx.split` / `tx.split.removed`, `movement.imported`, `import.mapping.updated`).
- **FR2 — Actor coverage for all mutations.** Every mutation event MUST carry actor attribution.
  This MAY be achieved by (a) extending the flat event schemas additively (optional-on-the-wire
  for backward compatibility, mirroring the WI-19/WI-23 precedent), or (b) an **append-time
  enrichment** layer that stamps actor/device/dataset on events lacking them as they are written.
  Backward compatibility: pre-existing on-disk events without actor fields MUST remain replayable;
  the coverage ledger marks their actor as `unknown (pre-coverage)` rather than refusing them.
- **FR3 — Coverage test.** A test MUST assert that, for the **entire `DomainEvent` union**, any
  variant classified as a mutation carries the actor-attribution fields (or is routed through the
  enrichment layer). New mutation events added later fail this test until attributed.

#### Tier 1 — Local tamper-evidence

- **FR4 — Event-log anchoring.** The app MUST be able to compute a **frontier snapshot** of the
  event log and append it to the existing `FileAuditLog` as a new signed, hash-chained entry with
  `action: "audit.anchor"`. The frontier snapshot records, per device event file:
  `{ device_id, file_name, line_count, last_event_id, device_head_hash }`, plus a global
  `event_log_root` (a hash/Merkle root over the sorted per-device frontier vector). The anchor is
  a normal `FileAuditLog` entry — it inherits seq monotonicity, `prev_entry_hash`, Ed25519
  signature, MK-encryption and verify-before-append (fail-closed).
  **`device_head_hash` is computed over the device file's raw on-disk NDJSON lines** (the encrypted
  envelope bytes as written), so it detects byte-level tampering without decrypting during verify.
  Consequence (migration rule, normative): **an event file that has been anchored MUST NOT be
  rewritten in place** — any future re-encryption / serialization / line-layout migration MUST
  preserve the anchored raw bytes or append a new device file and re-anchor; otherwise historical
  anchors would fail verification even though decrypted content is unchanged. (See Open Question 7.)
- **FR4a — Audit-entry schema extension (required, not just an enum addition).** Anchoring is NOT
  satisfied by adding a string to the action enum alone. The implementation MUST extend the audit
  data model so a signed entry can *carry* the anchor body: extend `AuditAction` with
  `audit.anchor` (and `audit.export`); extend `AuditTargetRef.type` with `anchor` (today only
  `export`); add a typed, canonical, **signed** `payload`/`details` field to `AuditEntry`
  (or introduce an `AuditAnchorEntry` union variant) so the per-device frontier vector is inside
  the signed canonical JSON. `append()` MUST stop hard-coding `target_ref: { type: 'export' }`.
  The signature MUST cover the anchor payload.
- **FR5 — Frontier correctness over per-device files.** Because `EncryptedMultiDeviceEventLog`
  stores one append-only file per device and merges them by ULID sort at `load()`, the merged
  timeline is **not** itself append-only (a late-syncing peer event inserts mid-stream). The
  anchor therefore attests **per-device append heads**, NOT a single rolling head over the merged
  timeline. Verification recomputes each device file's prefix **up to the anchored
  `line_count`/`last_event_id`**, never against "all events currently visible."
- **FR6 — Anchor triggers.** The app MUST create an anchor: (a) on workspace **unlock** (after a
  successful chain-verify, FR8), (b) on workspace **lock**/graceful shutdown (best-effort), and
  (c) every **N local appends** or a configured time interval, whichever comes first (N and the
  interval are configuration constants, defaulted by Neo/Switch). The N-events trigger counts
  **local** appends only; remote-sync-driven anchoring is out of scope for v1 (FR-defer).
- **FR7 — Stable-snapshot anchoring.** Anchor computation MUST operate over a stable read pass: if
  any device event file changes during hashing, the attempt is retried or marked **stale** and
  re-run; a stale anchor is never signed. Anchoring MUST NOT block data writes — it runs out of
  the write path.
- **FR8 — Chain-verify-on-unlock (standalone lifecycle step).** On workspace unlock/open, the app
  MUST verify (i) the full `FileAuditLog` chain (seq monotonicity, `prev_entry_hash`, key
  fingerprint, Ed25519 signatures — the existing `verifyChain`) **and** (ii) the latest
  `audit.anchor` against **freshly recomputed per-device prefixes truncated to the anchored
  `line_count`/`last_event_id`** (NOT against the device files' current full heads). This is a
  **standalone** step independent of the append path (today verification runs only inside
  `append`). The per-device verification outcomes are normative:
  - anchored file **missing** → integrity failure (tamper/deletion);
  - file **shorter** than anchored `line_count`, or anchored `last_event_id` **absent** at the
    anchored line → integrity failure (truncation/rewrite);
  - recomputed `device_head_hash` over the anchored prefix **≠** anchored value → integrity failure;
  - **extra** lines after the anchored prefix → NOT a failure; classified as "not yet anchored"
    (FR9).
  Any integrity failure MUST **fail closed**: surface a workspace-level integrity error and route
  to recovery (R19); the workspace MUST NOT open normally on a verification failure.
- **FR9 — Anchor-scope honesty in verification.** Verification distinguishes *anchored* from
  *unanchored* state: events appended **after** the latest anchor (including peer events that
  synced in after the last local anchor) are reported as **"not yet anchored"**, not as tamper.
  The next anchor extends coverage to those device frontiers.
- **FR10 — Audit & Evidence viewer (read-only).** The app MUST provide a read-only screen
  (sidebar entry `Auditoría` / `Audit`) that displays, with filtering by date range and by
  actor/device/account: (i) the signed audit entries (exports, anchors, and any future audited
  actions) and (ii) the **event-derived change history**. The two streams MUST be **provenance-
  labelled** and kept visually distinct — signed audit entries are "audit-grade"; event-derived
  rows are "recorded history" whose attribution may be `unknown (pre-coverage)` for old flat
  events. The viewer is **print-friendly** (FR is satisfied by a print stylesheet / print view).
- **FR11 — Evidence export bundle.** From the viewer the user MUST be able to export an **evidence
  bundle** for the current filter set, containing: the relevant signed audit entries (pretty-
  printed JSON lines, per crypto-spec §8.3), the event-derived change history for the period, a
  **audit signing-key public-key manifest** (for offline signature verification), any external
  timestamp receipts (Tier 2), and a **verification report** summarising chain status and, per
  anchor, whether it was externally timestamped. The bundle is decrypted output (like an export)
  and reuses the SPEC-027 export pipeline patterns (save dialog in main, encrypted-workspace
  guard, atomic temp→rename, audit-entry-first, rate limiting). Producing the bundle is itself an
  audited action (`action: "audit.export"`). **Self-inclusion semantics (normative):** the bundle
  MAY include the `audit.export` *attempt/started* entry for its own run (written before file I/O,
  audit-entry-first), but it CANNOT include its own completion entry (that entry does not exist
  until after the bytes are written); offline verification MUST NOT depend on a completion entry
  being present in the same bundle. **Trust caveat (must be stated in the report):** the included
  public-key manifest lets a verifier check the bundle's *internal cryptographic consistency*; it
  is **self-asserted** unless corroborated by an external timestamp (Tier 2) or a future
  escrow/device-identity binding (Tier 3) — see §8.
- **FR12 — Renderer isolation for the viewer.** All decryption, file reads, signature verification
  and hashing stay in the **main** process. The renderer receives only **validated view-models**
  over IPC (Zod contracts); it MUST never receive plaintext file paths, key material, raw event
  ciphertext, or signing keys. (R11, R12, C-isolation.)

#### Tier 2 — External non-repudiation (anti-backdating)

- **FR13 — Trusted timestamping as a separate signed receipt (NOT a mutation).** The app MUST be
  able to bind an `audit.anchor`'s `event_log_root` to an external trusted timestamp via a
  **provider abstraction** (v1 target: RFC-3161 TSA; the abstraction also admits a transparency-
  log / public-anchor provider). Because audit entries are append-only and signed, the timestamp
  token MUST NOT be written back into the original anchor entry. Instead the receipt is recorded
  as a **separate signed, hash-chained `audit.anchor.timestamped` entry** that references the
  anchor it timestamps by `{ anchor_seq, anchor_entry_hash, event_log_root }` and carries the TSA
  token (or a reference to it). Verification joins the anchor to its receipt entry; the original
  anchor's signature/chain stays intact.
- **FR14 — Offline tolerance.** If the timestamp provider is unreachable, the anchor is still
  written and signed locally and the timestamp request is **queued**; the anchor is treated as
  "pending external timestamp" (derived from the *absence* of a matching `audit.anchor.timestamped`
  entry, not from a mutable flag on the anchor). When connectivity returns, the queued request is
  fulfilled and a new `audit.anchor.timestamped` entry is appended. Timestamping MUST NEVER block
  the user's data writes or block workspace unlock.
- **FR15 — Provider failure modes.** TSA errors (timeout, malformed token, untrusted TSA cert,
  rate-limit) MUST be handled without data loss and surfaced as a non-blocking status on the
  affected anchor(s). A failed timestamp leaves the anchor in "pending" with a recorded
  last-error (in the advisory queue, §6.2), retryable on the next online trigger. A malformed TSA
  response MUST be rejected by strict validation (R17) and never produce a signed receipt entry.

#### Tier 3 — Deferred (documented out of scope)

- **FR16 (DEFERRED) — Per-event Ed25519 signing.** Signing every `DomainEvent` individually is
  **out of scope**. The frontier-anchor approach provides tamper-evidence over the whole event
  history at a fraction of the cost. (Migration path preserved — see §8.)
- **FR17 (DEFERRED) — `escrow.json` multi-device signing-key trust.** Cross-device distribution and
  reconciliation of per-device Ed25519 signing-key fingerprints (crypto-spec §8 rule 3) is **out
  of scope**. Migration path: device signing keys are already bound to `deviceId` and public-key
  fingerprints are already recorded in audit entries, so they become trust anchors when
  `escrow.json` lands.

### 4.2 Non-functional

- **NFR1 — Anchoring performance at scale.** Anchoring MUST scale to **100 000+ events**. Per-
  device head hashes MUST be maintained **incrementally** as events append (each device file is
  append-only, so its head hash extends without re-reading the whole file). Any cached index/
  checkpoint is **advisory** and MUST be fully recomputable from the on-disk files. A full
  recompute (cold verify) of a 100 000-event dataset MUST complete within a budget set by the perf
  harness (target: a few seconds on the baseline laptop) and MUST NOT load all plaintext into
  memory at once (stream/iterate, mirroring SPEC-027 §FR17).
- **NFR2 — Unlock latency.** Chain-verify-on-unlock (FR8) using maintained/cached heads MUST add
  no more than a small bounded delay to unlock on the baseline dataset; a cold/forced full
  recompute MAY take longer and MUST show progress.
- **NFR3 — Offline behaviour.** All Tier 0/1 functionality works fully offline. Tier 2 degrades
  gracefully offline (queue + pending status), per FR14. (Vision §7 Principle 5.)
- **NFR4 — Accessibility.** Viewer and evidence-export flow meet WCAG 2.1 AA: keyboard-reachable
  filters and controls, `aria-live` status for verification/timestamp state, print view legible.
  See paired UX spec.
- **NFR5 — Privacy of process logs.** No PII or raw label/transaction values in logs; sensitive
  refs are **hashed** as the SPEC-027 export audit already does. Counts/bytes/hashes only. (R15.)

## 5. UX Notes

Full flows live in the paired UX spec. Architecture-constraining points:

- **Two provenance lanes, never merged into one "audit-grade" stream.** The viewer must always let
  a reader tell a *signed audit entry* apart from an *event-derived history row*, and must show
  `unknown (pre-coverage)` honestly for old flat events. Overstating attribution would be a
  compliance liability.
- **"Anchored through" is per device, not global.** The integrity badge reflects each device
  file's anchored frontier; there is no single "everything is anchored" claim unless all known
  device files are covered to their current heads.
- **External-timestamp status is first-class.** Anchors show one of: *externally timestamped*,
  *pending (offline/queued)*, *failed (retryable)*. This is the difference between "tidy local
  log" and "defensible evidence" and must be visible.
- **Evidence export reuses the Export screen's safety choreography** (typed confirmation,
  encrypted-workspace guard, save dialog in main, atomic write). No new decryption surface in the
  renderer.

## 6. Data Model

### 6.1 Domain events & attribution coverage

This spec does **not** add new *transaction-domain* events. It (a) **normalizes attribution** on
existing mutation events (FR2) and (b) adds **audit-log** entries consumed by the existing audit
subsystem.

Current attribution status (verified against `app/src/core/events/schemas.ts`):

| Event group | Examples | Actor attribution today |
|---|---|---|
| Transaction core (enveloped) | `tx.created`, `tx.updated` | ✅ actor/device/dataset present |
| Transaction delete (flat-but-attributed) | `tx.deleted` | ✅ actor/device/dataset present |
| Config **create** (enveloped) | `account.created`, `category.created`, `tag.created` | ✅ enveloped — actor/device/dataset present |
| Config CRUD (flat, WI-15-lite, PascalCase) | `AccountUpdated`, `AccountArchived`, `CategoryUpdated`, `TagDeleted`, … | ❌ flat — no actor/device (`createdAt`+ids only) |
| Transaction notes | `tx.note.added/edited/deleted` | ❌ flat |
| Transaction splits | `tx.split`, `tx.split.removed` | ❌ flat |
| Import | `movement.imported`, `import.mapping.updated` | ❌ flat |

Note the **two representations** that coexist on the same NDJSON log: the enveloped lowercase
`*.created` events (which extend `eventEnvelopeSchema` and therefore carry actor/device/dataset)
and the flat PascalCase WI-15-lite config events (which deliberately keep a minimal wire shape —
"no datasetId/actorDeviceId/dekVersion — deferred to M2"). The coverage ledger (FR1–FR3) must
classify by *actual schema*, not by entity, and must not assume all account/category/tag events
are attributed. FR1–FR3 close the remaining gaps (enrich or wrap at append).

New audit action consumed by the audit subsystem:

| Audit action | Fields (in addition to the §8.2 envelope) | Produced by | Consumed by |
|---|---|---|---|
| `audit.anchor` | `target_ref: { type: "anchor", id: <ULID> }`, `after_hash = event_log_root`, signed anchor payload (below) | Main-process anchoring service | `FileAuditLog`; chain-verify-on-unlock; viewer; Tier-2 timestamper |
| `audit.anchor.timestamped` | `target_ref: { type: "anchor", id: <anchored ULID> }`, references `{ anchor_seq, anchor_entry_hash, event_log_root }`, carries TSA token/ref | Tier-2 timestamper (separate, later entry) | `FileAuditLog`; viewer; verification report |
| `audit.export` | `target_ref: { type: "export", id: <ULID> }`, `after_hash = BLAKE2b256(canonical filter set)` | Evidence-bundle exporter | `FileAuditLog`; viewer |

`audit.export` reuses the SPEC-027 export-audit shape; the evidence bundle is an export. The
external timestamp is a **separate** `audit.anchor.timestamped` entry (FR13) — never a mutation of
the original anchor. The `audit.anchor` payload (the signed body — sensitive refs hashed, never raw
values):

```jsonc
{
  "anchor_version": 1,
  "hash_alg": "blake2b-256",
  "dataset_id": "<ULID>",
  "observed_at": "YYYY-MM-DDTHH:mm:ss.sssZ",   // local clock; NOT trusted on its own
  "event_log_root": "<hex>",                    // root over the device_frontiers vector
  "device_frontiers": [
    {
      "device_id": "<ULID>",
      "file_name": "events-<deviceId>.ndjson",
      "line_count": 12873,
      "last_event_id": "<ULID>",
      "device_head_hash": "<hex>"               // over the file's raw on-disk NDJSON lines (FR4)
    }
  ],
  "audit_chain_prev_hash": "<hex>"              // links to the prior audit entry (chain)
}
```

External-timestamp status is **derived** at read time from whether a matching
`audit.anchor.timestamped` entry exists — it is not a mutable field on the anchor.

### 6.2 Read-model projections

No new **persisted transaction** projections. The viewer's change history is derived from the
event log (already loaded/decrypted in main). A small, MK-encrypted **anchor/timestamp state**
record (last anchor seq, per-device head cache, pending-timestamp queue) MAY be persisted under
the audit folder as an **advisory cache** — it MUST be fully recomputable from the audit chain +
event files (NFR1) and is never the source of truth.

### 6.3 File layout on the dataset root

Anchors are **audit entries** — they live inside the existing audit store
(`{dataset-root}/.treasury/audit/…`, crypto-spec §8.1), not in a new file category. The advisory
anchor cache and the pending-timestamp queue live alongside the audit chunks, MK-encrypted, with
opaque names (ADR-001 C11 / R3). Evidence bundles are written **outside** the dataset root to a
user-chosen path (like SPEC-027 exports) and are never re-read by the app.

## 7. IPC Surface

All channels Zod-validated at the boundary (R12, C13). Schemas live under
`app/src/shared/ipc-contracts/audit.ts`.

| Channel | Direction | Payload schema | Response schema |
|---|---|---|---|
| `audit:verify` | renderer → main | `AuditVerifyRequest` (none / forceFullRecompute) | `AuditVerifyResponse` (status per device, anchored-through, errors) |
| `audit:list` | renderer → main | `AuditListRequest` (filters: dateRange, deviceId, accountId, stream) | `AuditListResponse` (validated view-models; provenance-labelled) |
| `audit:exportBundle` | renderer → main | `AuditExportBundleRequest` (filter set + format) | `AuditExportBundleResponse` (outcome, basename) |
| `audit:anchorStatus` | renderer → main | `AuditAnchorStatusRequest` | `AuditAnchorStatusResponse` (per-anchor timestamp state) |

The renderer never receives plaintext paths, ciphertext, or keys — only the validated view-models
(R11, R12). Anchoring itself is triggered by main-process lifecycle (unlock/lock/interval), not by
a renderer-invokable channel, so the renderer cannot force-write history.

## 8. Security Considerations

This spec is squarely in Switch-owned territory. Explicit mapping:

- **Reuse of the signed audit chain (R8, C3, §8).** Anchors are ordinary `FileAuditLog` entries:
  seq-monotonic, `prev_entry_hash`-chained (BLAKE2b-256), Ed25519-signed by the lazily-generated
  MK-sealed device signing key, MK-encrypted, with **verify-before-append (fail-closed)**. No new
  signing primitive is introduced.
- **AEAD envelope (C1/C2, §2.1).** The advisory anchor cache and pending-timestamp queue use the
  standard envelope with AAD binding `record_type`/`dataset_id`. Anchors inherit the audit chunk's
  envelope.
- **Action enum + entry-shape extension (§8.2, R8).** Add `audit.anchor`, `audit.anchor.timestamped`
  and `audit.export` to the crypto-spec §8.2 `action` enum and to `AuditAction` in
  `app/src/core/audit/types.ts`. **This is more than an enum change:** today `AuditEntry` has no
  payload field, `AuditTargetRef.type` is only `'export'`, and `append()` hard-codes
  `target_ref: { type: 'export', … }`. The audit data model MUST be extended (FR4a) so the signed
  canonical entry carries the anchor frontier vector / timestamp receipt. **Open question OQ1:**
  whether each tx/config/note/split mutation also needs its own per-action audit entry.
  **Recommendation:** NO — those are covered by the Tier-0 coverage ledger and made tamper-evident
  *in bulk* by anchoring; per-mutation audit entries would duplicate the event log and bloat the
  chain. The audit chain records *exports, anchors, timestamp receipts, and lifecycle events*, not
  every data edit.
- **Audit signing-key reality (important — do not overstate).** The current `FileAuditLog` does
  **not** verify entry signatures against `escrow.json` device public keys; it lazily generates or
  loads a single MK-sealed `signing-key.v1` from the audit store and verifies all entries against
  that loaded key/fingerprint. So v1 signatures prove **"continuity of the same audit signing
  key,"** NOT independent per-device cryptographic identity. The evidence bundle's public-key
  manifest is therefore **self-asserted** (FR11) until corroborated by an external timestamp
  (Tier 2) or escrow/device-identity binding (Tier 3). The spec MUST NOT claim per-device
  attribution beyond what the event-log actor fields (Tier 0) provide.
- **Divergence from crypto-spec §8 (acknowledged).** crypto-spec §8 specifies a genesis
  `prev_entry_hash = BLAKE2b("OTRV-AUDIT-GENESIS:" + dataset_id)` and signature verification
  against `escrow.json` device public keys; the implemented SPEC-027 `FileAuditLog` uses a `null`
  genesis and verifies against its own loaded signing key. SPEC-028 **builds on the implemented
  thin audit log as-is** for Tiers 0–2; closing these gaps to the full crypto-spec §8 model
  (genesis constant, escrow-based verification) is tracked with Tier 3 and is **not** a
  precondition for this spec. This deviation is called out so the spec does not claim to "satisfy
  crypto-spec §8" more strongly than the code supports.
- **Chain-verify-on-unlock & fail-closed (R8 rule 4, R19, AR7).** Verification at unlock satisfies
  crypto-spec §8.2 rule 4 ("on dataset open the app MUST verify the full chain"). A chain break or
  anchor mismatch refuses to open and routes to snapshot recovery (R19). Note **AR7**: an insider
  who *deletes* the audit folder wholesale is detectable (missing directory) but the evidence is
  gone — detection + snapshots are the defense; this is a permanent property of the file-based
  model.
- **Renderer isolation (R11, R12, C11).** No `app/src/main/**` or `app/src/crypto/**` imports leak
  into the renderer. Decryption, hashing, signature verification and TSA I/O are main-only. The
  renderer consumes Zod-validated view-models; IPC channels are allowlisted and schema-checked.
- **PII in logs (R15, T12).** Never log raw label/transaction/note values. Sensitive refs are
  hashed (BLAKE2b-256) as the SPEC-027 export audit already does. The evidence bundle contains
  decrypted data by design (it is the deliverable) and is governed by the same "treat like cash"
  confirmation and encrypted-workspace guard as exports.
- **Input validation (R12, R17).** All IPC inputs and any TSA responses are Zod/strict-parsed
  before use; a malformed TSA token is rejected and the anchor stays "pending."
- **Shared-folder path safety (R18).** Evidence bundles use the SPEC-027 encrypted-workspace guard
  (refuse to write inside the dataset root) and the main-process save dialog.

### 8.1 Threat model & honest limitation (MUST NOT be hidden)

OpenTreasury is a **local, self-custodied** app: the user holds the **master key** *and* the
**audit signing key** (the latter is MK-sealed in the audit store — it is **not** a hardware/
non-extractable key). Therefore:

| Adversary | Tier 0/1 (local) | + Tier 2 (external timestamp) |
|---|---|---|
| Outsider without the master key | Cannot read or forge (AEAD) | Same |
| Storage corruption / sync bug (T5) | Detected (AEAD + chain + anchor recompute) | Same |
| Insider, partial after-the-fact edit **to an already-anchored prefix** (T3/T13) | **Detected** — recomputed device head ≠ anchored head; chain break | Detected |
| Insider, edit/reorder/delete in the **unanchored tail** (before the next anchor) | **NOT detectable as tamper** — it is simply outside the anchored evidence boundary; reported as "not yet anchored," not as proof | Same (only state captured *before* a timestamped anchor is constrained) |
| Insider, **wholesale rewrite** of event log + audit chain + re-seal signing key | **NOT prevented** — a fresh, internally consistent history can be fabricated | **Backdating constrained** — the external timestamp proves an anchored root existed *no later than* a time the user cannot fake |
| Insider **deletes** the whole audit folder (AR7) | **Detected** (missing chain) but evidence is gone — snapshots (R19) are the recovery | Same |

**The strongest HONEST claim is "tamper-evident + externally timestamped," NOT "tamper-proof."**
Tier 1 alone does **not** provide non-repudiation against a determined key-holder. Only Tier 2's
external anchor constrains backdating (and only for state captured *before* the timestamped
anchor). True regulator-bulletproof non-repudiation generally requires keys the user cannot extract
(HSM / server-side) or server-side anchoring — **out of scope** for a desktop app.

**Product/marketing guardrail (Link/Switch):** the spec recommends that real-world regulatory
acceptability depends on the specific regime, and that **legal review is required before any
"audit-grade" or "compliance" claim** is made to end users or in marketing. The in-app copy and
the evidence bundle's verification report MUST state the limitation plainly.

### 8.2 Tier 3 migration path (kept open)

Per-event signing and `escrow.json` trust are deferred but not foreclosed. Note honestly: the
**implemented** audit log does **not** yet verify against per-device escrow keys (see §8) — so
"already bound" applies to the *event-log* envelope (`actorDeviceId` on enveloped events) and to
the device public-key fingerprints recorded in audit entries, **not** to escrow-based audit
signature verification, which is itself Tier-3 work. When `escrow.json` trust lands, those
fingerprints become the cross-device trust anchors. Anchors and per-event signing can coexist
later (anchor = cheap bulk evidence; per-event signatures = per-writer attribution).

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- **Coverage ledger:** a test over the **full `DomainEvent` union** asserting every mutation
  variant is attributed (or enriched at append). Adding a new flat mutation event fails it.
- **Incremental head:** appending events to a device file extends its head hash to the same value
  a full recompute produces (incremental ≡ batch).
- **Frontier root:** `event_log_root` is order-independent of which device file is read first and
  changes iff any anchored device frontier changes.
- **Anchor verify:** recompute matches a freshly-signed anchor; a one-byte edit to an anchored
  event file makes recompute ≠ anchored head (detected); a tampered anchor entry fails the audit
  chain signature/`prev_hash` check.
- **Late peer event:** an event with an older ULID arriving *after* an anchor is reported
  "not yet anchored" (FR9), **not** as tamper.
- **TSA provider:** RFC-3161 token parse/verify happy path; malformed/expired/untrusted token →
  anchor stays "pending" with recorded error; offline → queued.

### 9.2 Integration (Vitest, in-memory audit + event stores)

- Unlock → verify → anchor → lock round trip; second unlock verifies the prior anchor.
- Multi-device: two device files merge; an anchor captures both frontiers; tamper in one device
  file is localized to that device's "anchored through" status.
- Evidence bundle round-trip: bundle contains audit entries + change history + key manifest +
  verification report; the report's signatures verify **offline** against the manifest.
- Fail-closed: corrupt audit chunk or anchor mismatch on unlock → workspace does not open; routes
  to recovery.
- Performance: anchor + cold verify of a 100 000-event dataset within the perf budget without
  loading all plaintext at once.

### 9.3 E2E (Playwright against the built Electron binary)

- Open the Audit viewer, filter by date/account, see provenance-labelled rows and per-device
  "anchored through" + timestamp status.
- Export an evidence bundle (typed confirmation, encrypted-workspace guard, save dialog) → file
  written outside the dataset root; success toast with "show in folder."
- Tamper an event file on disk, restart → app blocks with the integrity error and recovery CTA.
- Offline anchor → "pending external timestamp"; restore network → status flips to "externally
  timestamped."

## 10. Acceptance Criteria

- [ ] **AC1** — Every mutation `DomainEvent` variant carries actor attribution (or is enriched at
  append); the full-union coverage test passes and fails when a new flat mutation event is added.
- [ ] **AC2** — Pre-coverage on-disk events still replay and are shown with
  `unknown (pre-coverage)` actor, never refused.
- [ ] **AC3** — `audit.anchor` entries are written to `FileAuditLog`, seq-chained, Ed25519-signed,
  MK-encrypted, and verified-before-append (fail-closed).
- [ ] **AC4** — The anchor records per-device frontiers; verification recomputes per-device
  prefixes (not the merged timeline) and matches a clean anchor.
- [ ] **AC5** — A one-byte edit to any anchored event file is **detected** at chain-verify-on-
  unlock and **fails closed** (workspace does not open; recovery offered).
- [ ] **AC6** — Events appended after the latest anchor are reported "not yet anchored," not as
  tamper (no false positive from late peer sync).
- [ ] **AC7** — Anchoring runs over a stable snapshot, off the write path, and never blocks data
  writes; a mid-hash file change yields a stale/retry, never a signed bad anchor.
- [ ] **AC8** — Incremental per-device head equals a full recompute; cold verify of 100 000 events
  meets the perf budget without full-plaintext residency.
- [ ] **AC9** — The Audit viewer shows signed audit entries and event-derived history as **distinct,
  provenance-labelled** lanes, with per-device "anchored through" and per-anchor timestamp status.
- [ ] **AC10** — The renderer receives only Zod-validated view-models; no plaintext path/ciphertext/
  key crosses IPC (verified by contract tests + isolation lint).
- [ ] **AC11** — The evidence bundle (audit entries + change history + key manifest + verification
  report) verifies **offline**; producing it emits an `audit.export` entry and obeys the SPEC-027
  export safety choreography. (Bundle format/artifact set now locked — OQ5 resolved; see UX spec §3.2.)
- [ ] **AC12** — Tier 2: an anchor's `event_log_root` is bound to an RFC-3161 timestamp via the
  provider abstraction, recorded as a **separate signed `audit.anchor.timestamped` entry** (the
  original anchor is never mutated); offline → queued/pending (derived from absence of a receipt);
  network return → a receipt entry is appended; TSA failure → retryable pending with no data loss
  and no blocked writes.
- [ ] **AC13** — In-app copy and the verification report state the honest limitation
  ("tamper-evident + externally timestamped, not tamper-proof") and the legal-review guardrail.
- [ ] **AC14** — No raw label/transaction/note value appears in any log; sensitive refs are hashed
  (R15).
- [ ] **AC15** — `audit.anchor`, `audit.anchor.timestamped` and `audit.export` are added to
  crypto-spec §8.2 and `AuditAction`; per-mutation audit entries are **not** introduced (covered by
  the coverage tier).
- [ ] **AC16** — The audit data model is extended (FR4a): `AuditTargetRef` supports `anchor`,
  `AuditEntry` carries a signed canonical anchor/receipt payload, and `append()` no longer
  hard-codes `target_ref.type = 'export'`; the signature covers the payload.
- [ ] **AC17** — The verification report and §8 state that v1 audit signatures prove
  signing-key *continuity*, not per-device identity, and that the key manifest is self-asserted
  absent an external timestamp; the spec makes no stronger per-device attribution claim.
- [ ] **AC18** — Anchored event files are never rewritten in place; a documented migration rule
  preserves anchored raw bytes (or re-anchors), so historical anchors survive future migrations.

## 11. Traceability

- **PRD:** `docs/product/prds/prd-028-audit-and-evidence.md` (to be reserved in
  `docs/product/prd-plan.md`)
- **ADRs:** [ADR-001](../architecture/adr-001-tech-stack.md),
  [ADR-002](../architecture/adr-002-repo-structure.md)
- **ADR-001 conditions satisfied:** C1/C2 (AEAD envelope), C3 (Ed25519 audit signing),
  C5/C13 (schema-validated IPC), C11 (renderer CSP/isolation), C12 (per-record AEAD)
- **Security requirements satisfied:** R3, R8 (append-only signed audit), R11 (Electron
  hardening), R12 (IPC discipline), R15 (PII redaction), R17 (input validation),
  R18 (shared-folder path safety), R19 (snapshots/recovery). Acknowledges **AR7** (audit deletion
  detectable not preventable).
- **Crypto-spec sections:** §8 (audit log crypto; §8.2 action enum extension; §8.4 tamper
  resistance). Builds on SPEC-026 (encrypted event log) and SPEC-027 (export + thin audit).
- **Related specs / issues:** [`docs/specs/027-export.md`](./027-export.md) (export pipeline reuse);
  SPEC-026 (event log); **issue #293 / invoice-attachments** — attach/remove-invoice are sensitive
  ops that SHOULD be covered by the coverage ledger; **cross-reference, do not duplicate** (that
  spec is authored in parallel).
- **Decision record:** `.squad/decisions/neo-027-export-audit-foundation.md` (the thin-foundation
  this follows up); [`neo-028-anchor-dont-resign.md`](../../.squad/decisions/neo-028-anchor-dont-resign.md)
  records the anchor-vs-per-event decision and resolves OQ2/OQ3.
- **Paired UX:** [`docs/ux/specs/spec-028-audit-evidence-viewer.md`](../ux/specs/spec-028-audit-evidence-viewer.md)
- **Supersedes / Superseded by:** Reframes the deferred-work checklist in issue #351.

### 11.1 Work-item decomposition

| WI | Tier | Issue | Title | Depends on |
|---|---|---|---|---|
| WI-1 | 0 | #357 | Coverage ledger normalization + full-union coverage test | — |
| WI-2 | 1 | #358 | Event-log frontier anchoring into the signed audit chain | — |
| WI-3 | 1 | #361 | Chain-verify-on-unlock lifecycle step | WI-2 |
| WI-4 | 1 | #360 | Audit & Evidence viewer + evidence export | WI-3 |
| WI-5 | 2 | #362 | Trusted timestamping of the anchor root | WI-2 |
| WI-6 | 3 (deferred) | #359 | Per-event Ed25519 signing + escrow.json cross-device trust | — |


## 12. Open Questions

> **Viewer-blocking status (added 2026-06-13).** The user-facing **Audit & Evidence viewer (FR10)**
> and **evidence-export bundle (FR11)** are the next increment (WI-4/WI-6). Only **OQ5** (bundle
> format) gated the viewer UX, and it is now **resolved** (below, consistent with UX spec §3.2).
> **OQ1** (no per-mutation audit entries) and **OQ4b** (freeTSA default + bundling the pinned root)
> were **ratified by Pedro on 2026-06-13** (qualified/eIDAS TSA recommended for audit-grade). **OQ7**
> (anchor hash basis) and **OQ8** (escrow-based verification, Tier-1-vs-Tier-3) remain
> security/architecture confirmations on already-shipped backend, tracked separately for Switch and
> **not viewer blockers**; left as-is, no shipped behavior changes.

1. **Per-mutation audit entries?** The spec recommends NO (coverage tier + anchoring cover it).
   **Ratified** (Pedro, 2026-06-13): bulk anchoring is accepted as a substitute for per-action audit
   entries on tx/config/note/split mutations; no per-mutation audit entries are introduced.
2. **Anchor trigger constants.** **Resolved** ([neo-028](../../.squad/decisions/neo-028-anchor-dont-resign.md)):
   anchor on unlock + on lock + every N=1000 local appends or T=15min of write activity (best-effort,
   never blocks writes); values tunable. Lock-time anchoring is best-effort, not mandatory.
3. **Coverage strategy.** **Resolved** ([neo-028](../../.squad/decisions/neo-028-anchor-dont-resign.md)):
   a single **append-time enrichment choke-point** at the event-log boundary (additive, back-compat),
   not per-schema edits. (Neo.)
4. **TSA provider choice for v1.** **Resolved autonomously for implementation (2026-06-01, FLAG for
   Switch/Link confirmation)** — see [neo-028](../../.squad/decisions/neo-028-anchor-dont-resign.md):
   - **OQ4a (codec):** RFC-3161/CMS handled by a **minimal in-tree DER codec** (zero new runtime
     deps) confined to `core/audit/timestamp/rfc3161.ts`; all *cryptographic* operations use Node's
     built-in `crypto` (X.509 chain/validity + `crypto.verify` over `signedAttrs`). Swappable for
     `pkijs`/`asn1js` later behind the same module boundary if review prefers a vetted parser.
   - **OQ4b (provider):** default **freeTSA.org** RFC-3161 (permits general-purpose timestamping,
     free, publishes a bundleable CA root) behind a `TimestampProvider` abstraction; a commercial TSA
     or transparency-log/public-anchor provider can drop in later. **Ratified** (Pedro, 2026-06-13):
     freeTSA approved as the out-of-box **default**, with a **qualified (e.g. eIDAS) or commercial
     TSA recommended for audit-grade/regulatory deployments**, and **permission to bundle the pinned
     freeTSA root cert granted**.
     - **Normative caveat (review-accepted 2026-06-01):** freeTSA is the functional, out-of-box
       **default only**. Production / audit-grade / regulatory deployments **SHOULD** configure a
       **qualified (e.g. eIDAS) or commercial TSA** — this ties to the §8 honest-limitation and
       legal-review language. The bundled freeTSA root is **pinned by SHA-256 fingerprint**
       (`A6:37:…:AA:BC`, provenance + guard test in `core/audit/timestamp/roots.ts`).
   - A transparency-log/public-anchor alternative is **deferred for v1**, kept open via the interface.
5. **Evidence bundle format.** **Resolved & accepted** (Pedro, 2026-06-13; UX spec §3.2,
   [`spec-028-audit-evidence-viewer.md`](../ux/specs/spec-028-audit-evidence-viewer.md)): v1 bundle =
   JSON-lines audit entries + event-derived change history + public-key manifest + external-timestamp
   receipts + a verification report, **plus a print-friendly `verification-report.html` (print
   stylesheet)** that satisfies the FR10 "print-friendly" requirement. **True app-generated PDF is
   deferred** to a later increment (reachable meanwhile via browser print-to-PDF on the HTML view).
   (Niobe/Link — applied recommendation; Pedro to confirm at acceptance.)
6. **SPEC number coordination.** This reserves **SPEC-028**; the parallel invoice-attachments work
   (#293) has not yet reserved a number and should take **029**. Confirm with that session.
7. **Anchor hash basis & migration.** Confirm `device_head_hash` over raw on-disk NDJSON lines
   (FR4) is acceptable given the "never rewrite an anchored event file" migration rule, or whether
   a canonical decrypted-content hash (migration-tolerant but more complex) is preferred. (Neo/Switch.)
8. **escrow-based audit verification.** Decide whether bringing `FileAuditLog` to the full
   crypto-spec §8 model (genesis constant, escrow device-key verification) is pulled forward into
   Tier 1 or stays with Tier 3. (Switch.)

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-06-01 | Draft | Niobe (with Neo + Switch) | Initial draft. Reframes issue #351 into tiered Audit & Evidence (Tiers 0–2; Tier 3 deferred). Built on the verified "anchor, don't re-sign" design; Tier 0 coverage downgraded to "normalization required" after confirming flat config/note/split/import events lack actor fields. |
| 2026-06-13 | Draft (viewer increment finalized in paired UX) | Niobe | Resolved **OQ5** (evidence bundle format — JSON-lines + manifest + verification report + print-friendly HTML, PDF deferred) consistent with the paired UX spec §3.2. Annotated §12 to record that OQ1/OQ4b/OQ7/OQ8 are backend/security confirmations on already-shipped crypto (3.15/3.16), tracked separately for Switch/Link and **not** viewer blockers (no shipped behavior changed). Paired UX spec moved to **In Review** for the FR10/FR11 viewer build (WI-4/WI-6). |
| 2026-06-13 | Draft (paired UX **Accepted**) | Pedro (product owner) | Pedro ratified the viewer-blocking decisions: **OQ5** accepted (bundle format incl. print-friendly HTML, PDF deferred); **OQ4b** accepted (freeTSA default; qualified/eIDAS recommended for audit-grade; bundling the pinned freeTSA root approved); **OQ1** accepted (bulk anchoring as substitute for per-mutation audit entries). OQ7/OQ8 remain separately tracked for Switch (not viewer blockers). Paired UX spec is now **Accepted**; viewer build (WI-4/WI-6) cleared to start. |
