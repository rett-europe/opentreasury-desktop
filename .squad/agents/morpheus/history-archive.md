# Morpheus History Archive (2026-04-25)

**Archived from:** `morpheus/history.md` when it exceeded 12KB.  
**Archive date:** 2026-04-25T14:35:00Z  
**Reason:** File size ~109KB; early learnings + completed WI work moved here to keep active history focused on current/ongoing tasks.

## Archived Learnings & Completed Work

### Foundation Work (April 19–20)

- **Event-sourced architecture locked:** Append-only NDJSON log per `JsonFileEventLog`, no transactions, immutable events, read-model projections via reducers.
- **IPC contract pattern:** No error throws across IPC; all failures return `{ ok: false, error: { code, message, field? } }`. IDs are 26-char Crockford ULIDs. Uniqueness is case-insensitive + trimmed.
- **Two event shapes coexist:** Enveloped (WI-11/12 transactions) + Flat (WI-15-lite config). Consolidation deferred.
- **Read-model duality:** Legacy (`accounts`/`categories`/`tags`) from enveloped seed; new (`configAccounts`/`configCategories`/`configTags`) from flat WI-15 events.

### WI-17 Security Hardening (April 20)

- **6 Switch security conditions implemented:** pathGuard (no traversal, no UNC, no device prefixes, no reserved names), sessionFileRegistry (stage→fileId mapping, TTL, eviction), exceljs swap (CSVparses arrays, XLSX async via exceljs), fileId tokens (opaque string, not filepath), row-cap enforcement (user-configurable limit), parser safety (error codes + raw values).
- **Error code standardization:** Structured codes (`EMPTY`, `NOT_A_STRING`, `NO_DIGITS`, `INVALID_CHARACTERS`, `PARSE_FAILED`) with raw value + offending context for i18n.
- **Unicode whitespace normalization:** Parser accepts NBSP (U+00A0), narrow NBSP (U+202F), zero-width space, em/en space, others in U+1680/U+2000–U+200B/U+205F/U+3000/U+FEFF.
- **WI-17 tests: 197 all green** (175 existing + 22 new path + session tests).

### WI-18 Header Detection & Junk Filtering (April 20)

- **Header-row detection heuristic:** Scoring-based (+2 header shape, +3 next-row-is-data, +1 no-digits, -2 single-cell); scans rows 1–20; fallback row 1 if max score < 3; user can override via stepper.
- **2-of-3 junk rule:** 0/1 parseable fields → silent skip; 2 → surface as error (might be typo); 3 → import. Golden rule: never silently drop legitimate transactions.
- **Row semantics:** Absolute 1-based source-file row (matches Excel, debuggable).
- **102 import-area tests green** (header detection, row classification, handler integration).

### WI-19 Reference + Notes (April 20)

- **Transaction extensions:** `reference` (max 120) and `details` (max 1000) with trim-normalize-empty-to-null pipeline.
- **Note aggregate:** Full lifecycle events (`tx.note.added/edited/deleted`) on same NDJSON log; no separate store.
- **Idempotency split:** Event `id` (log dedup key, always unique) ≠ Note `noteId` (stable aggregate key). Prevents silent no-op on edit re-issue.
- **Backward-compat:** New fields are `.nullable().optional()` on wire; old events omit them, still validate on replay.

### WI-20 Amount Parsing Locale-Aware (April 20)

- **Decimal-separator auto-detection:** Rightmost separator is always decimal; count dots+commas, examine position. Spanish format (dot=thousands, comma=decimal) primary; US (comma=thousands, dot=decimal) secondary.
- **Column-level inference:** ≥80% samples agree on format → lock column to that locale. Prevents single-ambiguous-value misreading.
- **Explicit override:** User can force locale when bank format is ambiguous or known.
- **Accounting parentheses:** `(1.234,56)` → -1234.56.
- **50 comprehensive tests:** All Spanish/US formats, negatives, currency symbols, edge cases.

### WI-21 Config CRUD (April 22)

- **Archive-only policy:** No hard-delete (safe under current Account ID decoupling, safe after future unification migration).
- **Event shapes:** Flat PascalCase matching WI-15-lite (`AccountCreated`, `AccountUpdated`, `AccountArchived`, `AccountUnarchived`, etc.). Every event has unique `id` (log dedup) + domain-named field (`accountId`, `categoryId`, etc.). No cascade.
- **SubcategoryCreated exception:** `id` IS the entity id (matches WI-15-lite convention); `SubcategoryUpdated/Archived/Unarchived` use separate `id` + `subcategoryId`.
- **Subcategories first-class:** Own events, inlined on `ConfigCategory.subcategories[]` in read model.
- **IPC contracts:** `accounts/categories/tags:create/update/archive/unarchive/list` with `{ ok, event }` or `{ ok: false, error }` returns.
- **Two selectors:** `select{Accounts,Categories,Tags}` (all, archivedAt verbatim) + `selectActive{...}` (filters archived, strips archived subcategories from active categories).

### WI-22 Saldo Aggregation (April 22)

- **On-demand read-model aggregation:** <5ms at 1k events.
- **Property test verified:** 510 fast-check iterations across 8 invariants + 6 boundary cases. All green. I8 (Saldo ≡ Movements) equivalence holds.
- **Skill drafted:** `.squad/skills/read-model-aggregation/` — reusable pattern for future on-demand queries.

### WI-23 Projection Unification (April 25)

- **Legacy event migration:** `account.created`/`category.created`/`tag.created` (enveloped) → flat `AccountCreated`/`CategoryCreated`/`TagCreated` with new required `sortOrder` field.
- **Boot-guard:** `JsonFileEventLog.load()` rejects legacy types, Zod-validates unified shapes. Schema migration policy locked in `security-requirements-v0.1.md`.
- **Runtime unreachable:** Reducer no-op block for legacy types kept (handler tests still use them directly, fine for now).
- **PR #26 takeover:** Rebased from @copilot, resolved single conflict in reducers.ts (PR #45 perf-rewrite ∩ PR #26 projection-rewrite). Added rebase-fallout fixes (import.ts CategoryCreated sortOrder, bulkUpdate test fixture). All gates green.

### Path Validation Edge Cases (Windows-specific)

- `path.normalize()` resolves `..` before our traversal check → check `includes('..')` AFTER normalize.
- Reserved names check both basename and basename-without-extension (`CON` + `CON.txt` both invalid).
- UNC paths `\\` + device prefixes `\\?\` + `\\.\` all must reject.
- Symlink detection requires `lstatSync` (not `statSync` which follows symlinks).

## Summary

Core event-sourcing layer locked. Four complete WI blocks delivered (WI-17 security, WI-18 header detection, WI-19 transaction extensions, WI-20 amount parsing), two more shipped (WI-21 config CRUD, WI-22 saldo aggregation). WI-23 projection unification in PR #26 review (Neo CHANGES_REQUESTED due to perf-seed half-migration; Cypher assigned fix). All tests green. Ready for next phase.
