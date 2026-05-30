# Project Context

- **Owner:** Pedro (perocha)
- **Project:** OpenTreasury Desktop — Electron-based treasury management for NGOs. Desktop version of the cloud-based rett-europe/opentreasury, designed to work without complex cloud setup.
- **Stack:** Electron (frontend), rest TBD. Reference app: Angular 19 + Python FastAPI + Cosmos DB + Entra ID on Azure.
- **Created:** 2026-04-19

## Recent Work
### 2026-05-25 — Code review of 6f0ef7f (Trinity's encrypted-log dedup fix) → APPROVE w/ follow-up

**Context:** Reviewed Trinity's one-line fix to `EncryptedMultiDeviceEventLog.load()` cross-file dedup. Verdict: APPROVE WITH FOLLOW-UP. Full verdict in `.squad/decisions/inbox/morpheus-review-6f0ef7f.md`.

## Learnings
- **The `(after > before)` projection-gate idiom in IPC handlers is fragile.** It lives in 8+ handlers (`accounts`, `categories`, `tags`, `notes` ×3, `import`, `transaction-splits`, `bulkUpdate`) and silently masks any `EventLog` implementation whose `load()` doesn't faithfully reflect on-disk state. A stronger contract would be `append()` returning `{ added: boolean }` (or the projection driven by an event-emission hook from the log itself) — but that's a future spec, not a fix.
- **All IPC handler integration tests use `JsonFileEventLog`.** That's exactly why this bug shipped — the encrypted adapter is only exercised by unit tests of itself. The encrypted adapter has its own correctness invariants (per-device files, AAD binding to `id+deviceId`, AEAD failure handling) that `JsonFileEventLog` doesn't share. At minimum we need one IPC-handler integration test wired to `EncryptedMultiDeviceEventLog`.
- **`this.seenIds` in the encrypted log serves TWO purposes that look identical but aren't:** (1) `append()` short-circuit for idempotency within a process lifetime, (2) `load()` cross-file dedup so the same event id appearing in two device files (recovery re-emit) is only returned once. Trinity's fix correctly separates (1) and (2) by introducing a per-call `loadedIds` Set for (2) while leaving `this.seenIds` doing (1). My own earlier history note about ""use a fresh log instance for read-back verification"" was the smell — that workaround was hiding this bug.
- **JsonFileEventLog is structurally immune** to this class of bug because its `load()` doesn't skip already-seen ids during read — it always pushes and then `seenIds.add`. The encrypted adapter diverged because it needed cross-FILE dedup; the divergence is where the bug crept in.
- **`load()` is called TWICE per IPC write** (once for `before`, once for `after`). Each call decrypts the entire log. Negligible at trial-3 dataset size but a latent perf hotspot; track for when dataset grows.

---

## 2026-05-15 — SPEC-027 Export Feature (Squad decision consolidation)

**Context:** Niobe completed Draft specs for Export (CSV/XLSX) feature. Switch performed security analysis. Mouse provided UI/design guidance. Scribe orchestrated decision consolidation into canonical decisions.md.

**Scope:** Export statement rows as CSV or XLSX with full decryption in main process only (renderer never sees plaintext). Atomic file write with audit entry. Reusable UI components only.

**Status:** Draft (13 Open Questions awaiting Pedro approval before → In Review).

**Your role (Morpheus):** Implementation pending OQ-1 through OQ-7 answers (gate model, M2 supersession, audit behavior, XLSX enum, row cap, save destination, confirmation copy).

**Reference:** `.squad/decisions/decisions.md` § SPEC-027 Export Feature + 13 Open Questions section.



---

## Summary

May 25+: Recent work on IPC, bootstrap, storage, and Export feature decision consolidation. See history-archive.md for May 4–12 work (WI-17, WI-18, WI-19, core IPC foundation).

