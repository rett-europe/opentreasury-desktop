# SPEC-030 — Financial Report

> **Status:** Accepted · **Owner:** Neo (architecture) — co-authored with Link (product), Switch (security), Niobe (UX), Mouse (design) · **Last updated:** 2026-06-14
> **Reviewers:** Neo (architecture) ✅ · Switch (security) ✅ · Link (product) ✅ · Niobe (UX) ✅ · Mouse (design) ✅ — all approved 2026-06-14; Mouse design-fidelity pass complete 2026-06-14; Pedro signed off scope.
> **Paired PRD:** Pending — PRD-030 reservation needed in `docs/product/prd-plan.md` (folds the existing PRD-016 "PDF report export" + PRD-018 "Reports module" reservations).
> **Paired UX:** [`docs/ux/specs/spec-030-financial-report.md`](../ux/specs/spec-030-financial-report.md)
> **Paired Design:** [`docs/design/030-financial-report.md`](../design/030-financial-report.md) (Mouse — report template visual fidelity to the RSE 2024 PDF).
> **Required reading (reused patterns):** [SPEC-027 Export](./027-export.md) · [SPEC-028 Audit & Evidence](./028-audit-and-evidence.md) · [`crypto-spec.md`](../security/crypto-spec.md) §8 · the existing aggregation layer in `app/src/core/query/` (`queries.ts`, `saldo.ts`, `types.ts`).

> **Architectural anchor:** The Financial Report is structurally the **same** as the existing **Balance / Panel ("Saldo")** screen — income/expense/net aggregation over the transaction read model. It MUST be built on the existing `app/src/core/query/` layer, **not** on new summation logic. The Credits/Debits TOTALs ARE `getRangeKPIs(from, to)` over the fiscal-year range; classification is the first-class `Transaction.type` field; opening/closing balances come from the event-sourced `ConfigAccount.openingBalance`. See §6.2 for the exact reuse map.

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
layer** over the **existing `core/query` aggregation engine** that already powers the
Balance/Panel screen, reached through the same decrypt-in-main access path that
SPEC-027 (Export) and
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
lives in the treasury* — every transaction carries an account, an explicit
**`type` (`income` | `expense`)**, a category, a subcategory, a (always-positive)
amount, a date, and labels — and the **`core/query` engine already sums it**
(`getRangeKPIs`, `getAccountBalancesInRange`) for the Panel screen. The report is
fundamentally: **filter to a fiscal year → split credits vs debits by `tx.type` →
group by category/subcategory → sum → reconcile against the account's
event-sourced opening balance.** This spec turns that latent capability into a
one-click, audited, board-ready document.

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
  date lines and a **blank signature area** — the auditor signs the finished PDF
  externally; the app stores no signature image.
- **Scenario C — Mid-year board update.** Pedro generates a report for an **arbitrary
  date range** (Jan–Jun) to show the board where the accounts stand half-way through
  the year. Opening balance is the account balance at the range start; closing is the
  balance at the range end.
- **Scenario D — Multi-account NGO.** The NGO holds two bank accounts. By default Pedro
  generates **one consolidated report** across all accounts (a single opening/closing
  pair summed across the selected accounts) — or he **picks a single account** for a
  per-account statement with that account's own opening/closing balances. *(Resolved
  2026-06-14 — Pedro: "it's multi-account, but I guess we can pick one.")*
- **Scenario E — Uncategorised data.** Some 2024 transactions have no category. They
  are still classified as credit or debit by their **`tx.type`** (the type is always
  present), and surfaced under an explicit **"Sin clasificar / Unclassified"** line
  item within the correct table — never silently dropped — so the totals always
  reconcile to the bank balance.
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
  **calendar-year picker** **and** an **arbitrary custom date range**. A configurable
  fiscal-year start (e.g. Apr–Mar) is **deferred** to a later version. *(Resolved
  2026-06-14 — Pedro: calendar-year + custom range in v1.)*
- **FR3 — Header block.** The report header renders: organisation **name + logo**, the
  legal registration line (e.g. *"Association sans but lucratif — RCS Luxembourg
  F1819"*), postal address, contact email, and the title **"Financial Report {year}"** /
  **"Informe financiero {año}"**. All values, **including the logo**, are sourced from
  **organisation/profile settings**, with at-generation-time overrides. The **logo** is
  a non-sensitive branding asset stored as an ordinary **org setting** — it does **not**
  need to live in the encrypted treasury store (Switch to confirm; default = org-settings
  asset). *(Resolved 2026-06-14 — Pedro: "it would be great to have a logo!")*
- **FR4 — Credits (income) table.** All transactions in the period with
  `type === 'income'` are grouped into line items (one row per group), each a
  **label + positive amount**, ending in a bold **TOTAL** row. Example fidelity target:
  `Membership fees 2024 → 4.650,00`, `Donations and grants → 4.856,21`,
  **TOTAL → 9.506,21**.
- **FR5 — Debits (expenses) table.** All transactions in the period with
  `type === 'expense'` are grouped into line items shown as **negative amounts**,
  ending in a bold **TOTAL** row (e.g. `−8.647,50`). The template breaks
  *Event/Conference Expenses* out per event/location — this maps to **subcategory-level
  grouping** when the user selects it (see FR7).
- **FR6 — Income vs expense classification (settled).** A transaction is a **credit**
  or a **debit** according to its first-class **`Transaction.type`** field
  (`'income' | 'expense'`), exactly as the Panel/Saldo screen already classifies it.
  This is **not** derived from the amount sign (amounts are always stored positive) and
  **not** from a category flag. The Credits table sums `type === 'income'`; the Debits
  table sums `type === 'expense'` and renders the totals negated for display. Split
  children inherit the parent transaction's `type` (their category may differ, but the
  income/expense direction is the parent's). **Resolved — no Open Question.**
- **FR7 — Grouping-level selector (user choice at generation time).** The user picks
  the line-item grouping level on the generation screen via a **grouping-level selector**
  control: **Category** (default) or **Category → Subcategory**. It is **not** automatic.
  At **Category** level, each line item is a category total. At **Category → Subcategory**
  level, each category breaks out into its subcategory line items (matching the
  template's per-event expense breakdown) with the category as a subtotal header.
  Uncategorised movements group under "Unclassified" within their `type`'s table.
  **Both levels MUST still reconcile to the same period totals** for the selected account
  scope (`getRangeKPIs(from, to)` for all-accounts/consolidated mode; the account-scoped
  income/expense from `getAccountBalancesInRange(from, to)` for single-account mode) —
  changing the grouping level changes only the row breakdown, never the TOTALs. *(Resolved
  2026-06-14 — Pedro: "I would give the option to the user to choose the level… it might
  significantly affect the format.")*
- **FR8 — Balance reconciliation block.** Below the two tables, the report renders:
  - **"Balance of account 01.01.{year}"** — the **opening balance** = each account's
    event-sourced `ConfigAccount.openingBalance` (set on `AccountCreated.openingBalance`
    and adjustable via `AccountUpdated.changes.openingBalance` — the Balance Adjustment
    modal) **plus** the net (`income − expense`) of all movements **dated before the
    period start** (a running balance). For a custom range, "01.01.{year}" is replaced
    by the range-start date.
  - **Credits {year}** and **Debits {year}** — the two table totals
    (= the selected scope's period income and expense). **Label note:** the source RSE
    2024 PDF labels these lines "Credits 2023 / Debits 2023" while reporting 2024 figures;
    that is treated as a **typo** — OpenTreasury labels the reconciliation lines with the
    **report year** (the period's year, or the range for custom periods). *(Resolved
    2026-06-14 — Pedro: label with the report year.)*
  - **"Balance of account 31.12.{year}"** — the **closing balance**
    = `opening + credits − debits`. The arithmetic MUST tie out exactly
    (`32.162,93 + 9.506,21 − 8.647,50 = 33.021,64`). **Source settled — no Open
    Question.**
- **FR9 — Signature footer (printed blocks only — no in-app signing).** The PDF prints
  two **signature blocks**: a **Treasurer** block (e.g. *"Spain, {date}, Pedro Rocha,
  Treasurer RSE"*) and an external **Auditor** block (e.g. *"Türkiye, Bahadir Dinler"*),
  each rendering **signatory name, role, place, date line + a blank signature area** for
  a wet/external signature. The app does **NOT** embed, capture, upload, or store any
  signature image — **the auditor signs the finished PDF externally** (on paper or in
  their own PDF tooling). There is therefore **no signature-image asset and no
  encrypted-store-for-signatures requirement**. Signatory names/roles/places come from
  **org/profile settings** with at-generation overrides. *(Resolved 2026-06-14 — Pedro:
  "the signature is done outside the app, in the PDF file by an external auditor.")*
- **FR10 — European number format.** Amounts use the **active app locale's** European
  format — `.` thousands separator, `,` decimal — consistent with SPEC-027's
  locale-aware decisions. Currency is rendered as **`9.506,21 €`** (the `€` symbol as a
  **suffix**, preceded by a non-breaking space). *(Resolved 2026-06-14 — Pedro.)*
- **FR11 — Output format (PDF only in v1).** v1 produces **only a PDF**, generated by a
  **main-process HTML template rendered to PDF via Electron `webContents.printToPDF`**
  (best template fidelity, reuses CSS, runs in an offscreen main-owned `BrowserWindow`
  that never loads renderer/user routes). An **XLSX summary sheet** is **deferred** to a
  later version (see FR18 / §11). *(Resolved 2026-06-14 — Pedro: PDF only, HTML→printToPDF;
  XLSX deferred.)*
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
- **FR15 — Pre-generation confirmation (lightweight).** Because the PDF is a
  **decrypted artifact**, the user passes a **simple confirmation modal** stating the
  file will be unencrypted, may be indexed by Windows Search / uploaded by sync clients,
  and is the user's responsibility (SPEC-027 §2.6 disclosure language). Unlike Export,
  there is **no typed-word step** (`EXPORTAR`/`EXPORT`) — a single explicit confirm
  button is sufficient, consistent with the low-friction MVP. *(Resolved 2026-06-14 —
  coordinator default; Pedro favours low friction.)*
- **FR16 — Atomic write + streaming.** Reuse SPEC-027 FR16–FR17: write to a sibling
  temp file in the destination directory and atomically rename; decrypt streaming,
  zeroise plaintext buffers. Report aggregation, however, requires a **full pass** over
  the period's movements before totals are known — memory bound is on aggregates, not
  raw rows (NFR4).
- **FR17 — Audit entry first.** Before any byte is written, main appends a **signed
  audit entry** for the report generation (`action: "report.generate"`), with an
  `after_hash` over the canonical-JSON of the report **parameters** (period, account
  scope, grouping level, format) — never over plaintext content. (Mirrors SPEC-027 FR18
  and the SPEC-028 audit-chain.) The new `report.generate` action enum value is added to
  `crypto-spec.md` §8.2 in the implementing PR. *(Resolved 2026-06-14 — yes, generation
  writes a signed audit entry.)*
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
- **FR21 — Account scope (consolidated by default, single-account optional).** The
  generation screen offers an **account scope** control: **All accounts (consolidated)**
  by default — one report whose credits/debits and opening/closing pair are summed across
  all selected accounts — or **a single account**, producing a per-account statement with
  that account's own `openingBalance`-derived opening/closing balances. Backed by
  `getAccountBalancesInRange` per account. *(Resolved 2026-06-14 — Pedro: multi-account
  with single-account option.)*

### 4.2 Non-functional

- **NFR1 — Performance.** Generating a one-year report over a 10 000-movement dataset
  completes in **< 5 s** for PDF on the perf-baseline machine (i5-class, 16 GB).
- **NFR2 — Offline behaviour.** Fully offline — operates on the local read model and
  the in-memory master key; writes to a local path. No network (Vision §7 Principle 5).
  External-timestamping of the report (SPEC-028 RFC-3161) is **not** in scope.
- **NFR3 — Accessibility.** The generator UI is WCAG 2.1 AA: keyboard-reachable period
  picker, grouping selector, preview, and confirmation modal; `aria-live` status updates.
  The PDF itself (HTML → `printToPDF`) targets tagged-PDF/readable-order on a best-effort
  basis.
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
- **Grouping-level selector.** The generation screen exposes a **grouping-level selector**
  (Category — default — vs Category → Subcategory) that the user sets at generation time
  (FR7). Switching it re-runs `report:build` and re-renders the preview; the TOTALs are
  invariant across levels (they always equal `getRangeKPIs`).
- **Account scope control.** An **All accounts (consolidated)** / **single account**
  selector (FR21) drives whether the report shows one consolidated opening/closing pair
  or a per-account statement.
- **The template is the design contract.** Mouse owns pixel fidelity to the RSE 2024
  PDF (header lockup with **org logo**, legal line, table rules, bold TOTAL rows,
  two-column signature footer). The HTML/print template (main-process HTML →
  `webContents.printToPDF`, FR11) lives under a main-process-owned template asset, not in
  renderer routes.
- **Header/footer editing.** Org details, the **org logo**, and signatory blocks are
  pre-filled from org/profile settings and editable in a side panel before generation;
  at-generation overrides are allowed (FR3, FR9). Signatures are **printed blocks only**
  — the app captures/stores no signature image (FR9).

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
  "format": "pdf", // xlsx deferred to a future version
  "periodKind": "calendar-year|custom-range",
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD",
  "accountIds": ["<ULID>", ...],   // sorted; empty = all accounts (consolidated)
  "grouping": "category|category-subcategory"
}
```

The `action` enum in `crypto-spec.md` §8.2 must gain `"report.generate"` (added in the
implementing PR; Switch-approved 2026-06-14). This mirrors the SPEC-027 precedent for
adding `"export.xlsx"`.

### 6.2 Read-model projections — built on the existing `core/query` engine

**No new persisted projections, and no new summation logic.** The Financial Report is
structurally the **same aggregation as the Balance/Panel ("Saldo") screen** and MUST be
assembled from the existing pure query layer in `app/src/core/query/` (one O(n) pass
over the hydrated read model; no materialized buckets). The reuse map:

| Report element | Reused `core/query` function | Notes |
|---|---|---|
| Credits TOTAL / Debits TOTAL for the period | `getRangeKPIs(from, to)` (`queries.ts`) | Returns `{ income, expense, net, transactionCount }` over the range — these **are** the two table totals in consolidated/all-accounts mode. In single-account mode the totals come from the account-scoped `getAccountBalancesInRange` row (FR21). |
| Per-account scoping / consolidated totals | `getAccountBalancesInRange(from, to)` (`queries.ts`) | Income/expense/net per account in range; backs the consolidated-by-default and single-account modes (FR21). |
| Opening balance (running balance before period start) | `getAccountBalances()` + each `ConfigAccount.openingBalance` | Opening = `openingBalance + net(income−expense)` of all tx with `date < periodStart`. Computed with the same range filter, `to = periodStart − 1 day`. |
| Period resolution (fiscal year / quarter / month) | `resolvePeriodRange` + `PeriodRange` (`saldo.ts`) | Reuse the UTC-inclusive period math; calendar-year is `period: 'ano'`. Custom ranges bypass it. |
| Projection / comparison scaffolding (if needed later) | `getSaldoComparison`, `computeProjection` (`saldo.ts`) | Available for a future multi-year comparison column (deferred, §11). |
| Split-child → category normalisation | `effectiveAmounts` / `expandSplitAmounts` helper (`queries.ts`, `saldo.ts`) | Splits already normalise integer-cents children to their own category; the report inherits this for free. Split direction follows the parent `tx.type`. |
| Credit/Debit classification | `Transaction.type` (`types.ts`) | First-class income/expense enum; **not** amount sign, **not** `category.kind`. |

**The one genuinely new core query.** Today's queries group by **account** or by
**month**, never by **category**. The report needs per-line-item rows ("Membership
fees", "Office Expenses", "Bank Fees", …). This spec adds **one** new pure read query
to `core/query`:

```ts
// New — app/src/core/query/queries.ts
// Groups income/expense over a date range BY category (and, when grouping is
// 'category-subcategory', by subcategory within each category). Reuses the existing
// effectiveAmounts() split-normalisation and category-name resolution already in the
// module — it does NOT introduce a parallel summation path.
export function getCategoryBreakdownInRange(
  from: string,
  to: string,
  grouping: 'category' | 'category-subcategory',
): {
  income: CategoryBreakdownRow[];   // type === 'income' rows + Unclassified
  expense: CategoryBreakdownRow[];  // type === 'expense' rows + Unclassified
};
// CategoryBreakdownRow = { categoryId | null, label, subRows?: SubRow[], total: number }
```

`getCategoryBreakdownInRange` is the **only** new aggregation; everything else is a
composition of the functions above. Category/subcategory **name resolution** reuses the
`resolveCategoryName` / `resolveSubcategoryName` helpers already in `saldo.ts` (archived
categories still resolve; `null` → an i18n "Unclassified" label rendered in the
renderer, never a hard-coded string in `core/query`).

### 6.3 File layout on OneDrive

**Nothing new under the dataset root.** The generated PDF is written to a **user-chosen
path outside the encrypted workspace** (Documents by default). It is not part of the
dataset, is not encrypted, is not indexed by ULID, and is never re-read by OpenTreasury.
The encrypted-workspace guard (FR14) actively prevents writing into the dataset root.

**Org logo (branding asset).** The header logo is a **non-sensitive branding asset**
stored as an **org/profile setting**, NOT inside the encrypted treasury store (Switch
confirmed 2026-06-14). It is read in main and embedded into the PDF template at
generation time. **No signature images** are stored anywhere — signatures are printed
blocks signed externally (FR9), so there is no signature-asset storage concern.

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
    periodKind: "calendar-year" | "custom-range",
    periodStart: ISODate,           // required
    periodEnd: ISODate,             // required
    accountIds?: ULID[],            // empty/undefined = all (consolidated); single id = per-account
    grouping: "category" | "category-subcategory"
  }
  ReportBuildResponse =
    | { ok: true, model: ReportModel, confirmationToken: string /* one-shot, TTL ≤ 60s */ }
    | { ok: false, code: "CE-XXX" }
  ```
- `report:generate` — the renderer sends **only** the `confirmationToken` (format is
  fixed to `pdf` in v1); main reconstructs the parameters from the token, opens the save
  dialog, writes the audit entry, then the file (SPEC-027 §3.2 token pattern).
  ```ts
  ReportGenerateRequest = { confirmationToken: string, format: "pdf" /* xlsx deferred */ }
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
  to the audit chain and local diagnostics (SPEC-027 precedent). Switch confirmed
  (2026-06-14) report generation warrants an audit entry equal in weight to export — it
  produces a decrypted artifact.
- **PII redaction in logs (R15).** `reportService` logs only counts and byte sizes;
  org/donor/category names and amounts are PII-equivalent and redacted; paths logged as
  basename only.
- **Input validation (R17).** All renderer-supplied parameters (ULIDs, ISO dates,
  enums) are Zod-validated at the boundary; invalid input → CE-XXX.
- **Confirmation friction (lightweight).** Generation is gated by a **simple
  confirmation modal without a typed-word step** (FR15) — lighter than Export's
  `EXPORTAR`/`EXPORT` gate, per Pedro's low-friction MVP preference (2026-06-14). The
  encrypted-workspace guard, audit-first ordering, and atomic write are retained
  unchanged from SPEC-027/028.
- **Org logo (non-sensitive).** The header logo is an org/profile branding asset stored
  **outside** the encrypted store (Switch confirmed 2026-06-14); embedding it touches no
  cryptographic boundary. **No signature images** are captured, embedded, or stored — the
  PDF prints signature blocks signed externally (FR9), so there is no signature-asset or
  encrypted-signature-store requirement.
- **What the spec is NOT promising.** It does not encrypt the generated PDF, prevent the
  user from emailing it, or control OS indexing of the destination — the pre-generation
  modal discloses this (FR15), reusing SPEC-027 §2.6 language.

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- `getCategoryBreakdownInRange(from, to, grouping)` — the new core query: groups
  `type==='income'` and `type==='expense'` by category (and subcategory when requested),
  reuses `effectiveAmounts` for split children, and emits an `Unclassified` row for
  `categoryId === null`. Assert subtotals == `getRangeKPIs(from,to).income/.expense`
  (the report can never disagree with the Panel screen) (FR4, FR5, FR6, FR7).
- Classification: a `type==='expense'` transaction always lands in the Debits table and
  a `type==='income'` one in Credits, **regardless** of amount sign or `category.kind`
  (FR6).
- `computeOpeningBalance(accounts, model, periodStart)` — `Σ openingBalance + Σ net of
  tx with date < periodStart`, composed from `getAccountBalancesInRange` (FR8).
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
- Uncategorised movements surface in an `Unclassified` line within the table matching
  their `tx.type`, and totals still reconcile (Scenario E).
- Multi-account consolidated vs single-account scoping (Scenario D / FR21).

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
- [ ] **AC4** — Line items derive credit vs debit from the first-class
  `Transaction.type` (income → Credits, expense → Debits), independent of amount sign or
  `category.kind`; uncategorised movements appear under `Unclassified` in the matching
  table and totals still reconcile. The per-table subtotals equal the period income/expense
  for the selected account scope — `getRangeKPIs(from,to)` in consolidated mode, or the
  account-scoped totals from `getAccountBalancesInRange(from,to)` in single-account mode
  (FR6, FR21).
- [ ] **AC5** — `category-subcategory` grouping breaks a category into its subcategory
  line items with a category subtotal; `category` grouping does not (FR7).
- [ ] **AC6** — The header renders org name/logo, legal registration line, address,
  email, and the localized title; the footer renders both signatory blocks
  (name/role/place/date line + a blank signature area) with **no embedded signature
  image** (FR3, FR9).
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
  (per-file AAD on decrypt), §8.2 (audit `action` enum: add `report.generate`), §8.3
  (audit-export precedent), §11 gates `[NO-DIY]`, `[AUDIT-CHAIN]`, `[RENDERER-ISO]`.
- **Related specs:**
  - [SPEC-027 Export](./027-export.md) — decrypt-in-main, confirmation-token, audit-first,
    atomic-write, encrypted-workspace-guard, locale/number patterns are reused wholesale.
  - [SPEC-028 Audit & Evidence](./028-audit-and-evidence.md) — the `report.generate`
    entry joins the signed audit chain and surfaces in the audit viewer.
  - [SPEC-023 Split Transactions](./023-split-transactions.md) — split children are netted
    into category/subcategory subtotals like any other movement.
  - [SPEC-026 Encryption at Rest](./026-encryption-at-rest.md) — defines the MK and the
    dataset root used by the encrypted-workspace guard.
- **Read models / queries reused (`app/src/core/query/`):** `getRangeKPIs` /
  `getAccountBalancesInRange` / `getAccountBalances` / `effectiveAmounts` (`queries.ts`),
  `resolvePeriodRange` / `PeriodRange` / `resolveCategoryName` / `resolveSubcategoryName`
  / `getSaldoComparison` (`saldo.ts`), `Transaction.type` & `ConfigAccount.openingBalance`
  (`types.ts`). **One new query added:** `getCategoryBreakdownInRange(from, to, grouping)`
  (§6.2). Opening balance is event-sourced via `AccountCreated.openingBalance` /
  `AccountUpdated.changes.openingBalance` (`events/schemas.ts`, `query/reducers.ts`).
- **Skills referenced:** `.squad/skills/date-range-query-extension/SKILL.md`,
  `.squad/skills/read-model-aggregation/SKILL.md`,
  `.squad/skills/spec-to-subissues/SKILL.md`.
- **Paired UX:** [`docs/ux/specs/spec-030-financial-report.md`](../ux/specs/spec-030-financial-report.md).
- **Paired Design:** [`docs/design/030-financial-report.md`](../design/030-financial-report.md) — Mouse template-fidelity pass (complete 2026-06-14).
- **Supersedes / Superseded by:** —

## 12. Open Questions

All nine Open Questions were **resolved by Pedro on 2026-06-14** (decisions relayed via
the coordinator). They are retained here as a decision log; the spec body already
reflects each resolution.

> **Resolved by the codebase (never open):**
> **(a) Income vs expense classification** — a transaction's first-class
> `Transaction.type` (`income` / `expense`) decides Credit vs Debit, exactly as the
> Panel/Saldo screen does. Amounts are stored positive; classification is **not** the
> amount sign and **not** `category.kind`. (See FR6.)
> **(b) Opening / closing balance source** — opening = the event-sourced
> `ConfigAccount.openingBalance` + the running net of all transactions before the
> period start; closing = `opening + credits − debits`. (See FR8, §6.2.)

1. **Output format / generator.** **Resolved (2026-06-14):** **PDF only** in v1, via a
   main-process **HTML template printed to PDF** with Electron `webContents.printToPDF`.
   The **XLSX summary sheet is deferred**. (FR11.)
2. **Line-item grouping granularity.** **Resolved (2026-06-14):** grouping level is
   **user-selectable at generation time** — a selector control with **Category** (default)
   and **Category → Subcategory** options; it is **not** automatic. Both levels must still
   reconcile to `getRangeKPIs` totals. Pedro: *"I would give the option to the user to
   choose the level… it might significantly affect the format."* (FR7, §5.)
3. **Multi-account.** **Resolved (2026-06-14):** **consolidated multi-account by default**
   (single opening/closing pair summed across selected accounts), with the ability to
   **pick a single account** (per-account opening/closing). Pedro: *"it's multi-account,
   but I guess we can pick one."* (FR21, Scenario D.)
4. **Period selection.** **Resolved (2026-06-14):** **calendar-year picker + arbitrary
   custom date range** in v1; configurable fiscal-year start **deferred**. (FR2.)
5. **Header / footer source & logo.** **Resolved (2026-06-14):** org details (name, legal
   registration line, address, email) **and an org LOGO** come from **organisation/profile
   settings** with **at-generation overrides**. The logo is a **non-sensitive branding
   asset stored as an org setting — NOT in the encrypted store** (Switch confirmed). Pedro:
   *"it would be great to have a logo!"* (FR3, §6.3.)
6. **Reconciliation label typo in the source PDF.** **Resolved (2026-06-14):** treat the
   source "2023" labels as a **typo** — label the reconciliation lines with the **report
   year**. (FR8.)
7. **Signatures.** **Resolved (2026-06-14):** the app does **NOT** embed or store
   signature images. The PDF prints **signature blocks** (name, role, place, date line +
   blank signature area) for the treasurer and external auditor; **the auditor signs the
   finished PDF externally**. No signature-image asset, no signature storage, no
   encrypted-store-for-signatures. Signatory names/roles/places from org settings with
   overrides. Pedro: *"the signature is done outside the app, in the PDF file by an
   external auditor."* (FR9, §6.3, §8.)
8. **Confirmation & audit policy.** **Resolved (2026-06-14, coordinator default):**
   generation **writes a signed audit entry** `report.generate` (yes), and shows a
   **simple confirmation modal WITHOUT the typed-word step** (lighter than Export, per
   Pedro's low-friction preference). The encrypted-workspace guard and audit-first /
   atomic-write ordering from SPEC-027/028 are retained. (FR15, FR17, §8.)
9. **Locale / currency.** **Resolved (2026-06-14):** active-locale **European format**
   (`.` thousands, `,` decimal), currency rendered as **`9.506,21 €`** (`€` suffix with a
   non-breaking space). (FR10.)

**v1 scope / MVP boundary (confirmed 2026-06-14).** **In:** single-year or custom-range
PDF statement matching the RSE template (header + logo, credits table, debits table,
balance reconciliation, signature blocks), consolidated or single-account, user-selectable
grouping level. **Deferred:** XLSX summary, multi-year comparison, per-project/per-label
breakdowns, charts, RFC-3161 timestamping, in-app signing.

## 13. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-06-14 | Draft | Neo (with Link/Switch/Niobe/Mouse) | Initial draft — replicates RSE Financial Report 2024 template as an aggregation/presentation layer over SPEC-027/028 decrypt-in-main access. |
| 2026-06-14 | Draft | Neo | Anchored §6.2 on the existing `core/query` engine (reuse map + one new `getCategoryBreakdownInRange`). Settled classification (`tx.type`) and opening/closing-balance source (event-sourced `openingBalance`) from the codebase; removed both from Open Questions (now 9). |
| 2026-06-14 | In Review | Neo (Squad) | Pedro resolved all 9 Open Questions (PDF-only via HTML→printToPDF; user-selectable grouping level; consolidated-by-default + single-account; calendar-year + custom range; org logo as non-encrypted org setting; reconciliation labelled with report year; **no in-app signature images** — printed blocks signed externally; signed `report.generate` audit entry + lightweight confirmation without typed-word; `9.506,21 €` formatting). Squad review: Neo (architecture) ✅ · Switch (security) ✅ · Link (product) ✅ · Niobe (UX) ✅ · Mouse (design) ✅ — all approved. |
| 2026-06-14 | Accepted | Mouse (Squad) | Design-fidelity pass complete; Pedro signed off scope; all reviewers approved. Paired Design artifact [`docs/design/030-financial-report.md`](../design/030-financial-report.md) pins pixel-fidelity to the RSE 2024 template (header lockup + logo, credits/debits tables, reconciliation box, two-column signature footer, A4 print spec) with token mapping + fidelity checklist. |
