# SPEC-030 — Financial Report

> **Status:** Draft · **Owner:** Neo (architecture) — co-authored with Link (product), Switch (security), Niobe (UX), Mouse (design) · **Last updated:** 2026-06-14
> **Paired PRD:** Pending — PRD-030 reservation needed in `docs/product/prd-plan.md` (folds the existing PRD-016 "PDF report export" + PRD-018 "Reports module" reservations).
> **Paired UX:** [`docs/ux/specs/spec-030-financial-report.md`](../ux/specs/spec-030-financial-report.md)
> **Paired Design:** Pending (Mouse — report template visual fidelity to the RSE 2024 PDF).
> **Required reading (reused patterns):** [SPEC-027 Export](./027-export.md) · [SPEC-028 Audit & Evidence](./028-audit-and-evidence.md) · [`crypto-spec.md`](../security/crypto-spec.md) §8.

---

## 1. Summary

The Financial Report feature lets an NGO treasurer generate, with one click, the
**annual financial statement** they hand to the board, the external auditor, or the
tax authority — the one-page document that lists income (credits), expenses (debits),
and reconciles the opening and closing bank balance for a fiscal year. It replicates
the structure of the **RSE Financial Report 2024** PDF: a branded header with the
organisation's legal registration line, a credits table, a debits table, a balance
reconciliation block (`opening + credits − |debits| = closing`), and a signature
footer for the treasurer and the external auditor.

The report is produced **entirely from the app's existing encrypted transaction
data** — there is no new source of truth. It is an **aggregation and presentation
layer** over the same decrypt-in-main access path that SPEC-027 (Export) and
SPEC-028 (Audit & Evidence) already established: decryption and file I/O happen in
the **main process only**, the renderer never sees plaintext rows or a path string,
and every generated artifact is recorded in the signed audit log. The MVP output is
a **faithful PDF** of the template; an Excel summary sheet is a fast-follow.

## 2. Problem

Pedro (product owner and treasurer of Rett Syndrome Europe; the "María" treasurer
persona in [`docs/product/vision.md`](../product/vision.md) §2) must produce a formal
**year-end financial statement** for the board and the auditor. Verbatim brief:

> *"One feature I want to add: the ability to generate a financial report like the
> attached [RSE Financial Report 2024 PDF]. It's a gold mine!"*

Today that statement is assembled **by hand** — exporting movements (SPEC-027),
pivoting them in Excel, manually splitting income from expense, manually computing
opening/closing balances, and re-typing the header, legal line, and signature blocks
into a Word or PDF template every year. This is slow, error-prone, and defeats the
"30 seconds between phone calls" target. The data to produce the statement *already
lives in the treasury* — every transaction carries an account, a category
(with an `income`/`expense` `kind`), a subcategory, a signed amount, a date, and
labels. The report is fundamentally: **filter to a fiscal year → split credits vs
debits → group by category/subcategory → sum → reconcile against the account's
opening balance.** This spec turns that latent capability into a one-click,
audited, board-ready document.

The product already reserves this work: **PRD-016 "PDF report export"** and
**PRD-018 "Reports module"** ([`prd-plan.md`](../product/prd-plan.md) §M4). This spec
is the first concrete realisation of that reservation, scoped to the single
highest-value report Pedro named.

## 3. Users & Scenarios

**Primary persona:** **Pedro / María**, NGO treasurer — not tech-savvy, time-poor,
accountable to a board and an external auditor. (Vision §2.)

**Secondary persona:** **Board member / external auditor / tax authority** who
*receives* the PDF but never opens OpenTreasury. Their expectations (a recognisable,
signed, single-page statement with arithmetic that ties out) constrain the layout and
the number format.

- **Scenario A — Year-end statement.** Pedro opens *Informes → Informe financiero*,
  picks fiscal year **2024**, reviews the auto-built credits and debits tables and the
  reconciliation block (opening `32.162,93` + credits `9.506,21` − debits `8.647,50`
  = closing `33.021,64`), confirms the decrypted-artifact warning, and saves
  `OpenTreasury-Informe-Financiero-2024.pdf` to his Documents folder. He prints it,
  signs it, and posts it to the auditor.
- **Scenario B — Auditor hand-off.** The external auditor (Bahadir, Türkiye) asks for
  the 2024 statement. Pedro generates the PDF; the footer already carries both
  signature blocks (Treasurer — Spain; Auditor — Türkiye) with name, role, place and
  date placeholders and signature-image slots.
- **Scenario C — Mid-year board update.** Pedro generates a report for an **arbitrary
  date range** (Jan–Jun) to show the board where the accounts stand half-way through
  the year. Opening balance is the account balance at the range start; closing is the
  balance at the range end.
- **Scenario D — Multi-account NGO.** The NGO holds two bank accounts. Pedro generates
  one consolidated report (all accounts, single opening/closing pair) — or, if he
  picks a single account, a per-account statement. (See OQ4.)
- **Scenario E — Uncategorised / unclassified data.** Some 2024 transactions have no
  category, or a category with no `kind`. The report surfaces them in an explicit
  **"Sin clasificar / Unclassified"** line item rather than silently dropping them, so
  the totals always reconcile to the bank balance.
- **Scenario F — Locked-but-encrypted workspace.** Pedro tries to generate a report on
  a workspace that is encrypted but not unlocked. The feature refuses (mirrors
  SPEC-027 FR14 policy) — no decryption without an unlocked master key.

## 4. Requirements

### 4.1 Functional

- **FR1 — Entry point.** A new **`Informes` / `Reports`** section in the sidebar
  (UX-006 navigation) routes to `/reports`, whose v1 content is a single
  **Financial Report** generator. Lucide `FileText` icon. (If Pedro prefers, the
  generator can live directly as `Informe financiero` — see UX spec.)
- **FR2 — Period selection (required).** The user selects a reporting period before
  anything is generated (list-starts-empty rule, per SPEC-027 FR2). v1 offers a
  **fiscal-year picker** (calendar year by default) **and** a **custom date range**.
  The configurable fiscal-year start is OQ5.
- **FR3 — Header block.** The report header renders: organisation name + logo, the
  legal registration line (e.g. *"Association sans but lucratif — RCS Luxembourg
  F1819"*), postal address, contact email, and the title **"Financial Report {year}"** /
  **"Informe financiero {año}"**. These values are sourced from **organisation/profile
  settings** (OQ6), with at-generation-time overrides.
- **FR4 — Credits (income) table.** All transactions in the period classified as
  **income** are grouped into line items (one row per group), each a **label +
  positive amount**, ending in a bold **TOTAL** row. Example fidelity target:
  `Membership fees 2024 → 4.650,00`, `Donations and grants → 4.856,21`,
  **TOTAL → 9.506,21**.
- **FR5 — Debits (expenses) table.** All transactions in the period classified as
  **expense** are grouped into line items shown as **negative amounts**, ending in a
  bold **TOTAL** row (e.g. `−8.647,50`). The template breaks
  *Event/Conference Expenses* out per event/location — this maps to **subcategories**
  (see FR7, OQ3).
- **FR6 — Income vs expense classification.** A line item is a credit or a debit
  according to its category's **`kind` field** (`income` | `expense`), which already
  exists on `CategoryRecord` (`app/src/shared/ipc-contracts/categories.ts`).
  **Fallback (assumption, pending OQ2):** where `kind` is absent (legacy categories)
  or the transaction is uncategorised, classification falls back to the **sign of the
  amount** (positive → credit, negative → debit), and the line item is grouped under
  an explicit **"Sin clasificar / Unclassified"** label so totals still reconcile.
- **FR7 — Grouping granularity.** Default grouping is **by category**. Where a category
  has subcategories with movements in the period, the report **breaks that category
  out into its subcategory line items** (mirroring the template's per-event expense
  breakdown), with the category acting as a subtotal header. Pure category-level
  grouping is selectable. (OQ3.)
- **FR8 — Balance reconciliation block.** Below the two tables, the report renders:
  - **"Balance of account 01.01.{year}"** — the **opening balance** = each account's
    stored `openingBalance` (`accounts.ts`) **plus** the net of all movements **dated
    before the period start** (a running balance). For a custom range, "01.01.{year}"
    is replaced by the range-start date.
  - **Credits {period}** and **Debits {period}** — the two table totals.
  - **"Balance of account 31.12.{year}"** — the **closing balance**
    = `opening + credits − |debits|`. The arithmetic MUST tie out exactly
    (`32.162,93 + 9.506,21 − 8.647,50 = 33.021,64`).
- **FR9 — Signature footer.** Two signature blocks, each with **name, role, place,
  date, and a signature-image slot**: a **Treasurer** block
  (e.g. *"Spain, {date}, Pedro Rocha, Treasurer RSE"*) and an external **Auditor**
  block (e.g. *"Türkiye, Bahadir Dinler"*). Values come from org/profile settings or
  are entered at generation time (OQ6); signature-image handling is OQ6/§8.
- **FR10 — European number format.** Amounts use the **active app locale's** European
  format — `.` thousands separator, `,` decimal — consistent with SPEC-027's
  locale-aware decisions. Currency symbol handling follows the active locale (OQ9).
- **FR11 — Output format (MVP = PDF).** v1 produces a **PDF** that visually
  replicates the template. The generator mechanism is OQ1 (headless print of an HTML
  template in main vs a PDF library in main vs renderer print-to-PDF). An **XLSX
  summary sheet** is a defined fast-follow (FR18, deferred).
- **FR12 — On-screen preview.** Before saving, the renderer shows a **preview built
  from already-projected, non-secret aggregates** (line-item labels + rounded
  amounts), not from raw decrypted rows — so no new plaintext surface is created
  (mirrors SPEC-027's "no preview rows" stance, but aggregates are safe to show).
- **FR13 — Save dialog (main process).** On *Generate*, main opens
  `dialog.showSaveDialog` defaulting to the OS **Documents** folder (never the dataset
  root, never `os.tmpdir()`). Default filename:
  `OpenTreasury-Informe-Financiero-{year}.pdf` (ES) /
  `OpenTreasury-Financial-Report-{year}.pdf` (EN). (FR13 reuses SPEC-027 FR12–FR13.)
- **FR14 — Encrypted-workspace guard.** Reuse SPEC-027 FR14 verbatim: the chosen path
  may not resolve inside the active dataset root; an encrypted-but-locked workspace
  cannot generate a report at all (Scenario F). Hard block, no "Save anyway".
- **FR15 — Pre-generation confirmation.** Because the PDF is a **decrypted artifact**,
  the user passes the same class of confirmation modal as SPEC-027 FR15 (the file will
  be unencrypted, may be indexed/synced, is the user's responsibility). Whether the
  typed-word confirmation (`EXPORTAR`/`EXPORT`) is reused, softened, or dropped for
  reports is OQ8.
- **FR16 — Atomic write + streaming.** Reuse SPEC-027 FR16–FR17: write to a sibling
  temp file in the destination directory and atomically rename; decrypt streaming,
  zeroise plaintext buffers. Report aggregation, however, requires a **full pass** over
  the period's movements before totals are known — memory bound is on aggregates, not
  raw rows (NFR4).
- **FR17 — Audit entry first.** Before any byte is written, main appends a **signed
  audit entry** for the report generation (proposed `action: "report.generate"`),
  with an `after_hash` over the canonical-JSON of the report **parameters** (period,
  account scope, grouping mode, format) — never over plaintext content. (OQ8; mirrors
  SPEC-027 FR18 and SPEC-028 audit-chain.) New action enum value added to
  `crypto-spec.md` §8.2 in the implementing PR.
- **FR18 — XLSX summary (deferred fast-follow).** A single-sheet workbook mirroring the
  credits/debits/reconciliation structure, written via the SPEC-027 streaming XLSX
  writer. Defined here for scope clarity; **out of v1 MVP** (see §11).
- **FR19 — Locale-aware copy.** All user-visible strings and the report body honour the
  active locale (ES primary, EN pilot-ready), per the M0 i18n foundation.
- **FR20 — Reconciliation guarantee.** The generator MUST assert
  `opening + Σcredits − |Σdebits| == closing` before producing output; a mismatch
  (e.g. floating-point drift, missing movements) blocks generation with a diagnostic
  rather than emitting an unbalanced statement. Money math uses the existing
  integer-minor-unit / decimal discipline used by Saldo, not native floats.

### 4.2 Non-functional

- **NFR1 — Performance.** Generating a one-year report over a 10 000-movement dataset
  completes in **< 5 s** for PDF on the perf-baseline machine (i5-class, 16 GB).
- **NFR2 — Offline behaviour.** Fully offline — operates on the local read model and
  the in-memory master key; writes to a local path. No network (Vision §7 Principle 5).
  External-timestamping of the report (SPEC-028 RFC-3161) is **not** in scope.
- **NFR3 — Accessibility.** The generator UI is WCAG 2.1 AA: keyboard-reachable period
  picker, format choice, preview, and confirmation modal; `aria-live` status updates.
  The PDF itself targets tagged-PDF/readable-order on a best-effort basis (OQ1).
- **NFR4 — Memory bound.** Aggregation holds per-line-item subtotals, not the full
  decrypted dataset; peak heap stays within the SPEC-027 NFR4 envelope (+150 MB over
  baseline) even for the largest pilot dataset.
- **NFR5 — Privacy of process logs.** No PII, amounts, donor names, or filter values in
  logs — counts and bytes only (R15). The audit `after_hash` covers parameters, not
  content.
- **NFR6 — Determinism.** The same dataset + same parameters produces a byte-stable
  report body (modulo the generation timestamp/signature), so two auditors regenerating
  it get the same figures.

## 5. UX Notes

Full flows live in the paired UX spec
([`docs/ux/specs/spec-030-financial-report.md`](../ux/specs/spec-030-financial-report.md)).
Architecture-constraining points:

- **List-starts-empty.** No period selected → nothing generated, *Generate* disabled.
- **Preview is over aggregates, not rows.** The renderer renders the line-item table
  from a `ReportModel` of labels + amounts returned by main; it never receives
  transaction-level plaintext. This keeps the renderer-isolation guarantee intact while
  still giving Pedro a true WYSIWYG preview.
- **The template is the design contract.** Mouse owns pixel fidelity to the RSE 2024
  PDF (header lockup, legal line, table rules, bold TOTAL rows, two-column signature
  footer). The HTML/print template (if OQ1 picks that route) lives under a
  main-process-owned template asset, not in renderer routes.
- **Header/footer editing.** Org details and signatory blocks are pre-filled from
  settings and editable in a side panel before generation (OQ6).

## 6. Data Model

### 6.1 Domain events

This spec is **read-only over transaction/category/account event data** — it
introduces **no new domain events** for transactions, splits, accounts, categories,
or labels. It emits **one new audit event** consumed by the existing audit-log
subsystem (SPEC-028):

| Event type | Fields | Produced by | Consumed by |
|---|---|---|---|
| `audit.report` | `{ action: "report.generate", actor_device_id, actor_user_identity, target_ref: { type: "report", id: <ULID> }, after_hash: BLAKE2b-256, ts, signature_ed25519 }` | Main-process `reportService` (before file I/O) | Audit-log writer; SPEC-028 audit viewer |

`after_hash` is computed over a canonical-JSON serialization of the **report
parameters** (never the content):

```jsonc
{
  "format": "pdf|xlsx",
  "periodKind": "fiscal-year|custom-range",
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD",
  "accountIds": ["<ULID>", ...],   // sorted; empty = all accounts (consolidated)
  "grouping": "category|category-subcategory"
}
```

The `action` enum in `crypto-spec.md` §8.2 must gain `"report.generate"` (added in the
implementing PR; Switch pre-review — OQ8). This mirrors the SPEC-027 precedent for
adding `"export.xlsx"`.

### 6.2 Read-model projections

**No new persisted projections.** The report aggregator reuses:

- The existing in-memory **movements** read model (`MovementRecord`) used by Movements.
- The **Saldo aggregation** read model (`app/src/shared/ipc-contracts/saldo.ts`),
  which already nets income/expense **by category and subcategory** per period — the
  natural backbone for the credits/debits tables.
- The **category** read model with its `kind` field for income/expense classification.
- The **account** read model with `openingBalance` for the reconciliation block.
- The existing **date-range query extension**
  (`.squad/skills/date-range-query-extension/SKILL.md`) for period filtering.
- The **read-model aggregation skill** (`.squad/skills/read-model-aggregation/SKILL.md`)
  for grouping/subtotalling — do **not** create a parallel pipeline.

If aggregation needs a fan-out beyond what Saldo returns (e.g. running balance before
period start), extend those queries via the aggregation skill rather than adding a new
read model.

### 6.3 File layout on OneDrive

**Nothing new under the dataset root.** The generated PDF/XLSX is written to a
**user-chosen path outside the encrypted workspace** (Documents by default). It is not
part of the dataset, is not encrypted, is not indexed by ULID, and is never re-read by
OpenTreasury. The encrypted-workspace guard (FR14) actively prevents writing into the
dataset root. **Open issue:** signature images — if sourced from org settings — may need
to live *inside* the encrypted store (an `org-profile` record) rather than as loose
files; see §8 and OQ6.

## 7. IPC Surface

Two new channels, each Zod-validated at the boundary (R12, C13). Schemas live under
`app/src/shared/ipc-contracts/report.ts`.

| Channel | Direction | Payload schema | Response schema |
|---|---|---|---|
| `report:build` | renderer → main | `ReportBuildRequest` | `ReportBuildResponse` |
| `report:generate` | renderer → main | `ReportGenerateRequest` | `ReportGenerateResponse` |

- `report:build` — main aggregates the period and returns a **non-secret `ReportModel`**
  (line-item labels, subtotals, totals, opening/closing balances, header/footer field
  values) for the renderer preview. No transaction-level rows cross IPC.
  ```ts
  ReportBuildRequest = {
    periodKind: "fiscal-year" | "custom-range",
    periodStart: ISODate,           // required
    periodEnd: ISODate,             // required
    accountIds?: ULID[],            // empty/undefined = all (consolidated)
    grouping: "category" | "category-subcategory"
  }
  ReportBuildResponse =
    | { ok: true, model: ReportModel, confirmationToken: string /* one-shot, TTL ≤ 60s */ }
    | { ok: false, code: "CE-XXX" }
  ```
- `report:generate` — the renderer sends **only** the `confirmationToken` (and the
  chosen format); main reconstructs the parameters from the token, opens the save
  dialog, writes the audit entry, then the file (SPEC-027 §3.2 token pattern).
  ```ts
  ReportGenerateRequest = { confirmationToken: string, format: "pdf" /* | "xlsx" deferred */ }
  ReportGenerateResponse =
    | { ok: true, basename: string }
    | { ok: false, code: "CE-XXX" }
    | { ok: false, code: "USER_CANCELLED_DIALOG" }
    | { ok: false, code: "REPORT_DEST_INSIDE_WORKSPACE" }
  ```

**Forbidden in either schema:** any path string from the renderer, any master-key
material, any recovery-phrase fragment, any transaction-level plaintext row. Schema
violations are rejected at the boundary (R12, C13). `ReportModel` carries **aggregates
only** (labels + amounts that the user is about to print anyway), never raw rows.

## 8. Security Considerations

This feature produces a **decrypted artifact** from encrypted data, so it inherits the
SPEC-027 security envelope. It introduces **no new cryptographic primitive**.

- **AEAD primitive (R3 / crypto-spec §1.1, §2.1).** Reads reuse `sodium-native`
  XChaCha20-Poly1305 decryption with the same per-file AAD as the encrypt path.
  Tampered ciphertext → hard fail, no partial file.
- **Key handling (crypto-spec §2).** Uses the **in-memory Master Key already loaded at
  unlock**. No new key, no new wrap, no Argon2id derivation. An encrypted-but-locked
  workspace cannot generate a report (FR14, Scenario F).
- **Process boundaries (R11, C6).** All decryption and aggregation stay in
  `app/src/core/**` / `app/src/main/services/reportService.ts`; all file I/O and the
  PDF/print step stay in main. The renderer's `tsconfig` continues to forbid imports
  from `src/main/` and `src/core/crypto/`; the existing `no-restricted-imports` ESLint
  gate covers the new module.
- **No plaintext rows to renderer.** The renderer receives a `ReportModel` of
  **aggregates** (line-item labels + amounts) plus basenames and CE-XXX codes only.
  Transaction-level rows never cross IPC. (Aggregated totals are inherently part of the
  document the user is about to publish.)
- **No path strings from renderer (R12).** Save destination resolved by
  `dialog.showSaveDialog` in main; validated to reject paths escaping the chosen
  directory (R18), UNC/network paths unless confirmed, and **any path inside the active
  dataset root** (hard block, FR14).
- **No temp files in `%TEMP%` (R6).** Partial file written in the destination directory
  and renamed atomically (FR16).
- **In-memory hygiene.** `try/finally` zeroises Buffers holding decrypted payloads after
  aggregation and on the failure path.
- **Audit logging (R8, crypto-spec §8.2/§8.3).** A signed `report.generate` audit entry
  is appended **before** the first byte (FR17); `after_hash` covers the canonical-JSON
  **parameters**, never plaintext content. Failures are logged with `result: "failed"`
  to the audit chain and local diagnostics (SPEC-027 precedent). **Open:** confirm with
  Switch that report generation warrants an audit entry equal in weight to export — it
  produces a decrypted artifact, so the assumption is **yes** (OQ8).
- **PII redaction in logs (R15).** `reportService` logs only counts and byte sizes;
  org/donor/category names and amounts are PII-equivalent and redacted; paths logged as
  basename only.
- **Input validation (R17).** All renderer-supplied parameters (ULIDs, ISO dates,
  enums) are Zod-validated at the boundary; invalid input → CE-XXX.
- **Signature images — open risk.** If signature images are stored in org/profile
  settings, they may need to live **inside the encrypted store** (an `org-profile`
  record under the dataset root, AEAD-enveloped per crypto-spec §2.1 with AAD binding
  `record_type=org_profile`) rather than as loose plaintext files. This touches Switch's
  domain and is flagged as OQ6 / a §11 dependency. Until resolved, the assumption is:
  signature images are referenced from settings and embedded into the PDF in main only.
- **What the spec is NOT promising.** It does not encrypt the generated PDF, prevent the
  user from emailing it, or control OS indexing of the destination — the pre-generation
  modal discloses this (FR15), reusing SPEC-027 §2.6 language.

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- `classifyLineItem(tx, category)` — returns `credit`/`debit` from `category.kind`;
  falls back to amount sign and `Unclassified` grouping when `kind` is absent (FR6).
- `aggregateReport(movements, accounts, params)` — groups by category /
  category→subcategory, computes credit/debit subtotals and totals (FR4, FR5, FR7).
- `computeOpeningBalance(accounts, movementsBeforeStart)` — `Σ openingBalance + Σ net
  before period start` (FR8).
- `assertReconciles(opening, credits, debits, closing)` — exact equality on minor units;
  rejects float drift (FR20).
- `formatEuropeanAmount(value, locale)` — `.` thousands, `,` decimal; negative debit
  rendering (FR10).
- `buildDefaultReportFilename(params, locale)` — ES/EN prefixes, fiscal-year vs range.
- `buildCanonicalReportParamsJson(params)` — deterministic ordering for `after_hash`.
- `validateReportRequest(input)` — Zod rejects path strings, bad ULIDs, missing period.

### 9.2 Integration (Vitest, in-memory storage adapter)

- Golden-fixture dataset reproducing the RSE 2024 figures: credits TOTAL `9.506,21`,
  debits TOTAL `−8.647,50`, opening `32.162,93`, closing `33.021,64` — assert the
  generated `ReportModel` matches exactly and reconciles.
- `report:build` → `report:generate` round-trip; confirmationToken single-use and
  TTL-expiring.
- Audit entry written **before** the first byte; on forced fs failure the audit entry
  persists with `result: "failed"` and no partial file remains.
- Encrypted-but-locked workspace → generation refused (Scenario F).
- Uncategorised / `kind`-less movements surface in an `Unclassified` line and totals
  still reconcile (Scenario E).
- Multi-account consolidated vs single-account scoping (Scenario D / OQ4).

### 9.3 E2E (Playwright against built Electron binary)

- Happy path: route to `/reports` → pick fiscal year 2024 → preview renders credits /
  debits / reconciliation → confirm modal → save dialog → success → PDF exists on disk.
- Empty start: no period → *Generate* disabled, prompt visible.
- Encrypted-workspace guard: user picks the workspace folder → path rejected, dialog
  re-opens.
- Cancel in save dialog: no audit entry, screen state intact.
- Failure path: forced fs failure → CE-XXX, partial absent, audit `result: "failed"`.
- Accessibility: axe-core passes on `/reports` in every state; full keyboard flow;
  screen-reader announces the preview totals and the busy state.

## 10. Acceptance Criteria

- [ ] **AC1** — A `Informes` / `Reports` sidebar entry routes to `/reports`, whose v1
  content is the Financial Report generator (FR1).
- [ ] **AC2** — `/reports` opens with no period selected and *Generate* disabled (FR2).
- [ ] **AC3** — Selecting fiscal year 2024 on the RSE golden fixture produces credits
  TOTAL `9.506,21`, debits TOTAL `−8.647,50`, and a reconciliation block with opening
  `32.162,93` and closing `33.021,64` that ties out exactly (FR4, FR5, FR8, FR20).
- [ ] **AC4** — Line items derive credit/debit from `category.kind`; legacy/uncategorised
  movements appear under `Unclassified` and totals still reconcile (FR6).
- [ ] **AC5** — `category-subcategory` grouping breaks a category into its subcategory
  line items with a category subtotal; `category` grouping does not (FR7).
- [ ] **AC6** — The header renders org name/logo, legal registration line, address,
  email, and the localized title; the footer renders both signatory blocks with
  name/role/place/date/signature slots (FR3, FR9).
- [ ] **AC7** — Amounts render in European format (`.` thousands, `,` decimal) per the
  active locale (FR10).
- [ ] **AC8** — A successful generation writes a PDF to a user-chosen path; the default
  is the OS Documents folder, never the dataset root or `os.tmpdir()` (FR11, FR13).
- [ ] **AC9** — Choosing a destination inside the active dataset root refuses the path
  and re-opens the save dialog; an encrypted-but-locked workspace cannot generate (FR14).
- [ ] **AC10** — A signed `report.generate` audit entry is written **before** any output
  byte; on forced fs failure the entry persists and no partial file remains (FR17).
- [ ] **AC11** — The renderer never receives transaction-level plaintext; static analysis
  confirms `src/renderer/**` has no imports from `src/main/**` or `src/core/crypto/**`
  (R11, C6).
- [ ] **AC12** — IPC validation rejects path strings, missing period, and non-ULID ids
  with CE-XXX (R12, R17).
- [ ] **AC13** — Logs in the report module emit no PII, amounts, or filter values
  (R15).
- [ ] **AC14** — Performance: a one-year report over a 10 000-movement dataset generates
  in < 5 s on the perf-baseline machine (NFR1).
- [ ] **AC15** — Accessibility: axe-core passes on `/reports` in every state in the
  paired UX spec.

## 11. Traceability

- **PRD:** PRD-030 (to be reserved in [`docs/product/prd-plan.md`](../product/prd-plan.md);
  folds **PRD-016 "PDF report export"** and **PRD-018 "Reports module"**, M4).
- **ADRs:** [ADR-001](../architecture/adr-001-tech-stack.md),
  [ADR-002](../architecture/adr-002-repo-structure.md).
- **ADR-001 conditions satisfied:** C1 (AEAD reuse on read), C2 (AAD discipline on
  decrypt), C5 (DEK/MK in main only), C6 (renderer isolation), C10 (signed audit entry),
  C11 (no PII in any persisted filename — the export filename is user-chosen and lives
  outside the dataset), C13 (IPC Zod validation).
- **Security requirements satisfied:** R3, R6, R8, R11, R12, R15, R17, R18.
- **Crypto-spec sections:** §1.1 (AEAD primitive), §2 (key hierarchy — MK reuse), §2.1
  (per-file AAD on decrypt; org-profile record if signature images are stored — OQ6),
  §8.2 (audit `action` enum: add `report.generate`), §8.3 (audit-export precedent),
  §11 gates `[NO-DIY]`, `[AUDIT-CHAIN]`, `[RENDERER-ISO]`.
- **Related specs:**
  - [SPEC-027 Export](./027-export.md) — decrypt-in-main, confirmation-token, audit-first,
    atomic-write, encrypted-workspace-guard, locale/number patterns are reused wholesale.
  - [SPEC-028 Audit & Evidence](./028-audit-and-evidence.md) — the `report.generate`
    entry joins the signed audit chain and surfaces in the audit viewer.
  - [SPEC-023 Split Transactions](./023-split-transactions.md) — split children are netted
    into category/subcategory subtotals like any other movement.
  - [SPEC-026 Encryption at Rest](./026-encryption-at-rest.md) — defines the MK and the
    dataset root used by the encrypted-workspace guard.
- **Read models / contracts reused:** `saldo.ts` (income/expense net by category &
  subcategory), `categories.ts` (`kind`), `accounts.ts` (`openingBalance`),
  `movements.ts`, `transaction-splits.ts`.
- **Skills referenced:** `.squad/skills/date-range-query-extension/SKILL.md`,
  `.squad/skills/read-model-aggregation/SKILL.md`,
  `.squad/skills/spec-to-subissues/SKILL.md`.
- **Paired UX:** [`docs/ux/specs/spec-030-financial-report.md`](../ux/specs/spec-030-financial-report.md).
- **Paired Design:** Pending Mouse template-fidelity pass.
- **Supersedes / Superseded by:** —

## 12. Open Questions

Numbered for easy reply (Pedro). Each carries the drafter's **best-guess assumption**,
already reflected in the spec body; confirming or overriding them moves this spec
Draft → In Review → Accepted.

1. **Output format / generator.** MVP is a faithful **PDF**. Which mechanism do you
   prefer: (a) a main-process **HTML template printed to PDF** via Electron's
   `webContents.printToPDF` (best template fidelity, reuses CSS, our recommendation),
   (b) a **PDF library** in main (e.g. pdfkit — more code, less CSS fidelity), or
   (c) renderer **print-to-PDF**? And do you also want the **Excel summary sheet** in
   v1, or as a fast-follow? *Assumption: (a) HTML→printToPDF for v1 PDF; XLSX deferred.*
2. **Income vs expense classification.** Categories already carry an optional
   `kind` (`income`/`expense`). Confirm we classify line items by `kind`, and for
   **legacy categories without `kind`** (and uncategorised transactions) we fall back to
   the **amount sign** and group them under an explicit **"Unclassified"** line.
   *Assumption: yes — `kind` first, sign + Unclassified fallback.* Alternatively, should
   v1 **require** every category to have a `kind` before a report can be generated?
3. **Line-item grouping granularity.** Default is **by category**, automatically broken
   out into **subcategories** where they exist (matching the template's per-event expense
   breakdown). Is category→subcategory the right default, or do you want category-only
   with an optional drill-down? *Assumption: category, auto-expanded to subcategories.*
4. **Multi-account.** For an NGO with more than one bank account, do you want **one
   consolidated report** (single opening/closing pair across all accounts) by default,
   **per-account sections** in one document, or a **per-account report** when a single
   account is selected? *Assumption: consolidated by default; per-account when one
   account is picked.*
5. **Period selection.** Is **calendar-year** sufficient for v1, or do you need a
   **configurable fiscal-year start** (e.g. Apr–Mar) and/or arbitrary date ranges?
   *Assumption: calendar-year picker + custom date range in v1; configurable fiscal-year
   start deferred.*
6. **Header / footer source & signature images.** Should org details (name, logo, legal
   registration line, address, email) and the signatory blocks (treasurer + auditor:
   name, role, place, date, **signature image**) come from **organisation/profile
   settings** (entered once, reused yearly) or be **entered at generation time**? And
   where should **signature images** live — inside the **encrypted store** (an
   `org-profile` record, which is the safer default) or as referenced files? *Assumption:
   sourced from org settings with at-generation overrides; signature images stored
   inside the encrypted store pending Switch's ruling.*
7. **Reconciliation label typo in the source PDF.** The RSE 2024 reconciliation block is
   labelled **"Credits 2023 / Debits 2023"** while the report is for **2024** and the
   figures are the 2024 totals. We read this as a **typo** and will label the
   reconciliation lines with the **report year** (2024). Confirm the intended labelling.
   *Assumption: label = the report year.*
8. **Confirmation & audit policy.** A generated report is a **decrypted artifact** like
   an export. Should generation (a) require the same **typed-word confirmation** as
   Export (`EXPORTAR`/`EXPORT`), and (b) write a **signed audit-log entry**
   (`report.generate`)? *Assumption: yes to a signed audit entry; confirmation modal yes
   but the typed-word step can be softened for reports — your call.*
9. **Locale / currency.** Confirm the **European number format** (`.` thousands, `,`
   decimal) follows the **active app locale**, and how the **currency symbol** should be
   shown (e.g. `9.506,21 €` vs `€ 9.506,21` vs none). *Assumption: active-locale European
   format; `€` suffix with a non-breaking space.*
10. **v1 scope / MVP boundary.** Proposed **in v1:** single-year (or custom-range) PDF
    statement matching the template, consolidated or per-account, credits/debits/
    reconciliation/signatures. Proposed **deferred:** XLSX summary, multi-year comparison
    columns, per-project/per-label breakdowns, charts/graphs, and external RFC-3161
    timestamping of the report. Confirm this boundary.

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-06-14 | Draft | Neo (with Link/Switch/Niobe/Mouse) | Initial draft — replicates RSE Financial Report 2024 template as an aggregation/presentation layer over SPEC-027/028 decrypt-in-main access. 10 numbered Open Questions for Pedro. |
