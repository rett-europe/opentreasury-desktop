# SPEC-028 — Invoice Attachments for Transactions

> **Status:** Draft · **Owner:** Niobe · **Last updated:** 2026-06-01
> **Paired PRD:** Pending — PRD-028 reservation needed in `docs/product/prd-plan.md`
> **Paired UX:** [`docs/ux/specs/spec-028-invoice-attachments.md`](../ux/specs/spec-028-invoice-attachments.md)
> **Paired Design:** Pending (Mouse — visual polish)
> **Security input (required reading):** Pending — Switch sign-off required before Draft → Accepted
> **Reference pattern:** [`docs/specs/027-export.md`](027-export.md) (main-process file handling, renderer isolation, audit-before-side-effect)
> **GitHub issue:** [#293](https://github.com/rett-europe/opentreasury-desktop/issues/293)

---

## 1. Summary

Invoice Attachments let an NGO treasurer keep the supporting document for a
financial movement **inside** the encrypted treasury instead of loose in a
SharePoint folder with a hand-typed reference. From the transaction detail
view, the user **adds** one or more invoice files (PDF or image) to a
transaction; the file is read, validated, and **encrypted in the main process**
before it ever touches disk, then stored as an opaque encrypted blob under the
dataset root. The user can **view** an attachment — OpenTreasury decrypts it to
a short-lived, app-controlled cache outside the dataset and opens it in the OS
default handler (Adobe/Edge for PDF, Photos for images) — **remove** it,
or **replace** it. The renderer never sees plaintext file bytes or an absolute
path; every add/remove/view is recorded in the signed audit log. The
relationship is **1:n** (one transaction, many invoices), though the common
case is 1:1.

## 2. Problem

María (the NGO treasurer persona in
[`docs/product/vision.md`](../product/vision.md) §2) almost always has a paper
or PDF invoice behind a payment: a supplier bill, a grant receipt, a
reimbursement scan. Today the *data* lives encrypted in OpenTreasury but the
*evidence* lives somewhere else — a SharePoint folder, an email attachment, a
local `Facturas/` directory — and the link between the two is a manually typed
`Referencia` string. That link rots: files get moved, renamed, or deleted; the
reference points at nothing; an auditor asking "show me the invoice for this
€4.200 payment" triggers a five-minute hunt.

Pedro's brief (verbatim, product-owner vision):

> *"In some transactions we have an invoice file (usually PDF). Currently the
> user stores these files somewhere in SharePoint and adds a reference in the
> transaction. The vision is that the user can now 'upload' an invoice to a
> specific transaction and the file gets stored into OpenTreasury folders. The
> app will support viewing that invoice by simply using the default viewer for
> that file type. We must allow CRUD operations on the invoice. In some cases a
> 1:n relationship between transaction and invoices, but usually 1:1."*

This spec brings the evidence into the encrypted dataset, so the document
travels and syncs with the transaction, stays encrypted at rest, and is one
click from the movement it justifies.

## 3. Users & Scenarios

**Primary persona:** **María**, NGO treasurer — not tech-savvy, time-poor,
keeps invoices as PDFs and phone-photo images. (Vision §2.)

**Secondary persona:** **External auditor** who, sitting next to María, asks to
see the document behind a specific movement. They never touch OpenTreasury
themselves but their need drives the "view in one click" requirement.

- **Scenario A — Attach on entry.** María records a €4.200 supplier payment,
  opens the transaction detail, drags the supplier's `factura-0421.pdf` onto
  the Invoices section. The file encrypts and attaches; a paperclip badge
  appears on the movements row.
- **Scenario B — View during an audit.** The auditor points at a movement.
  María opens it, clicks the invoice, and OpenTreasury opens the decrypted PDF
  in Edge. When she closes the detail view, the decrypted copy is purged.
- **Scenario C — Replace a wrong file.** She attached the wrong scan. She
  clicks **Replace**, picks the correct image; the old attachment is tombstoned
  (hidden) and the new one takes its place.
- **Scenario D — Multiple invoices.** A reimbursement bundles three receipts.
  She attaches all three to the one transaction; the detail view lists three
  invoices.
- **Scenario E — Remove.** A duplicate was attached. She removes it; it
  disappears from the transaction immediately. The encrypted bytes are retained
  for later garbage collection (so a not-yet-synced device or an older snapshot
  is never left pointing at nothing).
- **Scenario F — Sync lag.** She opens a transaction on her laptop that her
  colleague populated on the desktop ten seconds ago; the metadata has synced
  but the blob has not yet arrived. The invoice shows a **"pending sync"**
  state, not an error.
- **Scenario G — Wrong file type / too big.** She tries to attach a `.docx` or
  a 40 MB file; the app refuses with a clear message and writes nothing.

## 4. Requirements

### 4.1 Functional

- **FR1 — Attachments section in transaction detail.** `TransactionDetailModal`
  gains an **Invoices / Facturas** section listing the transaction's
  attachments (filename, type icon, human size, availability state) with
  per-item **View**, **Remove**, **Replace** actions and a section-level **Add**
  action. Empty state: *"Sin facturas adjuntas."*
- **FR2 — Add via file picker (main process).** On **Add**, the **main process**
  opens `dialog.showOpenDialog` (single-select in v1; the renderer never
  supplies bytes or a path). The dialog filters to the allowed extensions
  (FR8). Cancelling produces no event and no audit entry.
- **FR3 — Add via drag-and-drop.** The renderer accepts a drag-and-drop of one
  file onto the section as an alternative trigger. The renderer resolves the
  drop to the OS file path via Electron's `webUtils.getPathForFile(file)` (in
  preload) and passes **only that path** to main over IPC; main re-reads and
  re-validates the bytes itself. The renderer never reads the file's bytes.
  (See §8 for why the renderer is not trusted with content.)
- **FR4 — Multiple attachments per transaction (1:n).** A transaction may hold
  multiple attachments, capped at **20** (NFR2). Each is independent; adding a
  second does not affect the first.
- **FR5 — View in OS default handler.** On **View**, main decrypts the blob into
  the **managed secure cache** (FR13), then calls `shell.openPath(cachedPath)`
  so the OS opens the file in its default application (PDF → Edge/Acrobat,
  image → Photos). The renderer receives only a success/failure result, never
  bytes and never the cache path.
- **FR6 — Remove (tombstone).** On **Remove** (after a confirm dialog), main
  emits a `tx.attachment.removed` event. The attachment disappears from the
  transaction immediately. The encrypted blob is **retained** on disk for later
  garbage collection (FR15) — remove does **not** delete bytes in v1.
- **FR7 — Replace.** **Replace** = a **Remove** of the existing attachment
  followed by an **Add** of the new file, as two events under one user gesture.
  If the Add fails validation, the original is **not** removed (the operation is
  all-or-nothing from the user's perspective).
- **FR8 — Allowed types (magic-byte validated).** v1 accepts **PDF, PNG, JPEG,
  WebP**. The type is validated by **file signature (magic bytes) in main**, not
  by extension or renderer-reported MIME. A file whose signature is not on the
  allowlist is rejected before encryption with a clear message.
- **FR9 — Size limit.** Each file is **≤ 10 MB** (NFR1). Oversize files are
  rejected before any byte is read into a full buffer (size is checked via
  `fs.stat` first).
- **FR10 — Encrypted-at-rest storage.** The file bytes are sealed with the
  project AEAD primitive (XChaCha20-Poly1305 via `sodium-native`) and written as
  an opaque blob under the dataset root (§6.3). Plaintext bytes are **never**
  written to disk on the add path.
- **FR11 — Metadata as domain events.** Attachment metadata is recorded as
  `tx.attachment.added` / `tx.attachment.removed` events on the existing
  per-device encrypted event log (§6.1). The blob bytes are **not** stored in
  the event stream.
- **FR12 — Availability states.** Each listed attachment resolves to one of:
  `available`, `pending_sync` (metadata present, blob not yet on disk),
  `missing_blob` (expected blob absent and not explained by recent sync),
  `corrupt_or_wrong_key` (blob present but AEAD open fails), or `removed`
  (tombstoned — normally filtered out of the list). The UI renders distinct,
  non-alarming copy for `pending_sync`.
- **FR13 — Managed secure cache for viewing.** Decryption-for-viewing targets a
  dedicated, app-controlled directory under `app.getPath('userData')`
  (e.g. `…/attachment-cache/`), **outside the dataset root** and **outside
  `os.tmpdir()`**. Files written there are purged when the transaction detail
  view closes and on app quit (FR14). The cache directory is created with
  least-privilege permissions where the OS allows.
- **FR14 — Cache purge lifecycle.** A decrypted cache file's lifetime is bounded
  to the viewing session: it is deleted when (a) the user closes the transaction
  detail view, (b) the app quits (including `will-quit` / crash-recovery sweep
  on next launch), or (c) a max-age timeout elapses. On next launch the cache
  directory is swept clean before first use.
- **FR15 — Retention + garbage collection (deferred design).** Tombstoned blobs
  are retained until a future GC pass reclaims them once it is safe (all devices
  observed the tombstone; no snapshot references them). The GC policy and its
  audited destructive-purge action are **out of scope for v1** and specified in
  a follow-up (§12 OQ1). v1 simply never deletes blob bytes through normal
  Remove.
- **FR16 — Movements-list badge.** A movement row shows a small paperclip badge
  when the transaction has ≥ 1 live attachment, resolved via an O(1) lookup
  (§6.2). No per-row array scan.
- **FR17 — Audit entry first.** Before the file-system side effect of an add,
  remove, or view, main appends a signed audit entry (§6.1 / §8). A crash after
  the audit entry but before completion leaves a trace; a crash before it leaves
  no side effect.
- **FR18 — Success / failure feedback.** Add/Remove/Replace/View surface a
  localized toast on success and a `CE-XXX` code (per
  [`crypto-error-copy-catalog.md`](../security/crypto-error-copy-catalog.md)) on
  failure. The renderer never receives a raw filesystem error or path.
- **FR19 — Export boundary.** SPEC-027 CSV/XLSX export does **not** include
  attachment bytes in v1. Whether a future export bundles attachments is out of
  scope (§12 OQ2).
- **FR20 — Concurrency cap.** At most **one** attachment operation in flight per
  window. A second Add/View while one is running is rejected with a busy state
  (no queue in v1).

### 4.2 Non-functional

- **NFR1 — Per-file size cap 10 MB; bounded memory.** A single attachment's
  plaintext is held transiently in main only for the duration of seal/open and
  is zeroized afterward. No design path loads multiple attachments' plaintext at
  once.
- **NFR2 — Per-transaction cap 20 attachments.** Stated limit; the Add action
  disables with an explanatory message at the cap.
- **NFR3 — 100k-row posture preserved.** The read-model projection for
  attachments is metadata-only and grouped by `txId`; it must not measurably
  slow event replay or movements-list rendering at 100k transactions. Blob
  existence/integrity checks are lazy (on view / on detail open), never part of
  the hot replay path.
- **NFR4 — Offline / sync-tolerant.** All operations work fully offline against
  the local dataset copy. The design tolerates SharePoint/OneDrive sync lag and
  must never produce a sync **conflict copy** for attachment data (per-device
  event files + immutable per-attachment blob filenames; vision §7 Principle 5).
- **NFR5 — Accessibility.** The attachments section meets WCAG 2.1 AA
  (keyboard-operable Add/View/Remove/Replace, `aria-live` on async results,
  visible focus, non-color-only availability states). Full flows in the paired
  UX spec.

## 5. UX Notes

High-level intent only; full flows, copy (ES + EN), states, and a11y live in the
paired UX spec.

- The attachments section sits in `TransactionDetailModal`, below Notes, in both
  the read-only and edit presentations.
- Each row: type icon, filename (PII — see §8), size, availability badge, and an
  actions affordance (View / Replace / Remove). Remove is confirm-gated
  (reuses `ConfirmDialog`).
- Add supports both a button (→ main-process file dialog) and drag-and-drop onto
  the section.
- `pending_sync` and `missing_blob` are **not** rendered as errors;
  `corrupt_or_wrong_key` is.
- Movements list: a paperclip glyph on rows whose transaction has attachments.
- **Architecture-constraining UX:** "view opens in the OS default app" mandates
  a transient decrypted file on disk (FR13/FR14) — this is the single most
  security-sensitive UX decision and is gated by Switch.

## 6. Data Model

### 6.1 Domain events

Two new transaction-child lifecycle events on the existing per-device encrypted
NDJSON event log, plus new audit actions consumed by the audit subsystem. Zod
schemas live in `app/src/core/events/schemas.ts` (mirroring
`transactionNoteAddedEventSchema`).

| Event type | Fields | Produced by | Consumed by |
|---|---|---|---|
| `tx.attachment.added` | `{ type, id: ULID(event), attachmentId: ULID, txId: ULID, filename: string(≤255), mime: enum, sizeBytes: int, sha256: hex(64), dekVersion: int, createdAt: ISO-8601 }` | Command `addAttachment` (main) | Read-model reducer, audit log |
| `tx.attachment.removed` | `{ type, id: ULID(event), attachmentId: ULID, txId: ULID, removedAt: ISO-8601 }` | Command `removeAttachment` (main) | Read-model reducer (tombstone), audit log |

Notes:

- `id` is the event ULID (the log's dedupe key, unique per event);
  `attachmentId` is the stable attachment primary key (mirrors the
  `id`/`noteId` split for notes). Replace reuses neither — it emits a removed
  for the old `attachmentId` and an added for a new one.
- `sha256` is the **plaintext** SHA-256, recorded for integrity/provenance and
  de-dup heuristics. It is metadata, not a secret.
- `filename` is the user's original filename and is **PII** (R15) — it is stored
  *inside* the encrypted event (so it is encrypted at rest) but must be redacted
  from any diagnostic log line.
- New **audit** actions (consumed by the existing audit-log writer, extending
  the `AuditAction` enum and crypto-spec §8.2):

| Audit action | `target_ref` | Result lifecycle | Recorded hashes |
|---|---|---|---|
| `attachment.added` | `{ type: "attachment", id: attachmentId, txId }` | `started` → `succeeded` / `failed` | plaintext `sha256` |
| `attachment.removed` | `{ type: "attachment", id: attachmentId, txId }` | `started` → `succeeded` / `failed` | — |
| `attachment.viewed` | `{ type: "attachment", id: attachmentId, txId }` | `started` → `succeeded` / `failed` | — |

The audit entry is appended **before** the corresponding filesystem side effect
(R8, fail-closed). Audit never records the plaintext filename.

### 6.2 Read-model projections

Two additions to the in-memory read model (`app/src/core/query/types.ts`),
populated by the reducer (`app/src/core/query/reducers.ts`):

- `attachmentsByTxId: Map<txId, AttachmentMeta[]>` — metadata only, never bytes.
- `attachmentParentIds: Set<txId>` — O(1) "has ≥1 live attachment" check for the
  movements-list badge (mirrors the existing `splitParentIds` pattern).

**Tombstone reducer rules** (prevents cross-device resurrection under ULID
re-ordering — see §8):

- Maintain `removedAttachmentIds: Set<attachmentId>`.
- `tx.attachment.removed` → add `attachmentId` to the tombstone set; drop it from
  `attachmentsByTxId`; recompute `attachmentParentIds` membership for that `txId`.
- `tx.attachment.added` → project **only if** `attachmentId ∉ removedAttachmentIds`
  (so a `removed` that merges *before* its `added` still wins).
- `tx.deleted` → hide that transaction's attachments from projections (blobs
  retained for GC).
- Duplicate `removed` events are idempotent.

`AttachmentMeta` carries no `available` field at projection time; availability
(§FR12) is resolved lazily by main on demand (detail open / view), so cheap
replay is preserved (NFR3).

### 6.3 File layout on OneDrive

A new file category under the dataset root holds the encrypted blobs:

```
{dataset-root}/
  attachments/
    <attachmentUlid>.blob        # opaque, encrypted, immutable
```

- Filenames are the attachment **ULID** only — opaque, no PII, no extension that
  leaks type (ADR-001 C11 / R3). Path construction reuses the storage `paths.ts`
  ULID + traversal guards.
- Blobs are **immutable and write-once per attachmentId** (Replace creates a new
  ULID; Remove never rewrites). Immutable per-attachment files avoid concurrent
  append and therefore avoid SharePoint/OneDrive **conflict copies** (NFR4),
  matching the rationale for per-device event files.
- **Blob format** (self-describing header so a blob can be diagnosed and
  integrity-checked without the event stream):

  ```
  magic     : "OTATTACH" + version byte (0x01)
  header    : attachmentId(16) | datasetId(16) | txId(16) | dekVersion(u32 LE)
  nonce     : 24 bytes (XChaCha20-Poly1305, random per blob)
  ciphertext: XChaCha20-Poly1305(plaintext)   // includes 16-byte Poly1305 tag
  ```

- **AAD** (domain-separated, binds the blob to its identity and key epoch):
  `"attachment-blob:v1:<attachmentId>:<txId>:<datasetId>:<dekVersion>"`.
  The header fields MUST equal the values in the matching metadata event before
  main attempts to open the blob; a mismatch is treated as `corrupt_or_wrong_key`.
  **`deviceId` is intentionally NOT in the AAD** — unlike per-device event files,
  any device must be able to open an attachment another device added.
- **Encryption key:** blobs are sealed with the **DEK for `dekVersion`** (the
  data-encryption key in the crypto-spec key hierarchy), **not** the master key
  directly. v1 rotation posture: new attachments use the current DEK; existing
  blobs remain readable under their recorded `dekVersion`; **no bulk
  re-encryption** on rotation (§12 OQ3). (Note: today's event-log code passes the
  MK directly; reconciling that with the DEK hierarchy is flagged for Switch —
  §12 OQ3.)

## 7. IPC Surface

Four new channels under `app/src/shared/ipc-contracts/attachments.ts`, modeled on
`notes.ts`; each Zod-validated at the boundary (R12, C13). All responses are
discriminated unions `{ ok: true, … } | { ok: false, code: "CE-XXX" }`.

| Channel | Direction | Payload schema | Response schema |
|---|---|---|---|
| `attachment:list` | renderer → main | `{ txId: ULID }` | `{ ok, items: AttachmentView[] }` |
| `attachment:add` | renderer → main | `{ txId: ULID, sourcePath?: string }` | `{ ok, attachment: AttachmentView }` |
| `attachment:remove` | renderer → main | `{ txId: ULID, attachmentId: ULID }` | `{ ok }` |
| `attachment:view` | renderer → main | `{ txId: ULID, attachmentId: ULID }` | `{ ok }` |

- `AttachmentView` (renderer-facing, **metadata + availability only**):
  ```ts
  {
    attachmentId: ULID,
    txId: ULID,
    filename: string,        // PII — display only; never logged
    mime: "application/pdf" | "image/png" | "image/jpeg" | "image/webp",
    sizeBytes: number,
    createdAt: ISODate,
    availability: "available" | "pending_sync" | "missing_blob"
                  | "corrupt_or_wrong_key"
  }
  ```
- `attachment:add`:
  - `sourcePath` is present **only** for the drag-and-drop trigger (resolved in
    preload via `webUtils.getPathForFile`); for the button trigger it is omitted
    and main opens `dialog.showOpenDialog` itself.
  - When `sourcePath` is supplied, main treats it as untrusted: it re-`stat`s
    (size cap), re-reads, and re-validates magic bytes before sealing. The
    renderer never sends bytes.
- **Forbidden in every schema:** raw file bytes, master-key/DEK material, the
  decrypted cache path, any absolute path returned to the renderer. Schema
  violations are rejected at the boundary (R12, C13).
- **Rate limit:** one in-flight attachment op per window (FR20).

## 8. Security Considerations

This feature crosses encrypted storage, crypto, the renderer/main boundary, the
filesystem, and the audit log. Switch sign-off is required before this spec
leaves Draft. SPEC-027 §8 is the precedent; this section commits SPEC-028 to the
analogous controls.

- **AEAD envelope (R3 / crypto-spec §1.1, §2.1).** Blobs use `sodium-native`
  XChaCha20-Poly1305 with the self-describing header and domain-separated AAD in
  §6.3 (C1, C2). A 24-byte random nonce per blob via the project CSPRNG (C3).
  Tampered or truncated ciphertext fails the Poly1305 tag on open → surfaced as
  `corrupt_or_wrong_key`, never a partial/garbled file. AEAD integrity is the
  free tamper-detection that distinguishes `corrupt_or_wrong_key` from
  `missing_blob`.
- **Key handling (crypto-spec §2).** Blobs are sealed with the **DEK** for the
  recorded `dekVersion`, derived from the in-memory key material already
  available at unlock; no new Argon2id derivation. DEK rotation does not
  re-encrypt existing blobs in v1 (OQ3).
- **Process boundaries (R11, ADR-001 C6).** All crypto stays in
  `app/src/core/crypto/**`; all file I/O and the file dialog stay in the main
  process (`app/src/main/**`). The renderer's ESLint
  `import/no-restricted-paths` zones continue to forbid renderer → main / crypto
  / storage / core and forbid `fs` / `path` / `electron` in the renderer. CI
  gates this.
- **No plaintext bytes to the renderer.** The renderer receives metadata,
  availability, success/failure, and `CE-XXX` codes only. Decrypted file content
  never crosses IPC. **Why not trust the renderer with bytes:** even for an
  in-app preview, handing decrypted bytes to a Chromium renderer widens the
  plaintext blast radius (DOM/canvas/devtools/extensions). The chosen model
  (decrypt in main → OS default app) keeps plaintext out of the renderer
  process entirely; the tradeoff is a transient on-disk copy, controlled below.
- **Renderer never supplies/receives a path to trust.** For the file-picker
  flow, the source path is chosen by `dialog.showOpenDialog` in **main**. For
  drag-and-drop, preload resolves the OS path and passes it to main, which treats
  it as untrusted input: `path.resolve` + reject paths that resolve **inside the
  dataset root** as a *source* is not required (reading is fine), but the
  **decrypted cache destination** is validated to live under the app cache dir
  and nowhere else (R18). The cache path is never returned to the renderer.
- **Managed secure cache, not `%TEMP%` (R6).** Decryption-for-viewing writes to
  an app-controlled directory under `userData`, **outside** the dataset root and
  **outside** `os.tmpdir()`, so AV/Windows-Search/indexers are less likely to
  snapshot it and it is not co-located with the encrypted dataset. The cached
  plaintext is purged on detail-view close, on app quit, and swept on next
  launch (FR13/FR14). This is the deliberate, **audited** exception to
  SPEC-027's "no plaintext to disk" posture, scoped strictly to viewing.
- **External-app handoff caveat.** Once `shell.openPath` hands the file to the
  OS default app, that app may itself copy the file (its own recent-files,
  autosave, cloud sync). The pre-feature disclosure (UX) states this plainly;
  OpenTreasury controls only its own cache copy. This is the honest boundary
  (mirrors SPEC-027 §8 "what the spec is NOT promising").
- **Crash-consistent add ordering.** Add sequence: validate (size + magic) →
  compute `attachmentId`, plaintext `sha256`, metadata → **audit `started`** →
  write `<attachmentId>.blob.tmp` in the attachments dir → `fsync` → atomic
  rename to `<attachmentId>.blob` → append `tx.attachment.added` event → **audit
  `succeeded`**. Blob is durably written **before** the event, so a crash leaves
  at worst a harmless orphan blob (GC-able), **never** a metadata event pointing
  at a missing blob.
- **Tombstone-only remove.** Remove emits a tombstone event and retains bytes.
  Destructive byte deletion is reserved for a future, separately-audited GC/purge
  (OQ1) — this protects snapshot/restore of earlier states and devices that have
  not yet synced the tombstone (consistent with the event-sourced, append-mostly
  philosophy).
- **Cross-device merge safety.** The event log merges by ULID order, which is
  not a reliable causal order under device clock skew. The tombstone-set reducer
  (§6.2) guarantees a `removed` always wins over its `added` regardless of merge
  order, so a removed attachment can never be resurrected. Concurrent adds to the
  same transaction are independent (distinct ULIDs) and both survive; concurrent
  removes are idempotent.
- **Audit logging (R8, crypto-spec §8.2/§8.3).** `attachment.added`,
  `attachment.removed`, and `attachment.viewed` are appended to the signed,
  hash-chained audit log **before** the side effect, with `started` /
  `succeeded` / `failed` results. Viewing is audited because it materializes a
  decrypted sensitive document. The audit log records the plaintext `sha256`
  (added only) but **never** the plaintext filename.
- **PII redaction in logs (R15).** The original `filename` is PII. It is stored
  encrypted (inside the event) and shown in the UI, but is redacted from any
  diagnostic/console log line; attachment log lines carry the opaque
  `attachmentId`, sizes, and counts only. CI no-`console.*` rule applies to the
  attachment main-process module (per security-review checklist).
- **Input validation (R17).** All IPC inputs are Zod-validated (ULIDs, the
  optional source path string is length-capped and not interpreted as anything
  but a path to `stat`/read). File **type** is validated by magic bytes, file
  **size** by `fs.stat`, both in main, before any seal.
- **In-memory hygiene.** Plaintext buffers (read source on add, decrypted output
  on view) are zeroized (`buf.fill(0)` / `sodium_memzero`) in `finally` after
  seal/open and on failure paths.
- **Metadata leakage (accepted, v1).** Blob presence, size, count, and the ULID
  timestamp leak coarse metadata to anyone with dataset-root read access. Size
  padding/bucketing is **out of scope for v1** and noted (OQ4).

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- `attachmentBlobSeal` / `attachmentBlobOpen` round-trip: seal → open returns
  identical plaintext; header fields are parsed and enforced.
- AAD/header tamper: flip a header byte (wrong `txId` / `dekVersion`) → open
  fails (`corrupt_or_wrong_key`), no plaintext returned.
- Ciphertext tamper: flip a ciphertext byte → Poly1305 tag failure.
- Magic-byte validator: accepts PDF/PNG/JPEG/WebP signatures; rejects a `.docx`,
  a renamed `.exe`, and a zero-byte file; ignores the file extension.
- Size guard: a 10 MB + 1 byte file is rejected via `stat` before read.
- Reducer: `added` then `removed` → not projected, `attachmentParentIds` drops
  txId; `removed` merged before `added` (out-of-order) → still not projected;
  duplicate `removed` idempotent; `tx.deleted` hides attachments.
- Filename redaction helper strips `filename` from a sample log payload.

### 9.2 Integration (Vitest, in-memory storage adapter)

- Add command: write `.tmp` → fsync → rename → event appended → audit
  `started`+`succeeded`; simulate crash between rename and event → orphan blob
  present, no dangling event, GC can detect it.
- View command: decrypts to a fake cache dir, returns success without exposing
  the path; cache file is removed on simulated detail-close.
- Availability resolution: event present + blob absent → `pending_sync` /
  `missing_blob`; blob present but tampered → `corrupt_or_wrong_key`.
- IPC boundary: malformed payloads (bad ULID, bytes in payload, oversized source
  path string) are rejected with `CE-XXX` and never reach core.
- Audit precedence: a forced failure after `started` leaves a `started`+`failed`
  pair; the attempt is always traceable.

### 9.3 E2E (Playwright against built Electron binary)

- Happy path: open a transaction, add a PDF via the file dialog, see it listed +
  the movements badge, view it (asserted via the audit `attachment.viewed`
  entry and a spy on `shell.openPath`), then remove it.
- Drag-and-drop add of a PNG resolves to a main-side read and attaches.
- Reject path: dropping a `.docx` shows the type-rejected message; nothing is
  written.
- Cache purge: after viewing and closing the detail view, the cache directory
  holds no decrypted file.
- Offline/sync-lag: with the blob file withheld, the attachment shows
  `pending_sync`, not an error.

## 10. Acceptance Criteria

- [ ] **AC1** — A user can attach a PDF/PNG/JPEG/WebP ≤ 10 MB to a transaction
  via both the file dialog and drag-and-drop; it appears in the detail view and
  as a movements-row badge.
- [ ] **AC2** — A `.docx`, a renamed `.exe`, a zero-byte file, or a > 10 MB file
  is rejected (magic-byte/size), with a localized message and **nothing written**
  to the dataset.
- [ ] **AC3** — The stored blob is encrypted: the on-disk `<ulid>.blob` does not
  contain the plaintext bytes, decrypts only with the correct DEK + AAD, and
  fails AEAD open after a single-byte tamper.
- [ ] **AC4** — Viewing opens the file in the OS default app; the decrypted copy
  lives only under the app cache dir (outside dataset root and `%TEMP%`) and is
  gone after the detail view closes and after app quit.
- [ ] **AC5** — Remove hides the attachment immediately and **retains** the
  encrypted blob on disk (no byte deletion in v1).
- [ ] **AC6** — Replace results in exactly the new attachment visible; a failed
  Add during Replace leaves the original intact.
- [ ] **AC7** — A transaction supports up to 20 attachments; the Add affordance
  disables at the cap with an explanatory message.
- [ ] **AC8** — `attachment.added`, `attachment.removed`, and `attachment.viewed`
  each produce a signed audit entry, appended **before** the side effect, and the
  audit log never contains the plaintext filename.
- [ ] **AC9** — The renderer never receives plaintext bytes, the cache path, or
  an absolute dataset path on any channel (verified by IPC contract tests +
  ESLint isolation).
- [ ] **AC10** — A `removed` event merged out of order (before its `added`) never
  resurrects the attachment.
- [ ] **AC11** — With the blob withheld (sync lag), the attachment renders
  `pending_sync`, not an error; a tampered blob renders `corrupt_or_wrong_key`.
- [ ] **AC12** — Diagnostic logs from the attachment module contain no filename
  PII and no `console.*` calls (CI-enforced).
- [ ] **AC13** — Event replay over a 100k-transaction dataset with attachments
  shows no material regression vs. baseline (attachment projection is
  metadata-only; integrity checks are lazy).

## 11. Traceability

- **PRD:** PRD-028 (to reserve in
  [`docs/product/prd-plan.md`](../product/prd-plan.md)).
- **ADRs:** [ADR-001](../architecture/adr-001-tech-stack.md),
  [ADR-002](../architecture/adr-002-repo-structure.md).
- **ADR-001 conditions satisfied:** C1 (AEAD), C2 (AAD discipline), C3 (random
  nonces), C6 (renderer isolation), C10 (audit entries), C11 (opaque ULID
  filenames), C13 (IPC Zod validation).
- **Security requirements satisfied:** R3, R6, R8, R11, R12, R15, R17, R18.
- **Crypto-spec sections:** §1.1 (AEAD primitive), §2 / §2.1 (key hierarchy &
  per-file mechanics — DEK seal, AAD), §8.2 (audit `action` enum — add
  `attachment.added` / `attachment.removed` / `attachment.viewed`), §8.3 (audit
  precedent).
- **Reference pattern:** [SPEC-027 Export](027-export.md) — main-process file
  I/O, renderer isolation, audit-before-side-effect, atomic temp→rename,
  honest "what we don't promise" boundary.
- **Related specs:**
  - [SPEC-026 encryption at rest](026-encryption-at-rest.md) — MK/DEK hierarchy
    the blob sealing builds on.
  - [SPEC-023 split transactions](023-split-transactions.md) — `splitParentIds`
    O(1) pattern mirrored by `attachmentParentIds`.
- **Related issues:** [#293](https://github.com/rett-europe/opentreasury-desktop/issues/293)
  (this feature); #351 (audit subsystem — consumes the new audit actions).
- **Paired UX:** [`docs/ux/specs/spec-028-invoice-attachments.md`](../ux/specs/spec-028-invoice-attachments.md).
- **Paired Design:** Pending (Mouse).
- **Supersedes / Superseded by:** — (Note: UX backlog row "UX-027 Attachments
  (receipts)" in [`docs/ux/ux-spec-plan.md`](../ux/ux-spec-plan.md) is realized
  by this feature; that row should be re-pointed to SPEC-028 / renamed UX-028.)

## 12. Open Questions

Numbered for easy reply. These block Draft → Accepted.

1. **(Switch) Garbage-collection / purge policy for tombstoned blobs.** v1
   retains bytes forever. What is the GC trigger ("all devices observed the
   tombstone"? snapshot-aware?), and is destructive purge a separate
   audited admin action (`attachment.purged`)? — *Proposed: defer to a
   follow-up spec; v1 ships retain-only.*
2. **(Link) Export of attachments.** Should a future SPEC-027 export (or a new
   "export with documents" mode) bundle decrypted attachment files? — *Proposed:
   out of scope v1; revisit post-v1.*
3. **(Switch) DEK vs MK reconciliation.** The crypto-spec describes data
   encrypted under a DEK, but the current event-log code passes the MK directly.
   SPEC-028 mandates **DEK-by-`dekVersion`** for blobs. Confirm the DEK is
   available to the seal path at v1, and the no-bulk-re-encryption rotation
   posture. — *Proposed: DEK for blobs; old blobs stay under their `dekVersion`.*
4. **(Switch) Metadata leakage.** Accept coarse leakage via blob size/count/ULID
   timestamp for v1, or require size padding/bucketing? — *Proposed: accept for
   v1.*
5. **(Mouse/Trinity) In-app preview, ever?** v1 is "open in OS default app" only.
   Is a future sandboxed in-app preview (separate isolated `BrowserWindow`,
   `sandbox:true`, no preload, one-time token, no path) wanted for images? —
   *Proposed: not in v1.*
6. **(Pedro/Link) Multi-file add in one gesture.** v1 file dialog is
   single-select (drag-drop also single). Allow multi-select Add in v1? —
   *Proposed: single in v1; multi is a fast-follow.*

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-06-01 | Draft | Niobe | Initial draft from Pedro's brief (issue #293) and codebase investigation. Decisions locked with product owner: view = decrypt-to-managed-cache + OS default app; remove = tombstone + retain (GC deferred); export of attachment bytes out of scope v1. Architecture grounded in SPEC-027 precedent + existing event-log/crypto/audit/read-model conventions. Incorporates rubber-duck critique: blob-before-event crash ordering, tombstone-set anti-resurrection reducer, self-describing blob header, explicit availability states, DEK-by-version sealing, reframed "no plaintext to renderer" guarantee. 13 ACs, 6 open questions. Awaiting Switch security sign-off and Neo/Link review. |
