# SPEC-027 — Export (CSV / XLSX)

> **Status:** Accepted · **Owner:** Niobe · **Last updated:** 2026-06-01
> **Reviewers:** Neo (architecture) ✅ · Switch (security) ✅ · Link (product) ✅ — all approved 2026-05-31
> **Paired PRD:** Pending — PRD-027 reservation needed in `docs/product/prd-plan.md`
> **Paired UX:** [`docs/ux/specs/spec-027-export.md`](../ux/specs/spec-027-export.md)
> **Paired Design:** Pending (Mouse — visual polish; design notes already provided in `.squad/decisions/inbox/mouse-export-ui.md`)
> **Security input (required reading):** [`.squad/decisions/inbox/switch-export-security.md`](../../.squad/decisions/inbox/switch-export-security.md)

---

## 1. Summary

The Export feature gives NGO treasurers a one-click path to leave the encrypted
treasury with a decrypted spreadsheet they can hand to a board member, auditor
or accountant. From a new **`Exportar` / `Export`** entry in the sidebar
navigation, the user picks a date range (required, per Pedro's "list starts
empty" rule), narrows by account, category, subcategory and label, chooses
**CSV** or **Excel (.xlsx)**, confirms a deliberate "this file is not
encrypted" warning, and the main process writes the file to a location the
user chooses through the OS save dialog. Decryption and file I/O stay in the
main process; the renderer never sees plaintext rows or a path string. Every
export — successful or aborted — is recorded in the signed audit log
**before** the file is produced.

## 2. Problem

María (the NGO treasurer persona in [`docs/product/vision.md`](../product/vision.md)
§2) regularly needs to share a slice of the treasury with people who don't —
and shouldn't — have access to the encrypted workspace: the board treasurer
who only opens spreadsheets, the external auditor preparing the annual
accounts, the tax advisor reconciling a single project.

Today, the only way to hand over data is to scroll the Movements screen and
copy-paste rows by hand, which is slow, error-prone, and quickly defeats the
"30 seconds between phone calls" target. Pedro's brief (verbatim):

> *"My vision is having an option on the navbar called 'Export' that allows
> the user to export to CSV/Excel. The information obviously needs to be
> decrypted. It will support filters, so the user can export transactions from
> a specific account, from a specific category/subcategory, date range and
> label."*

The product also already promises a "decrypted-export escape hatch" in M2
(see `.squad/decisions.md`, *Item 6 — Export-Decrypted Escape Hatch*). This
spec converges those two needs into a single, audited path. The earlier
escape-hatch idea (a Settings-screen JSON dump) is **superseded by this spec**
(confirmed by Pedro — OQ2 resolved 2026-05-31; Issue #305 is closable).

## 3. Users & Scenarios

**Primary persona:** **María**, NGO treasurer — not tech-savvy, time-poor,
relies on Excel/Google Sheets for downstream work. (Vision §2.)

**Secondary persona:** **Board treasurer / auditor** who *receives* the
exported file but never opens OpenTreasury. Their needs constrain column
naming and format choice.

- **Scenario A — Quarterly board report.** María opens *Exportar*, picks
  `This quarter`, leaves accounts/categories empty (= all), selects format
  **Excel**, confirms the "treat like cash" modal, and saves
  `OpenTreasury-Movimientos-2026Q1.xlsx` to her Documents folder. She emails
  it to the board.
- **Scenario B — Project-specific extract.** For the EU grant audit she
  filters by `Date range = 2025-01-01 → 2025-12-31`, `Label = "Proyecto
  EU-2025"`, `Account = "Unicaja Proyectos"`, picks **CSV**, and saves it on a
  USB drive the auditor brought.
- **Scenario C — Category drill-down.** While reviewing the *Salaries*
  category for year-end, she filters `Category = Personal`,
  `Subcategory = Nóminas`, `Date range = YTD 2026`, picks **Excel** and saves
  to a local folder for her accountant.
- **Scenario D — Empty result.** She picks a date range with no transactions.
  The screen shows a warning banner and disables the Export button — no empty
  file is written, no audit entry produced.
- **Scenario E — Wrong place to save.** She accidentally points the save
  dialog at the OneDrive folder that contains the encrypted workspace. The
  app refuses the path and re-opens the save dialog; she picks Documents
  instead and the export proceeds.
- **Scenario F — Mid-export crash / cancel.** The export aborts (disk full,
  user pulled the USB). A partial file is removed; the audit log still
  contains the *attempt* entry written before file I/O began.

## 4. Requirements

### 4.1 Functional

- **FR1 — Sidebar entry point.** The app shell sidebar (UX-006 §73) gains an
  `Exportar` / `Export` item between `Importación` and any future `Configuración`
  section, using the Lucide `Download` icon. Selecting it routes to
  `/export`.
- **FR2 — Empty start.** The Export screen opens with no date range selected,
  no filters active, the Export button disabled and a clear prompt
  *"Selecciona un rango de fechas para comenzar"* (Pedro's "list starts empty"
  rule, applied to exports).
- **FR3 — Date range filter (required).** Reuse the Movements
  date-range-picker component (UX-003 §4) with the six presets: `This month`,
  `Last month`, `This quarter`, `YTD <year>`, `Last 12 months`, `Custom…`.
  Range is **required**; Export remains disabled until a range is chosen.
- **FR4 — Account filter (optional, multi-select).** Chip multi-select; empty
  = "all accounts". Reuses the same data source as Movements.
- **FR5 — Category filter (optional, multi-select).** Chip multi-select; empty
  = "all categories".
- **FR6 — Subcategory filter (optional, multi-select).** Chip multi-select.
  Disabled until ≥1 category is selected; options are the union of the
  selected categories' subcategories. Empty = "all subcategories within the
  selected categories".
- **FR7 — Label filter (optional, multi-select).** Chip multi-select on
  `tagIds`; empty = "all labels". Labels are PII per R15 — see §8.
- **FR8 — Result count preview.** When a date range is set, the screen shows
  a live count: *"N movimientos coinciden con estos filtros."* Re-runs as
  filters change, debounced 200 ms. Renderer-side over the already-projected
  read model — no decryption needed for the count.
- **FR9 — Row cap (v1).** Maximum **100 000 rows** per export. Above the cap,
  the Export button is disabled with the message *"Demasiados movimientos
  ({n}). Acota los filtros para exportar como máximo 100 000."*
- **FR10 — Format choice.** Card-style radio: **CSV** (default) or **Excel
  (.xlsx)**. CSV is UTF-8 with BOM, **semicolon-delimited** (`;`), RFC 4180-
  style quoting with `;` as the delimiter (fields containing `;`, quotes, or
  newlines are quoted), CRLF line endings. XLSX is single-sheet, named
  `Movimientos`, written via a **streaming** writer (Switch §2.3) so memory
  stays bounded.
- **FR11 — Exported columns (v1).** One row per movement (parent transaction
  OR child split, mirroring `decisions.md` line 913 *"ONE ROW PER CHILD —
  parent envelope not exported separately"*). Columns, in order:

  | # | Column (ES) | Column (EN) | Source |
  |---|---|---|---|
  | 1 | `Fecha` | `Date` | `tx.date` ISO-8601 (`YYYY-MM-DD`) |
  | 2 | `Cuenta` | `Account` | `account.name` |
  | 3 | `Categoría` | `Category` | `category.name` (blank if uncategorised) |
  | 4 | `Subcategoría` | `Subcategory` | `subcategory.name` (blank if none) |
  | 5 | `Descripción` | `Description` | `tx.description` |
  | 6 | `Importe` | `Amount` | decimal, dot separator, no currency symbol; signed (negative = expense) |
  | 7 | `Moneda` | `Currency` | ISO-4217 (currently always `EUR`) |
  | 8 | `Etiquetas` | `Labels` | semicolon-separated tag names |
  | 9 | `Referencia` | `Reference` | `tx.reference` (blank if none) |
  | 10 | `Comentario` | `Comment` | `tx.comment` / split `comment` |
  | 11 | `ID` | `Id` | the row's ULID — for traceability back to the workspace |
  | 12 | `EsSplit` | `IsSplit` | `true` if the row is a split child, else `false` |
  | 13 | `IDPadre` | `ParentId` | parent transaction ULID when `IsSplit=true`, else blank |

  Open Question 8 covers any additional fields (e.g., `Notes`,
  `ImportBatchId`).

- **FR12 — Filename convention.** Default proposed in the save dialog uses the
  app's active locale: `OpenTreasury-Movimientos-{YYYY-MM-DD}_{YYYY-MM-DD}{-cuenta-X}{-cat-Y}.{csv|xlsx}`
  (ES locale) or `OpenTreasury-Movements-{YYYY-MM-DD}_{YYYY-MM-DD}{-account-X}{-cat-Y}.{csv|xlsx}`
  (EN locale), truncated to a safe filename length and stripped of OS-illegal
  characters. User can rename freely in the dialog.
- **FR13 — Save dialog (main process).** On Export click, main opens
  `dialog.showSaveDialog` with default destination = OS **Documents** folder
  (NOT the encrypted workspace folder, NOT `os.tmpdir()`). Default extension
  matches the selected format. Cancelling the dialog returns the user to the
  Export screen with no audit entry.
- **FR14 — Encrypted-workspace guard (hard block).** If the chosen save path
  resolves inside the active workspace's dataset root (see SPEC-026), the app
  refuses the path and re-opens the OS save dialog; the user may not proceed
  until they select a destination outside the dataset root. There is no
  "Save anyway" path.
- **FR15 — Pre-export confirmation.** Before any decryption begins, the user
  passes a confirmation modal that states the file will be unencrypted, may
  be indexed by Windows Search, may be uploaded by sync clients, may appear
  in OS "Recent files", and is the user's responsibility from that point
  (Switch §2.2). Confirmation is **typed** — the user types the word
  `EXPORTAR` (ES) or `EXPORT` (EN). (Open Question 1 resolved to Option A —
  typed confirmation only; no 12-word re-auth.)
- **FR16 — Atomic write.** The main process writes to a sibling temp file in
  the **same destination directory** (e.g., `export.csv.partial`) and
  atomically renames to the final name on success. On any failure the partial
  is deleted (Switch §2.1 / §2.3).
- **FR17 — Streaming decryption.** Main decrypts one event, formats one row,
  flushes to the writer, drops the plaintext reference. The full plaintext
  dataset is never resident in memory at once (Switch §2.3).
- **FR18 — Audit entry first.** Before any byte is written to disk, main
  appends a signed audit entry with `action: "export.csv"` /
  `action: "export.xlsx"` and an `after_hash` of the canonical-JSON
  description of the filter set (see §6.1). This precedes file I/O so a crash
  still leaves a trace.
- **FR19 — Success feedback.** On success the renderer receives a toast:
  *"{n} movimientos exportados a {basename}."* with a "Mostrar en carpeta"
  affordance that calls `shell.showItemInFolder(absolutePath)` from main.
- **FR20 — Failure feedback.** On failure the renderer receives a CE-XXX code
  (per [`crypto-error-copy-catalog.md`](../security/crypto-error-copy-catalog.md))
  and surfaces the localized copy. The Export button re-enables for retry.
- **FR21 — Concurrency cap.** At most **one** export in flight per window;
  a 5-second cooldown after each export. Cancel-in-progress is **out of scope
  for v1** (the operation is short for ≤100k rows); the safety net is the
  30-second wall-clock timeout (UX side).
- **FR22 — Locale-aware copy & filename language.** All user-visible strings
  honour the active locale (ES / EN). The default filename prefix uses the
  active locale (`OpenTreasury-Movimientos-…` for ES, `OpenTreasury-Movements-…`
  for EN). Numeric formatting in CSV is locale-independent (`.` decimal) for
  downstream tool compatibility.
- **FR23 — Minimum filter set.** A full/unfiltered export is **not allowed**.
  The user MUST select a **date range (mandatory)** PLUS **at least one
  additional filter** (account, category, subcategory, OR label). The Export
  button remains disabled until both conditions are satisfied. An accessible
  explanatory hint is displayed when the date range is set but no additional
  filter is selected: *"Selecciona al menos un filtro adicional (cuenta,
  categoría, subcategoría o etiqueta) para continuar."* (See AC18.)
- **FR24 — Export rate limit (normative).** The main process MUST enforce a
  rate limit of **at most 3 successful export operations per rolling 15-minute
  window** per workspace/device. A 4th attempt within the window is rejected
  with `EXPORT_RATE_LIMITED` (CE-EXP-RATE) and the renderer surfaces the
  localized retry-after copy. Limits are persisted (MK-encrypted) so an app
  restart does not bypass throttling. (Promoted from OQ1; see §8. Supersedes the
  informational 5-second cooldown note in FR21 as the authoritative anti-bulk
  control.)
- **FR25 — Confirmation lockout (normative).** **5 consecutive mistypes** of the
  typed confirmation word (`EXPORTAR` / `EXPORT`) MUST lock the Export gate for
  **5 minutes**. While locked, `export:run` is rejected with `EXPORT_LOCKED_OUT`
  (CE-EXP-LOCK) and the confirmation control is disabled with an accessible
  countdown hint. The mistype counter resets on a correct confirmation. The
  typed input MUST NEVER be logged (see AC19). (Promoted from OQ1; see §8.)

### 4.2 Non-functional

- **NFR1 — Performance.** A 10 000-row export to CSV completes in **< 5 s**
  on the baseline laptop (i5-class, 16 GB). XLSX of the same size completes
  in **< 10 s** (streaming writer overhead). p95 budgets enforced by the perf
  harness.
- **NFR2 — Offline behaviour.** Export works fully offline — it operates on
  the local read model and writes to a local path the user chose. No
  network. Honours Vision §7 Principle 5.
- **NFR3 — Accessibility.** WCAG 2.1 AA. Full keyboard reachability of the
  filter form, the format radio group, the confirmation modal, and the
  retry/CTA controls. Status updates announced via `aria-live`. See paired
  UX spec §6.
- **NFR4 — Memory bound.** Streaming write — peak heap usage during a
  100 000-row export must not exceed **+150 MB** over the baseline renderer
  footprint (Switch §2.3).
- **NFR5 — Privacy of process logs.** No PII or filter-value strings in
  logs (see §8 and R15). Counts and bytes only.

## 5. UX Notes

Full flows live in [`docs/ux/specs/spec-027-export.md`](../ux/specs/spec-027-export.md).
Architecture-constraining points:

- **The list-starts-empty rule applies to the count preview, not just to the
  Movements screen.** No count, no Export button enabled, until a date range
  is chosen. This is a hard product rule.
- **The renderer never receives plaintext rows.** Any "preview rows" affordance
  would require either (a) building it from the already-decrypted in-memory
  read model that powers Movements, or (b) creating a new decryption surface.
  We pick neither in v1 — preview is **deferred** (see §11 Out of scope).
- **Filter form layout.** Two-column grid on desktop, single-column on
  compact widths, per Mouse §2.2. No new components.
- **Confirmation modal copy must go through Switch via the
  `crypto-error-copy-catalog` process** (Switch §5 Q7). Niobe drafts ES + EN,
  Switch ratifies before code freeze.

## 6. Data Model

### 6.1 Domain events

This spec is **read-only over event data** — it does not introduce new
domain events for transactions, splits, accounts, or labels. It does emit a
**new audit event** (consumed by the existing audit-log subsystem):

| Event type | Fields | Produced by | Consumed by |
|---|---|---|---|
| `audit.export` | `{ action: "export.csv" \| "export.xlsx", actor_device_id, actor_user_identity, target_ref: { type: "export", id: <ULID> }, after_hash: BLAKE2b-256, ts, signature_ed25519 }` | Main-process `exportService` (before file I/O) | Audit-log writer; future audit-log viewer |

The `action` enum in `crypto-spec.md` §8.2 already lists `"export.csv"`. The
addition of `"export.xlsx"` is resolved — add it in the same PR (OQ4 resolved,
Switch pre-approved).

`after_hash` is computed over a canonical-JSON serialization of the **filter
set**, not the file contents:

```jsonc
{
  "format": "csv|xlsx",
  "dateFrom": "YYYY-MM-DD",
  "dateTo": "YYYY-MM-DD",
  "accountIds": ["<ULID>", ...],   // sorted
  "categoryIds": ["<ULID>", ...],  // sorted
  "subcategoryIds": ["<ULID>", ...], // sorted
  "labelHashes": ["BLAKE2b256(label_value)", ...] // sorted; raw labels never in audit
}
```

This gives tamper-evident "what was exported" provenance without writing PII
to the audit log (Switch §2.5).

### 6.2 Read-model projections

**No new persisted projections.** The export query reuses:

- The existing in-memory transaction read model (`MovementRecord`) used by
  the Movements screen.
- The existing splits projection (SPEC-023) for child-row enumeration.
- The existing date-range query extension (`.squad/skills/date-range-query-extension/SKILL.md`)
  for the date-range filter.
- The existing account / category / subcategory / label lookup maps used by
  Movements and Saldo.

If the query needs to fan out beyond what `listMovements` returns today,
extend that query via the read-model aggregation skill — do **not** create a
parallel pipeline.

### 6.3 File layout on OneDrive

**Nothing new under the dataset root.** Exported files are written to a
**user-chosen** path outside the encrypted workspace (Documents by default).
They are **not** part of the dataset, are not encrypted, are not indexed by
ULID, and are never re-read by OpenTreasury. The encrypted-workspace guard
(FR14) actively warns against writing into the dataset root.

## 7. IPC Surface

Two new channels, each Zod-validated at the boundary (R12, C13).

| Channel | Direction | Payload schema | Response schema |
|---|---|---|---|
| `export:prepare` | renderer → main | `ExportPrepareRequest` | `ExportPrepareResponse` |
| `export:run` | renderer → main | `ExportRunRequest` | `ExportRunResponse` |

Schemas live under `app/src/shared/ipc-contracts/export.ts`.

- `ExportPrepareRequest`:
  ```ts
  {
    format: "csv" | "xlsx",
    filters: ExportFilters
  }
  ```
- `ExportPrepareResponse`:
  ```ts
  | { ok: true,
      confirmationToken: string,   // one-shot, TTL ≤ 60 s, max 1 pending per window
      basename: string,            // basename of the user-chosen path; main keeps the full path
      warnings: Array<"unc-path" | "row-count-above-threshold">,
      estimatedRowCount: number }
  | { ok: false, code: "CE-XXX" }
  | { ok: false, code: "USER_CANCELLED_DIALOG" }
  | { ok: false, code: "EXPORT_DEST_INSIDE_WORKSPACE" }  // CE-EXP-001: dataset-root path rejected
  ```
- `ExportRunRequest`:
  ```ts
  {
    confirmationToken: string      // returned by export:prepare
  }
  ```
  The renderer **never** supplies a path string or any filter parameter on
  `export:run` — main reconstructs both from the token (Switch §3.2).
- `ExportRunResponse`:
  ```ts
  | { ok: true, basename: string, rowCount: number }
  | { ok: false, code: "CE-XXX" }
  ```
- `ExportFilters` schema:
  ```ts
  {
    accountIds?: ULID[],       // Zod ULID
    categoryIds?: ULID[],
    subcategoryIds?: ULID[],
    labels?: string[],         // length-capped (≤ 64 chars each), no path separators
    dateFrom: ISODate,         // required (Pedro's rule)
    dateTo: ISODate            // required
  }
  ```

**Progress events.** A unidirectional `export:progress` event from main to
renderer ships `{ phase: "encrypting" | "writing", rowsDone, rowsTotal }`
no more than once per 200 ms. Counts only — never row contents.

**Forbidden in either schema:** any path string, any master-key material, any
recovery-phrase fragment, any plaintext row. Schema violations are rejected
at the boundary (R12, C13).

**Rate limit (Switch §3.3):** 1 concurrent export per window; 5-second
cooldown after each completion or failure.

## 8. Security Considerations

This feature crosses every security boundary we have. Switch's analysis
(`.squad/decisions/inbox/switch-export-security.md`) is the canonical input;
this section restates the decisions Niobe is committing the spec to.

- **AEAD primitive (R3 / crypto-spec §1.1, §2.1).** Decryption reuses
  `sodium-native` XChaCha20-Poly1305 with the same per-file AAD as the
  encrypt path. Tampered ciphertext on decrypt → hard fail surfaced as a
  CE-XXX, no partial file produced.
- **Key handling (crypto-spec §2).** Export uses the **in-memory Master Key
  already loaded at unlock**. No new key, no new wrap, no extra Argon2id
  derivation. (See §12 OQ1 for the gate model question.)
- **The "2-of-12" idea — rejected.** Switch's analysis (§1) is that a
  2-position subset of the BIP39 recovery phrase cannot derive any key that
  unwraps `wrap_recovery` (Argon2id is all-or-nothing), would otherwise
  provide ~22 bits of trivially brute-forceable entropy, and would not
  protect against the only realistic attacker class (anyone with main-process
  memory access already has the unwrapped MK). The spec does **not** ship
  this construction in any form. The viable gate options are listed under §12
  Open Question 1.
- **Process boundaries (R11, ADR-001 C6).** All AEAD decryption stays in
  `app/src/core/crypto/**`; all file I/O stays in
  `app/src/main/services/exportService.ts` (main-process only). The renderer's
  `tsconfig` continues to forbid imports from `src/main/` and `src/core/crypto/`.
  An ESLint check (existing `no-restricted-imports` config) gates this at
  CI.
- **No plaintext to renderer.** The renderer receives counts, basenames and
  CE-XXX codes only. Row contents never cross IPC.
- **No path strings from renderer (R12).** The save destination is resolved
  by `dialog.showSaveDialog` in **main**; the renderer never sees nor
  supplies a path. The destination is validated to reject:
  - paths that escape the user-chosen directory after `path.resolve` (R18),
  - UNC / network paths unless explicitly confirmed by the user,
  - paths inside the active dataset root (hard block — FR14): the destination
    is rejected and the save dialog re-opens; no "Save anyway" path exists.
- **No temp files in `%TEMP%` / `os.tmpdir()` (R6).** The partial file is
  written in the **destination directory** and renamed atomically. AV /
  Windows Search / indexers cannot snapshot a plaintext copy from a system
  temp location.
- **In-memory hygiene.** `try/finally` zeroizes any Buffer holding decrypted
  payloads (`buf.fill(0)`, or `sodium_memzero` where available) after each
  row write and on the failure path.
- **Audit logging (R8, crypto-spec §8.2, §8.3).** A signed audit entry is
  appended **before** the first byte is written:
  - `action: "export.csv"` or `"export.xlsx"` (the latter added to the
    enum in the same PR — OQ4 resolved),
  - `actor_device_id`, `actor_user_identity` from the envelope,
  - `target_ref: { type: "export", id: <ULID> }`,
  - `after_hash`: BLAKE2b-256 of the canonical-JSON filter description
    defined in §6.1 — **never** a hash of plaintext output.
  - **Failure audit entries:** Export *failures* are logged **both** in the
    on-chain signed audit log (with `result: "failed"` field) **and** to the
    local diagnostic bundle. Both audit and diagnostics record the attempt
    for post-incident analysis (OQ3 resolved).
- **PII redaction in logs (R15).** The `exportService` module logs only
  counts and byte sizes. **Filter values are PII-equivalent** (a label
  reading `Donor John Smith` is PII) and are redacted via the R15 allowlist
  before any log line. File paths in logs are `basename`-only per the
  diagnostic-bundle rules in `crypto-error-copy-catalog.md`. CI enforces a
  no-`console.*` lint rule inside the export module (per security-review
  checklist §8).
- **Input validation (R17).** All renderer-supplied filter fields are Zod-
  validated at the IPC boundary. ULIDs are checked, label strings are length-
  capped and stripped of path separators, ISO dates are parsed; anything
  invalid is rejected with a CE-XXX.
- **Window navigation (R11).** The "Show in folder" affordance uses
  `shell.showItemInFolder` from main only; no renderer-side `window.open`,
  no `setWindowOpenHandler` exception is needed.
- **What the spec is NOT promising (Switch §2.6):** we do not encrypt the
  exported file; we do not prevent the user from emailing it or losing the
  USB stick; we do not control AV / OS indexing of the destination; we do
  not retroactively scrub copies once written. The pre-export modal
  discloses this in plain language.

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- `buildCanonicalFilterJson(filters)` — deterministic ordering, label hashing.
- `formatCsvRow(movement, locale)` / `formatXlsxRow(movement, locale)` —
  CRLF, semicolon delimiter, RFC 4180-style quoting with `;` as delimiter,
  decimal formatting, label semicolon-joining.
- `buildDefaultFilename(filters, format, locale)` — handles all six date
  presets, truncates safely, strips OS-illegal characters, uses locale for
  filename prefix (`Movimientos` vs `Movements`).
- `validateExportRequest(input)` — Zod schemas reject path strings, oversize
  labels, invalid ULIDs, missing date range, **missing additional filter**
  (FR23).
- `assertNotInsideWorkspace(path, datasetRoot)` — true negatives and false
  positives across symlinks.
- `assertNotTempDir(path)` — rejects `os.tmpdir()` and Windows `%TEMP%`.
- `redactExportLog(line)` — never emits filter values, never emits full paths.
- `isMinimumFilterSetSatisfied(filters)` — returns true only when date range
  is set AND at least one of accountIds/categoryIds/subcategoryIds/labelIds
  is non-empty.

### 9.2 Integration (Vitest, in-memory storage adapter)

- End-to-end pipeline with a fixture dataset (≈ 500 events, multiple accounts,
  splits, labels):
  - prepare → run → file content matches expected CSV / XLSX golden.
  - confirmationToken expired / wrong → run rejected.
  - confirmationToken cannot be replayed.
- Audit entry written **before** the first byte; if file I/O fails the audit
  entry still exists with `result: "failed"` (OQ3). Failure also logged to
  local diagnostics.
- Atomic rename: a synthetic `fs.rename` failure leaves no partial file.
- Tampered ciphertext on one event → decrypt fails, no partial file, CE-XXX
  surfaced, partial removed.
- Memory ceiling: streaming a 100 000-row synthetic fixture does not exceed
  the NFR4 budget.
- Minimum filter set: prepare with date range only (no additional filter) →
  rejected with filter-required error (FR23).

### 9.3 E2E (Playwright against built Electron binary)

- Happy path CSV: pick range, set **at least one additional filter**, click
  Export → save dialog → confirm modal → success toast → file exists on disk,
  byte-equal to golden.
- Happy path XLSX: same as above with XLSX option.
- Empty start: route to /export → date range empty → Export disabled →
  prompt visible.
- Needs additional filter: pick date range only → Export disabled with info
  banner *"Selecciona al menos un filtro adicional…"* → select an account →
  Export enabled.
- Zero results: pick a range + filter with no transactions → warning banner →
  Export disabled.
- Row cap: synthesize > 100 000 rows → Export disabled with the cap message.
- Encrypted-workspace guard: user picks the workspace folder in the save
  dialog → path rejected and save dialog re-opens → user picks Documents →
  export proceeds.
- Cancel in save dialog: no audit entry, screen state intact.
- Failure path: simulate fs failure → CE-XXX shown, partial file absent,
  audit entry has `result: "failed"`, Export re-enables for retry.
- Accessibility: axe-core passes on /export with all states (including
  `needs-additional-filter`); full keyboard flow from sidebar entry to
  success toast; screen-reader announces the count preview, the filter hint,
  the busy state, and errors.

## 10. Acceptance Criteria

- [ ] **AC1** — A new `Exportar` / `Export` sidebar item is visible to all
  authenticated users, positioned between `Importación` and any future
  Configuración section, with the Lucide `Download` icon (FR1).
- [ ] **AC2** — Routing to `/export` shows the Export screen with no date
  range selected, all filters empty, and the Export button disabled (FR2).
- [ ] **AC3** — The Export button stays disabled until a date range is
  selected **and** at least one additional filter (account, category,
  subcategory, or label) is active. With only the date range set, the Export
  button remains disabled and an info hint is displayed (FR3, FR23).
- [ ] **AC4** — Account, category, subcategory and label multi-selects narrow
  the result count, and the count preview updates within 200 ms of the last
  filter change (FR4–FR8).
- [ ] **AC5** — Subcategory multi-select is disabled when no category is
  selected; selecting categories scopes its options (FR6).
- [ ] **AC6** — When the matching row count exceeds 100 000 the Export
  button is disabled with the cap message (FR9).
- [ ] **AC7** — A successful CSV export produces a UTF-8 BOM, semicolon-
  delimited (`;`), RFC 4180-style quoting with `;` as delimiter, CRLF-line-
  ended file with exactly the column order in FR11.
- [ ] **AC8** — A successful XLSX export produces a single-sheet workbook
  named `Movimientos` with the same columns, written via the streaming writer.
- [ ] **AC9** — The save dialog defaults to the OS Documents folder, never
  to the workspace root or `os.tmpdir()` (FR13).
- [ ] **AC10** — Choosing a destination inside the active dataset root causes
  the app to refuse the path and re-open the save dialog; no export proceeds
  until the user selects a valid destination or cancels (FR14).
- [ ] **AC11** — The pre-export confirmation modal requires the user to type
  `EXPORTAR` (ES) / `EXPORT` (EN) before the primary button enables (FR15).
- [ ] **AC12** — A signed audit entry is written **before** any byte of the
  output file (FR18). On a forced fs failure the audit entry remains; the
  partial file does not.
- [ ] **AC13** — The renderer never receives any plaintext row across IPC.
  Static analysis confirms `src/renderer/**` has no imports from `src/main/**`
  or `src/core/crypto/**`. (R11, C6.)
- [ ] **AC14** — IPC payload validation rejects path strings, missing date
  range, oversize label values, and non-ULID id strings with CE-XXX (R12).
- [ ] **AC15** — Logs in the export module emit no filter values, no full
  paths and no row contents (R15 redaction).
- [ ] **AC16** — Performance: a 10 000-row CSV export completes in < 5 s
  and a 10 000-row XLSX in < 10 s on the perf-baseline machine (NFR1).
- [ ] **AC17** — Accessibility: axe-core passes on the Export screen in
  every state listed in the paired UX spec §4.
- [ ] **AC18** — When a date range is selected but no additional filter is
  active, the Export button is disabled with `aria-disabled="true"`, and an
  accessible info banner explains the requirement. The banner uses an
  `aria-live="polite"` region so screen readers announce it (FR23).
- [ ] **AC19** — The typed confirmation input (`EXPORTAR` / `EXPORT`) is NEVER
  written to any log, diagnostic, audit entry, or telemetry sink — neither the
  raw value nor a partial/hashed form. Only the outcome (correct / mistype count
  / lockout) is recorded. After **5 consecutive mistypes** the gate is locked for
  **5 minutes** (`EXPORT_LOCKED_OUT`); after **3 successful exports per 15-minute
  window** further attempts are rejected (`EXPORT_RATE_LIMITED`). (FR24, FR25.)

## 11. Traceability

- **PRD:** PRD-027 (reserved in
  [`docs/product/prd-plan.md`](../product/prd-plan.md)).
- **ADRs:** [ADR-001](../architecture/adr-001-tech-stack.md),
  [ADR-002](../architecture/adr-002-repo-structure.md).
- **ADR-001 conditions satisfied:** C1 (AEAD reuse), C2 (AAD discipline),
  C3 (nonces — N/A, no new ciphertext), C6 (renderer isolation), C10 (audit
  entry), C11 (no plaintext file names — N/A, user-named export), C13 (IPC
  Zod validation).
- **Security requirements satisfied:** R3, R6, R8, R11, R12, R15, R17, R18.
- **Crypto-spec sections:** §1.1 (AEAD primitive), §2 (key hierarchy — MK
  reuse), §2.1 (per-file mechanics — AAD identical to encrypt path), §8.2
  (audit `action` enum: `export.csv`, `export.xlsx` — add in same PR, OQ4
  resolved), §8.3 (audit-export precedent), §11 (implementation gates
  `[NO-DIY]`, `[AUDIT-CHAIN]`).
- **Related specs:**
  - [SPEC-023 split transactions](023-split-transactions.md) — child rows are
    surfaced one-per-row (FR11).
  - [SPEC-024 free-text search](spec-024-free-text-search.md) — `?q=`-derived
    filter set could feed the export filter. **Explicitly out of scope — not
    planned** (OQ13 resolved: Pedro declined).
  - [SPEC-026 encryption at rest](026-encryption-at-rest.md) — defines the MK
    and the `wrap_recovery` Pedro's "2-of-12" idea was attempting to engage.
- **Related UX:**
  - [UX-003 movements screen](../ux/specs/ux-003-movements-screen.md) — date
    range picker + chip-multi-select patterns reused.
  - [UX-004 saldo screen](../ux/specs/ux-004-saldo-screen.md) — filter idiom
    parity.
  - [UX-006 app shell & navigation](../ux/specs/ux-006-app-shell-and-navigation.md)
    — sidebar slot.
- **Skills referenced:**
  - `.squad/skills/date-range-query-extension/SKILL.md`
  - `.squad/skills/search-over-readmodel/SKILL.md`
  - `.squad/skills/read-model-aggregation/SKILL.md`
  - `.squad/skills/spec-rewrite-from-proposal/SKILL.md`
  - `.squad/skills/spec-to-subissues/SKILL.md`
- **Inbox notes consumed:**
  - `.squad/decisions/inbox/switch-export-security.md` (security verdict)
  - `.squad/decisions/inbox/mouse-export-ui.md` (UI design notes)
- **Supersedes:** `.squad/decisions.md` *Item 6 — Export-Decrypted Escape
  Hatch* (confirmed by Pedro — OQ2 resolved 2026-05-31; Issue #305 closable).
- **Paired UX:** [`docs/ux/specs/spec-027-export.md`](../ux/specs/spec-027-export.md).
- **Paired Design:** Pending Mouse polish.

## 12. Open Questions

> All 13 open questions resolved by Pedro (2026-05-31). Spec moved from
> Draft → In Review.

1. **(from Switch §5 Q1) Gate model for export.** Do you accept:
   - **Option A** (Switch-recommended for v1) — UX confirmation + typed
     `EXPORTAR` word + mandatory audit entry, **no extra cryptographic
     gate** (the MK is already unlocked in main-process memory; an extra
     prompt adds friction, not crypto);
   - **Option B** — full **12-word recovery-phrase re-entry**, validated by
     re-deriving `wrap_recovery` and constant-time-comparing the unwrapped
     bytes to the in-memory MK (cryptographically coherent but heavy UX);
   - **Option C** — OS biometric / Windows Hello / Touch ID, deferred to
     v1.1?

   Switch will **not** sign off any "2 of 12 positions" variant under any
   framing — it provides no cryptographic protection (see §8 above).
   Niobe's recommendation: **Option A** for v1, with Option B as a
   per-workspace policy in v1.1.

   > **Resolved (security verdict, 2026-05-16):**
   >
   > **Switch's ruling on the reframed authorization-gate proposal**
   >
   > The product owner reframed the previously-rejected "2-of-12" key-derivation
   > idea as a lightweight *authorization/presence gate*: prompting the user for
   > 2 random words from the 12-word mnemonic at export time, solely to verify
   > that the human present is authorized (defending against "someone using an
   > already-unlocked app without permission"). Switch evaluated this reframed
   > proposal under the new intent.
   >
   > **Verdict: ACCEPTABLE-WITH-CONDITIONS.** The *intent* is legitimate, but
   > the proposed *per-word verification mechanism* is **REJECTED**. The
   > approved gate is **Option A** (typed `EXPORTAR`/`EXPORT` confirmation +
   > mandatory audit entry + main-process rate-limiting/lockout).
   >
   > **Mnemonic-retention finding:** Per SPEC-026 §4.2, the plaintext 12-word
   > mnemonic is **NOT retained** in main-process memory after daily silent
   > unlock (the daily unlock path uses the per-device `safeStorage` wrap; the
   > mnemonic is never entered and never loaded into memory). The mnemonic is
   > only present transiently during fresh setup, enrollment, recovery, and
   > export-decrypted flows, where it is used to derive the recovery wrapping
   > key via Argon2id, then immediately zeroized. Retaining it for the session
   > is unacceptable (expands secret footprint; contradicts the "MK only in
   > memory" posture). Storing per-word commitments is also unacceptable: each
   > BIP39 word represents ~11 bits of entropy (2048 candidates), making
   > individual word commitments trivially offline-crackable even with
   > Argon2id-hardening (~3.4 hours to brute-force all 12 words). **Conclusion:**
   > No per-word verification can be built securely without either retaining the
   > full mnemonic in memory (unacceptable) or storing crackable commitments
   > (leaks the mnemonic to anyone with read access to `events.key`).
   >
   > **Approved gate (Option A) with mandatory conditions:**
   > 1. **Typed confirmation word:** User must type `EXPORTAR` (ES locale) or
   >    `EXPORT` (EN locale) in the pre-export confirmation modal.
   >    Case-insensitive match (already in FR15).
   > 2. **Mandatory audit entry before I/O:** Signed audit-log entry with
   >    `action: "export.csv"` or `action: "export.xlsx"` appended *before* any
   >    plaintext byte is written to disk (already in FR18).
   > 3. **Main-process rate-limit:** Maximum **3 export operations per 15-minute
   >    window** per workspace. After the 3rd export, further attempts are
   >    blocked until the window expires. State must live in main process (not
   >    renderer), defending against scripted exfiltration via IPC.
   > 4. **Lockout on confirmation failures:** **5 consecutive mistypes** of the
   >    confirmation word lock the Export screen for **5 minutes** (UI disabled,
   >    IPC handler rejects). Addresses fat-finger UX; cheap and consistent.
   > 5. **Audit logging of gate pass/fail:** Log `export.gate_pass` or
   >    `export.gate_fail` in the local diagnostic log only (not in the
   >    hash-chained signed audit log) for post-incident analysis. **Never log
   >    the typed input** (redaction rule).
   > 6. **No mnemonic retention:** The plaintext 12-word mnemonic MUST NOT be
   >    retained in main-process memory beyond the enrollment/recovery/
   >    export-decrypted flows where it is transiently needed for Argon2id
   >    derivation. After derivation completes, the Buffer holding the phrase
   >    must be zeroized (`buf.fill(0)` or `sodium_memzero`). Explicit, testable
   >    requirement.
   > 7. **Future escalation (v1.1):** OS biometric re-authentication (Windows
   >    Hello / Touch ID) as an optional per-workspace policy, gating Export.
   >    Deferred — not a v1 blocker.
   >
   > **Threat-model clarity:** Option A (typed EXPORTAR + audit + rate-limit)
   > protects against a casual unauthorized person who sits at an unlocked app
   > and tries to export (they must know the exact word, type it consciously,
   > action is audited). The rate-limit prevents scripted bulk exfiltration via
   > IPC. This is a **deliberate-action gate**, not a cryptographic boundary. It
   > does NOT protect against: (a) an attacker with code execution in the main
   > process (they have the MK in memory and can decrypt without the UI); (b) an
   > attacker who knows the confirmation word and is physically present; (c) a
   > compromised renderer that can invoke IPC directly (rate-limiting slows but
   > does not prevent eventual export). No UI-level gate can defend against (a)
   > or (c) — those require process-isolation and code-integrity measures
   > orthogonal to this feature. The gate's value is making export a conscious,
   > logged, non-accidental act.

   > **✅ Product-owner confirmation (2026-05-31, Pedro):** MVP = Option A
   > (typed EXPORTAR/EXPORT + 7 mandatory conditions). No secret/code entry in
   > v1. Biometric (Windows Hello / Touch ID) deferred to v1.1/v2. OQ1 fully
   > resolved.

2. **(from Switch §5 Q2) Relationship to the M2 "export-decrypted" escape
   hatch (`.squad/decisions.md` Item 6).** Is SPEC-027 the M2 item,
   delivered earlier? Or does the Settings-screen JSON dump remain a
   separate feature? Niobe's recommendation: **this spec supersedes Item 6**
   (the JSON dump becomes unnecessary once filtered CSV/XLSX exists).
   Confirm.

   > **✅ Resolved (2026-05-31, Pedro):** SPEC-027 **supersedes** the M2
   > "export-decrypted escape hatch". Issue #305 is unnecessary and closable —
   > filtered CSV/XLSX export replaces the JSON escape hatch.

3. **(from Switch §5 Q3) Failure audit entries.** Do export *failures* go
   into the on-chain audit log (extra `result: "failed"` field on the entry)
   or only successes — with failures recorded in the local diagnostic
   bundle? Switch recommends **log both**; Niobe agrees.

   > **✅ Resolved (2026-05-31, Pedro):** Export failures logged **BOTH** in
   > the on-chain signed audit log (with `result: "failed"`) **AND** to local
   > diagnostics. Reflected in FR18 and §9 test plan.

4. **(from Switch §5 Q4) Add `"export.xlsx"` to the crypto-spec §8.2
   `action` enum** in the same PR as this feature? Switch will sign off.
   Niobe's recommendation: **yes**.

   > **✅ Resolved (2026-05-31, Pedro):** Yes — add `"export.xlsx"` alongside
   > `"export.csv"` in the audit `action` enum. Switch pre-approved. To be
   > added in the same PR.

5. **(from Switch §5 Q5) Row cap.** Confirm the **100 000-row v1 cap**.
   Above the cap, the user must narrow filters. Niobe's recommendation:
   **yes**, with the cap surfaced in the UI before the user tries (FR9).

   > **✅ Resolved (2026-05-31, Pedro):** 100 000-row v1 hard cap confirmed.
   > **NEW RULE (REQUIREMENT CHANGE):** Full/unfiltered export is NOT allowed.
   > User MUST select a **date range (mandatory)** PLUS **at least one
   > additional filter** (account, category, subcategory, OR label). Minimum
   > 2 filters, one being the date range. Export disabled until satisfied, with
   > accessible explanatory hint. See FR23, AC18.

6. **(from Switch §5 Q6) Default save destination.** Confirm:
   - default = OS **Documents** folder,
   - never the encrypted workspace folder,
   - never `os.tmpdir()`,
   - **warn (not block)** if the user picks a path inside the encrypted
     workspace folder.

   > **✅ Resolved (2026-05-31, Pedro + Switch):** Default = **Documents**;
   > never `os.tmpdir()`. **REQUIREMENT CHANGE:** FR14 changed from warn-and-
   > allow to **HARD BLOCK**. Saving inside the active encrypted workspace/
   > dataset root is **not allowed at all** — the app refuses the path and
   > re-opens the OS save dialog. No "Save anyway" path. Switch approved this
   > hardening. See updated FR14, AC10, Scenario E, §8 security bullet, §9 E2E
   > test. IPC uses `EXPORT_DEST_INSIDE_WORKSPACE` (CE-EXP-001) for telemetry.

7. **(from Switch §5 Q7) Confirmation modal copy (ES + EN).** Niobe will
   draft for the `crypto-error-copy-catalog` review process; Switch signs
   off.

   > **✅ Resolved (2026-05-31, Pedro):** Proceed via the
   > `crypto-error-copy-catalog` process as proposed. Final copy ratification
   > owned by that process.

8. **(Niobe) Column set parity.** Are FR11's 13 columns the right v1 set,
   or do we need `Notes`, `ImportBatchId`, `CreatedAt`, `UpdatedAt`,
   `CreatedBy`? Audit-metadata fields were explicitly de-scoped from
   SPEC-024; same default here unless Pedro overrides.

   > **✅ Resolved (2026-05-31, Pedro):** Ship FR11's **13 columns** as the v1
   > set, no additions.

9. **(Niobe) Filename language.** Should the default filename use Spanish
   (`OpenTreasury-Movimientos-…`) regardless of locale, or follow the
   active locale? Recommendation: **follow active locale** (`Movements` in
   EN).

   > **✅ Resolved (2026-05-31, Pedro):** Use the app's **active locale** for
   > the default filename (EN → `OpenTreasury-Movements-…`, ES →
   > `OpenTreasury-Movimientos-…`). Updated in FR12, FR22.

10. **(Niobe) Locale-dependent CSV separator.** CSV currently spec'd as
    comma + dot decimal for downstream tool compatibility. Some Spanish
    Excel installations interpret `;` better. Do we ship locale-aware
    delimiters in v1, or stay strictly RFC 4180? Recommendation: **stay
    RFC 4180** in v1; revisit if users complain.

    > **✅ Resolved (2026-05-31, Pedro):** Default separator is **`;`
    > (semicolon)** — Spanish-Excel friendly, avoids comma/decimal conflicts.
    > FR10 updated: semicolon-delimited, RFC 4180-style quoting with `;` as
    > delimiter (fields containing `;`, quotes, or newlines are quoted).

11. **(Niobe) Filter persistence across navigation.** If the user navigates
    away from `/export` and returns, do filters reset or persist for the
    session? Recommendation: **reset** (parity with Movements §11 Q4).

    > **✅ Resolved (2026-05-31, Pedro):** **Reset** filters on re-entry
    > (Movements parity). UX spec §2 entry-point #4 already says reset.

12. **(Niobe) Success feedback mechanism.** In-app toast vs OS native
    notification. Recommendation: **in-app toast** (consistent with rest of
    app, no OS-notification permission prompt).

    > **✅ Resolved (2026-05-31, Pedro):** **In-app toast** (already spec'd).
    > No change needed.

13. **(Niobe) Export of search results.** SPEC-024 §11 lists "CSV export of
    search results" as out of scope. Should SPEC-027 accept a `?q=` URL
    param to pre-seed filters from a Movements search? Recommendation:
    **defer to v1.1**.

    > **✅ Resolved (2026-05-31, Pedro):** **No**. Do NOT accept `?q=`
    > pre-seeding. **Dropped from scope entirely** — not even deferred.
    > Pedro explicitly declined. Updated §11 Traceability SPEC-024 reference.

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-05-15 | Draft | Niobe | Initial draft from Pedro's brief + Switch §1–§5 security verdict + Mouse UI notes. 17 ACs, 13 open questions, "2-of-12" gate explicitly rejected per Switch. |
| 2026-05-16 | Draft | Niobe | Open Question 1 resolved: reframed authorization-gate proposal ruled ACCEPTABLE-WITH-CONDITIONS by Switch; Option A is the approved gate; per-word verification rejected on retention/entropy grounds. Rate-limit (3/15min), lockout (5 mistypes → 5min), audit/diagnostic logging, mnemonic zeroization, and biometric deferral (v1.1) conditions added. |
| 2026-05-31 | In Review | Niobe | All 13 Open Questions resolved by Pedro. OQ5 (mandatory date-range + ≥1 additional filter) and OQ6 (FR14 warn→hard block) are requirement changes — Switch blessed the OQ6 hardening; Mouse/Trinity provided OQ5 UX+a11y. OQ13 (?q= pre-seed) dropped from scope. Moved Draft→In Review; reviewers Neo/Switch/Link. |
| 2026-05-31 | Accepted | Neo · Switch · Link | **Reviewer-acceptance gate passed (In Review → Accepted), after merge to `main` (PR #349).** **Neo (architecture) — APPROVE-WITH-NITS:** read-model query reuses the existing Movements patterns (MovementRecord, SPEC-023 splits projection, date-range-query-extension + read-model-aggregation skills) with no parallel pipeline; consistent with ADR-001/002/003, the audit event-model (`audit.export`), and IPC-contract conventions (`export:prepare`/`export:run` Zod-at-boundary, token reconstruction in main). Nits: `export:progress` phase label `"encrypting"`→`"decrypting"`; clarify FR21 5s-cooldown vs OQ1 3/15min rate-limit precedence. **Switch (security) — APPROVE-WITH-NITS:** all 7 Option-A conditions (typed confirm, audit-first, rate-limit 3/15min, lockout 5→5min, no-logging-of-input, mnemonic zeroized, biometric→v1.1), FR14 encrypted-workspace hard-block, dual failure-audit (on-chain + local), `export.xlsx` enum addition, renderer isolation / no-plaintext / no-path-IPC, and PII-in-logs redaction are all faithfully reflected. Nits (pre-code-freeze): promote the 3/15min rate-limit and 5→5min lockout from the OQ1 resolution into normative FRs; ensure the crypto-spec §8.2 `export.xlsx` enum edit lands in the implementation PR; add an explicit AC for "never log the typed confirmation input". **Link (product) — APPROVE-WITH-NITS:** scope matches Pedro's verbatim brief and v1 boundaries — CSV/XLSX only, the five filters, mandatory date + ≥1 additional filter (FR23/AC18), 100k cap, biometric deferred to v1.1, #305 superseded/closable, out-of-scope boundaries honest. Nits: update vision.md §9 feature map (Export still listed v1.x), reserve PRD-027 in prd-plan.md, close UX-A/B/C before Mouse handoff. **No blocking items from any reviewer. SPEC-027 is cleared for implementation.** |
| 2026-06-01 | Accepted (addendum) | Niobe · Mouse | **§14 "XLSX presentation (formatting)" added** as a small, post-ship formatting-polish addendum (the feature shipped with a raw, unstyled sheet via `useStyles:false`). Niobe + Mouse led design; Neo (streaming-style perf), Switch (metadata-leak constraint), Oracle (doc placement) consulted. Pedro confirmed two forks: append as §14 (not a new spec), and ship a **real Excel date cell now** (not deferred ISO text). Adds FR26–FR30, NFR6, AC20–AC25; flags issue #353 (configurable date/decimal preference) as a non-blocking dependency. No change to CSV output, IPC surface, columns (FR11), or security gate. |

## 14. XLSX Presentation (Formatting) — Addendum (2026-06-01)

> **Scope:** presentation polish for the `.xlsx` output **only**. CSV output is
> unchanged. No change to the FR11 column set/order, the IPC surface, the audit
> model, the security gate, or the streaming architecture. This addendum makes
> good on the UX promise *"Native Excel file with automatic column formatting"*
> / *"Archivo nativo de Excel con formato automático de columnas"*
> (paired UX spec `ux.export.format.excel-helper`).

### 14.1 Motivation

The feature shipped with the XLSX writer
(`app/src/main/services/exportService.ts`) using
`ExcelJS.stream.xlsx.WorkbookWriter({ useStyles: false })`: an unstyled sheet
with a plain header row, no column widths, no number/date formats, and no frozen
panes. The board treasurer / auditor persona (§3 secondary persona) opens the
file directly in Excel; a raw dump reads as unfinished and forces manual
reformatting. This addendum specifies a tasteful, deterministic format that is
safe to produce under the streaming writer at the 100 000-row cap.

### 14.2 Functional requirements

- **FR26 — Styled header row.** The single header row is **bold**, white text
  (`FFFFFFFF`) on a solid brand-purple fill (`FF6D4D8C`; contrast ≈ 5.8:1,
  WCAG AA). The header row is **frozen** so it stays visible while scrolling
  (`views: [{ state: 'frozen', ySplit: 1 }]`). Only the header row is frozen —
  no frozen columns in v1. The header labels and their order are unchanged from
  FR11 (locale-driven ES/EN labels).
- **FR27 — Fixed column widths, alignment & wrapping.** Because the streaming
  writer cannot measure content, each column gets a **fixed, pre-set width**
  (set once, before the first data row is committed). Widths and per-column
  presentation:

  | # | Column (key) | Width (chars) | Horizontal align | Wrap |
  |---|---|---|---|---|
  | 1 | `date` | 12 | left | no |
  | 2 | `account` | 22 | left | no |
  | 3 | `category` | 18 | left | no |
  | 4 | `subcategory` | 18 | left | no |
  | 5 | `description` | 40 | left | **yes** |
  | 6 | `amount` | 14 | **right** | no |
  | 7 | `currency` | 8 | center | no |
  | 8 | `labels` | 24 | left | **yes** |
  | 9 | `reference` | 16 | left | no |
  | 10 | `comment` | 32 | left | **yes** |
  | 11 | `id` | 28 | left | no |
  | 12 | `isSplit` | 9 | center | no |
  | 13 | `parentId` | 28 | left | no |

  Widths are advisory display hints; the underlying values are unchanged.
- **FR28 — Amount number format.** The `Importe` / `Amount` cell stays a **real
  signed number** (unchanged value) and is displayed with the number format
  `#,##0.00` — two decimal places, thousands grouping at display time, and a
  **plain leading minus** for negatives (no red, no parentheses — neutral for
  audit). **No currency symbol** is embedded (currency is its own column).
  The format is applied at the **column level** (`getColumn(6).numFmt`), not per
  cell.
- **FR29 — Date as a real Excel date cell.** The `Fecha` / `Date` column is
  written as a **real Excel date value** (not an ISO text string), parsed from
  the `ExportRow.date` `YYYY-MM-DD` field in a **timezone-safe** way (constructed
  at UTC, date-only) so the displayed day can never drift by ±1 regardless of the
  host timezone. A **column-level date number format** controls display:
  - default **ES**: `dd/mm/yyyy`
  - default **EN**: `yyyy-mm-dd`

  This makes Excel native sort/filter on the Date column work correctly. Note
  the **deliberate CSV ↔ XLSX divergence**: CSV keeps the ISO `YYYY-MM-DD`
  **text** (FR11) for downstream-tool stability; XLSX uses a typed date. Both
  represent the same calendar day.
- **FR30 — Workbook metadata (allowlist; security-bound).** The writer sets
  **only** a fixed, non-sensitive metadata allowlist on the workbook:
  - `creator = "OpenTreasury"`
  - `title = "OpenTreasury export"` (generic, locale-neutral)
  - `created = <generation timestamp>`

  The writer MUST **not** set `lastModifiedBy`, `company`, `manager`, `keywords`,
  or any other property, and MUST **never** embed dataset-root paths, device IDs,
  workspace IDs, user identity, filter values, or raw label text in any workbook
  property. There is **no in-sheet "export info" header block** in v1 — export
  provenance already lives in the signed audit log (§6.1), and an in-file block
  risks leaking workspace internals into an unencrypted artifact (Switch). The
  sheet name remains `Movimientos` (single sheet, both locales — preserves the
  AC8 golden contract).

### 14.3 Non-functional

- **NFR6 — Styling must not break streaming or the memory budget.** The writer
  switches to `useStyles: true` but keeps all styling **column-level / shared**:
  column widths, the amount `numFmt`, the date `numFmt`, alignment, and the
  worksheet `views` are configured **once, before the first row is committed**;
  the header row is styled once. The per-row write loop sets **no per-cell
  styles** (which would inflate the shared-style table and heap). Styling MUST
  stay within the existing **NFR1** (10 000-row XLSX < 10 s) and **NFR4** (peak
  heap during a 100 000-row export ≤ +150 MB over baseline) budgets.

### 14.4 CSV is unchanged

This addendum touches **only** the XLSX path. CSV remains UTF-8 with BOM,
semicolon-delimited, RFC 4180-style quoting, CRLF, ISO `YYYY-MM-DD` date text,
and dot-decimal amount (FR10, FR11). Column order and semantics stay **identical**
between CSV and XLSX; only presentation differs.

### 14.5 Dependency — issue #353 (configurable date + decimal preference)

A forthcoming user preference (issue **#353**) will make the date format and the
decimal/thousands separators **user-configurable**. To avoid rework, the writer
introduces a single `DEFAULT_XLSX_FORMAT` seam (locale → `{ dateNumFmt,
amountNumFmt }`) that supplies the FR28/FR29 defaults today and becomes the point
where the #353 preference is injected later. **#353 is a non-blocking
dependency**: this addendum ships locale-driven defaults now; when #353 lands it
overrides those defaults through the same seam without touching the row-writing
loop. Until then, numeric formatting in the **CSV** path stays locale-independent
(dot decimal) per FR22.

### 14.6 Out of scope (parked enhancements)

- **Totals row** (e.g. a `SUM(Importe)` footer). Excluded: a totals row inside
  the data sheet breaks Excel "Format as Table" filtering and clean round-trip,
  and conflicts with the one-row-per-movement contract (FR11).
- **Summary sheet** (row count, sum per currency, date-range banner). Cleaner
  than a totals row but is additional surface; deferred as a future enhancement.
- **Auto-fit (content-measured) column widths** — impossible under the streaming
  writer without buffering the whole sheet; fixed widths (FR27) are the v1
  answer.
- **In-sheet export-info block** — deliberately excluded (FR30 rationale).

### 14.7 Acceptance criteria

- [ ] **AC20** — A successful XLSX export has a **frozen, bold header row** with
  white text on the `FF6D4D8C` fill; scrolling keeps the header visible (FR26).
- [ ] **AC21** — Each of the 13 columns has the fixed width from the FR27 table;
  Amount is right-aligned, Currency and IsSplit are centered, and Description,
  Labels and Comment wrap (FR27).
- [ ] **AC22** — The Amount cell is a real number displayed as `#,##0.00` with a
  plain minus for negatives and **no** currency symbol; the stored numeric value
  is unchanged from the unstyled output (FR28).
- [ ] **AC23** — The Date cell is a **real Excel date** (not text) showing the
  correct calendar day with **no ±1 drift** across host timezones, formatted
  `dd/mm/yyyy` (ES) or `yyyy-mm-dd` (EN) (FR29). A golden/timezone test covers
  at least UTC, UTC+13 and UTC−11.
- [ ] **AC24** — Workbook metadata contains **only** `creator`, `title`,
  `created`; a test asserts the file embeds **no** path, device/workspace id,
  user identity, filter value, or raw label, and sets no `lastModifiedBy` /
  `company` (FR30).
- [ ] **AC25** — With `useStyles: true`, a 100 000-row XLSX export stays within
  the **NFR4** memory budget and the **NFR1** time budget; an integration test
  asserts the peak-heap ceiling with styling enabled (NFR6).

### 14.8 Test-plan additions

- **Unit:** the `DEFAULT_XLSX_FORMAT` map returns the expected `dateNumFmt` /
  `amountNumFmt` per locale; the timezone-safe `YYYY-MM-DD` → Excel-date
  conversion yields the same calendar day under faked `TZ` values.
- **Integration (golden XLSX):** open the produced workbook and assert header
  font/fill/freeze, per-column widths + alignment + wrap, the amount `numFmt`,
  the date cell **type** (date, not string) + `numFmt`, the sheet name
  `Movimientos`, and the metadata allowlist (presence of `creator`/`title`/
  `created`, absence of everything else). Re-uses the existing fixture dataset
  from §9.2.
- **Memory (NFR6/AC25):** the existing 100 000-row streaming memory test runs
  with `useStyles: true` and asserts the NFR4 ceiling still holds.

### 14.9 Residual open questions (non-blocking)

1. **Brand fill hex.** `FF6D4D8C` is Mouse's proposed header fill — confirm
   against the current design-token palette before the implementation PR.
2. **EN default date format.** `yyyy-mm-dd` (unambiguous, ISO) vs `dd/mm/yyyy`
   (matches the Spain-based audience). Defaulting to ISO for EN; revisit with
   #353.
3. **Summary sheet appetite.** Whether a future summary sheet (§14.6) is wanted
   at all — parked pending pilot feedback.
