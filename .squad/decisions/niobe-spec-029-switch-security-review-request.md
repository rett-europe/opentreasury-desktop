# Security Review Request: SPEC-029 Invoice Attachments

**Date:** 2026-06-01
**Requested by:** Niobe (Spec / UX Analyst)
**Reviewer:** Switch (Security)
**Status:** Awaiting review
**Affected specs:** SPEC-029 Invoice Attachments (Draft) · `docs/specs/029-invoice-attachments.md` · paired UX `docs/ux/specs/spec-029-invoice-attachments.md`
**Related:** issue #293 · SPEC-027 Export (security precedent) · SPEC-028 Audit & Evidence (audit subsystem, reframes #351) · crypto-spec §1.1/§2/§2.1/§8.2/§8.3

---

## Why this needs Switch

SPEC-029 lets a treasurer attach invoice files (PDF/PNG/JPEG/WebP) to a
transaction, stored **encrypted at rest** inside the dataset, viewable via the OS
default app, with full CRUD. It crosses every Switch-owned domain: AEAD blob
storage, the key hierarchy (DEK vs MK), the renderer/main boundary, the
filesystem, and the signed audit log. No implementation PR may merge while the
spec is Draft; Switch sign-off (with Neo + Link) moves it to Accepted.

Please rule on the two **blocking** items first (§A, §B), then ratify the
mechanics (§C) and answer the assigned open questions (§D).

---

## A. BLOCKING — Decrypt-to-cache view model (the one deliberate exception)

Product requirement (Pedro): viewing opens the invoice in the **OS default
application** (Edge/Acrobat for PDF, Photos for images). That necessarily
materializes a **plaintext copy on disk**, which is a deliberate exception to
SPEC-027's "no plaintext to disk" posture.

Proposed controls (SPEC-029 FR13/FR14, §8):
- Decrypt in **main** into an app-controlled cache dir under
  `app.getPath('userData')/attachment-cache/` — **outside the dataset root** and
  **outside `os.tmpdir()`**.
- `shell.openPath(cachedPath)`; the renderer never receives the path or bytes.
- Purge the cached copy on transaction-detail close, on app `will-quit`, and via
  a sweep of the cache dir on next launch; plus a max-age timeout.
- Honest disclosure (UX one-time modal): once handed to the external app, that
  app may keep its own copy (recents/autosave/cloud) — outside our control.

**Questions for Switch:**
1. Is the managed-cache-under-`userData` location acceptable, or do you require a
   stricter location/permissions model (e.g., per-OS ACLs, `0700`, a randomized
   per-session subdir, encrypted-FS hint)?
2. Is the purge lifecycle (close + quit + next-launch sweep + max-age) sufficient,
   or do you want a guaranteed best-effort secure-delete (overwrite) rather than
   unlink?
3. Do you want viewing itself gated (e.g., typed confirmation like SPEC-027
   export) or is the audit `attachment.viewed` entry enough for v1?
4. Do you accept "open in OS default app" at all for v1, or would you mandate a
   sandboxed in-app viewer instead (we deferred that to OQ5 as a future option)?

## B. BLOCKING — DEK vs MK for blob sealing (OQ3)

SPEC-029 mandates blobs sealed with the **DEK for the recorded `dekVersion`**,
not the MK directly. The tension: the crypto-spec describes data under a DEK, but
the current event-log code (`app/src/core/crypto/event.ts`) passes the **MK**
directly. Blob AAD includes `dekVersion`; rotation posture is "new attachments use
the current DEK; existing blobs stay readable under their recorded `dekVersion`;
**no bulk re-encryption**."

**Questions for Switch:**
1. Confirm the DEK (by version) is available to a main-process seal/open path at
   v1, or rule that blobs use the MK directly (and we drop `dekVersion` from the
   AAD/header accordingly).
2. Confirm the no-bulk-re-encryption-on-rotation posture is acceptable, and that
   old DEKs remain retrievable for opening historical blobs.
3. Should this reconciliation be tracked as a crypto-spec erratum or a separate
   ticket so the event-log MK-vs-DEK gap is addressed coherently?

## C. Ratify the blob mechanics

- **AEAD:** XChaCha20-Poly1305 via `sodium-native`; 24-byte random nonce per blob
  (C1, C2, C3, R3).
- **Self-describing blob header** (so a blob is diagnosable without the event
  stream):
  `"OTATTACH" || 0x01 || attachmentId(16) || datasetId(16) || txId(16) || dekVersion(u32 LE) || nonce(24) || ciphertext(+tag)`.
- **AAD (domain-separated):**
  `"attachment-blob:v1:<attachmentId>:<txId>:<datasetId>:<dekVersion>"`.
  Header fields MUST equal the metadata event before open; mismatch →
  `corrupt_or_wrong_key`. **`deviceId` deliberately NOT in AAD** (attachments are
  cross-device readable, unlike per-device event files).
- **On-disk layout:** `{dataset-root}/attachments/<attachmentUlid>.blob`, opaque
  ULID filename, no PII, no type-leaking extension (C11, R3); immutable/write-once
  per attachmentId → avoids OneDrive/SharePoint conflict copies.
- **Crash-consistent add ordering:** validate(magic+size) → audit `started` →
  write `.tmp` → fsync → atomic rename → append `tx.attachment.added` event →
  audit `succeeded`. Blob durable **before** event ⇒ a crash leaves a harmless
  orphan, never a dangling metadata reference.
- **Validation:** type by **magic bytes in main** (not extension/renderer MIME);
  size via `fs.stat` ≤ 10 MB; ≤ 20 attachments/tx (R17).
- **Tombstone-only remove:** remove emits `tx.attachment.removed` and **retains**
  bytes; destructive purge/GC is a separate future audited action (OQ1).
- **In-memory hygiene:** zeroize plaintext buffers (`buf.fill(0)`/`sodium_memzero`)
  in `finally` on both add and view paths.
- **Renderer isolation (R11, C6):** all crypto/fs in main; renderer/preload never
  read bytes; renderer never gets a path. Drag-drop resolves the OS path in
  **preload** (`webUtils.getPathForFile`) and main re-reads/re-validates.
- **IPC (R12, C13):** `attachment:list|add|remove|view`, Zod at the boundary,
  discriminated-union responses; no bytes/keys/paths in any schema.
- **Audit (R8, crypto-spec §8.2/§8.3):** new actions `attachment.added`,
  `attachment.removed`, `attachment.viewed`; appended **before** the side effect;
  records plaintext `sha256` (added only), **never** the plaintext filename.
- **PII (R15):** original `filename` is PII — stored encrypted inside the event,
  displayed in UI, **redacted** from all logs; attachment log lines carry opaque
  `attachmentId` + sizes/counts only; CI no-`console.*` in the attachment module.

**Question:** Please confirm the header/AAD construction, the add-ordering, the
tombstone-only remove, and the audit-action set are all acceptable, or specify
changes.

## D. Open questions assigned to Switch

- **OQ1 — GC/purge policy** for retained tombstoned blobs: trigger ("all devices
  observed the tombstone"? snapshot-aware?) and whether destructive purge is a
  separate audited admin action (`attachment.purged`). *Proposed: defer to a
  follow-up; v1 ships retain-only.*
- **OQ3 — DEK vs MK** (see §B).
- **OQ4 — Metadata leakage:** accept coarse leakage via blob size/count/ULID
  timestamp for v1, or require size padding/bucketing? *Proposed: accept for v1.*

## Security requirements asserted (please verify mapping)

R3 (AEAD), R6 (no `%TEMP%` plaintext — cache is under `userData`, see §A), R8
(audit-before-side-effect), R11 (renderer isolation), R12 (no path/bytes over
IPC), R15 (filename PII redaction), R17 (magic-byte + size validation), R18
(cache destination controlled by main).

## What I need back

A verdict per §A and §B (blocking), confirmation or change-list on §C, and
rulings on the §D open questions — so SPEC-029 can move Draft → In Review →
Accepted alongside Neo (architecture) and Link (product).
