# SPEC-024 — Free-text Movement Search

> **Status:** Draft v0.2 · **Milestone:** M1 (post Wave A / splits) · **Owner:** Niobe (Spec / UX Analyst) · **Last updated:** 2026-05-02

## Changelog

### v0.2 — 2026-05-02 (Topbar pivot)

**Decision:** Search input relocated to AppShell topbar (lines 228-232 of `app/src/renderer/screens/AppShell/AppShell.tsx`), reusing the existing ⌘K placeholder. Movements screen toolbar approach from v0.1 abandoned per Pedro's directive.

**Key changes:**

- **Activation:** ⌘K (macOS) / Ctrl+K (Windows/Linux) focuses the topbar search input. Clicking the input also focuses.
- **State propagation:** User types → on Enter (or after 200ms debounce), app routes to Movements screen with `?q={encoded query}` in the URL.
- **Cross-screen behavior:** Typing from Insights / Saldo / Dashboard → Enter navigates to Movements with `?q=...`. Already on Movements → input updates the query in place without route change.
- **Clear flow:** Esc clears input + removes `?q` from URL. Second Esc blurs.
- **Wiring contract:** Topbar component owns input rendering + keyboard handler; Movements screen reads `q` param on mount and applies as filter.

**Rationale:** Global discoverability, reuses existing ⌘K muscle memory, consistent entry point regardless of current screen.

**Impact:** Trinity will refactor topbar to wire focus handler, route navigation on Enter, and URL state management. Movements screen gains route-param-to-filter binding on mount.

---
> **Paired UX:** [`docs/ux/ux-008-movement-search.md`](../ux-008-movement-search.md)
> **Paired Design:** Pending (Mouse — visual treatment of search input + match highlights)
> **Paired PRD:** Pending (PRD-024 reservation needed in `docs/product/prd-plan.md`)
>
> **Traceability:** UX-003 §filter-toolbar · UX-007 §splits-list-presentation · ADR-001 (event-sourced ReadModel, in-memory queries)

---

## 1. Summary

Free-text search on the Movements screen lets a treasurer find any transaction by
typing a single query that matches across **description, comment, counterparty,
account, category, subcategory, tags, reference, details, notes, amount, date, and
split-level fields**. It runs over the in-memory ReadModel, narrows the existing
filter pipeline (does not replace it), and feels instant on the perf-seed dataset
(10k+ transactions).

Pedro's brief verbatim: *"free text, flexible search. And fast 🙂 and it needs to
search all the fields, notes included."*

---

## 2. Problem

The Movements toolbar already exposes structured filters (date range, account,
category, type, amount range, tag intersection, uncategorised-only). What it does
**not** offer is the "I remember the word *cafetería* was on it somewhere" lookup —
the 30-second-between-phone-calls scenario that drives most real treasury
reconciliation. Today the only way a user can find such a transaction is to scroll
or to remember which structured filter to apply.

The AppShell topbar currently renders a **non-functional search input**
(`shell.search.placeholder` — "Buscar movimientos, categorías, cuentas…", with a
`⌘K` kbd hint at lines 228-232 of `app/src/renderer/screens/AppShell/AppShell.tsx`).
It has no behaviour wired. SPEC-024 v0.2 **wires this topbar input** to search
movements, routing the user to the Movements screen with query results.

## 3. Users & Scenarios

**Primary persona:** María, NGO treasurer (per `docs/product/vision.md` §2).

- **Scenario A — "the cafetería one".** María remembers a small expense annotated
  *"comida equipo"* and types `comida` into search. The list narrows to every
  transaction (across all categories and accounts within current filters) whose
  description, note, comment, or split comment contains *comida* — accent- and
  case-insensitive.
- **Scenario B — split match.** A €500 parent has three splits, one of which has
  comment *"materiales taller"*. She types `materiales`. The parent surfaces in
  results with a *split-match* indicator and (on expand) the matching split is
  highlighted.
- **Scenario C — amount lookup.** She types `27,5`. Every transaction whose amount
  equals €27.50 surfaces, regardless of whether the user typed `27,5`, `27.5`, or
  `27.50`.
- **Scenario D — date probe.** She types `sep 2024`. Transactions in September 2024
  surface (month-name match in current locale OR ISO substring `2024-09`).
- **Scenario E — combined with filters.** She has the date filter set to "this
  year" and account = "Unicaja". Search runs **inside** that subset; the result
  count badge shows "12 of 487".

## 4. Requirements

### 4.1 Functional

- **FR1 — Search scope (read-side fields).** A query matches if ANY of the
  following normalised fields contain the (normalised) query token: `description`,
  `reference`, `details`, `accountName`, `categoryName`, `subcategoryName`, every
  `tagName` in `tagIds`, every `notes[].text`, the formatted `amount`, the raw
  `amount` (cents and decimal), the ISO `date` (YYYY-MM-DD), the localised
  long-month name + year, and for splits: each split's `comment`,
  `categoryName`, `subcategoryName`, formatted amount.
- **FR2 — Splits surface the parent.** If any split of a parent matches, the
  parent row appears in results with a *split-match* indicator. The matching
  split(s) are flagged so the row's expanded view highlights them (UX detail in
  paired UX-008 §splits).
- **FR3 — Substring match, case-insensitive, accent-insensitive.** Normalisation
  applies Unicode NFD + diacritic strip + lower-case to both haystack and query.
  `cafe` matches `Café`; `accion` matches `acción`.
- **FR4 — Whitespace tokenisation = AND.** A query of `comida material` returns
  rows where **both** tokens appear somewhere across the searchable fields (each
  token can match a different field). Empty tokens collapse.
- **FR5 — Quoted-phrase support.** A query wrapped in double quotes is treated
  as one literal token (whitespace preserved, normalisation still applied).
  Example: `"comida equipo"` requires that exact substring (post-normalisation).
- **FR6 — Amount normalisation.** A query that parses as a number under either
  `,` or `.` decimal separator matches transactions whose `amount` (in cents)
  equals the parsed value × 100. `27,5` and `27.5` and `27.50` all match
  €27.50. The integer form `27` ALSO matches €27.00 exactly (no fuzzy range).
- **FR7 — Date normalisation.**
  - A token matching `^\d{4}-\d{2}(-\d{2})?$` matches transactions whose ISO
    date starts with that prefix.
  - A token matching a localised month name (full or first 3 chars,
    case-insensitive, accent-insensitive, in the active i18n locale) matches all
    transactions in that month of any year, OR — if a 4-digit year token is
    also present — that month of that specific year.
- **FR8 — Search composes with filters (AND).** Search narrows the already-filtered
  list (date, account, category, type, amount, tags, uncategorised). Search
  never widens the set. Active filters remain visible and editable.
- **FR9 — Empty query is a no-op.** Empty / whitespace-only query → search is
  inactive; the unfiltered (by-search) result of the existing filter pipeline is
  shown. Result-count badge hidden.
- **FR10 — Result count.** When search is active, a badge shows
  `"{matched} of {pre-search-filtered-total}"` (ES: `"{matched} de {total}"`).
- **FR11 — Clear control.** When the input has any text, an `✕` button clears it
  in one click; pressing `Esc` while focused does the same.
- **FR12 — Keyboard shortcut.** `Ctrl/Cmd+K` focuses the topbar search input
  from any screen. `/` when no other input is focused also focuses the input.
  The native browser find is not preempted.
- **FR13 — Debounce / Navigation trigger.** The input value updates immediately
  (no input lag). On **Enter** keypress OR after **200 ms** trailing-edge
  debounce (whichever comes first), the app navigates to Movements with
  `?q={encoded query}` if not already on Movements, or updates the query in
  place if already on Movements.
- **FR14 — URL state.** When search is active, the Movements route URL includes
  `?q={encoded-query}`. Reload preserves search. Clearing (via Esc or clear
  button) strips the param and uses `history.replaceState` to avoid polluting
  back-button history. Navigation from other screens uses `history.pushState`
  so back-button returns to previous screen.
- **FR15 — A11y.** Input has a visible label or visually-hidden label
  (`aria-label="Search transactions"` / `"Buscar movimientos"`). Result count
  region uses `aria-live="polite"`. Clear button has `aria-label`. Focus ring
  meets WCAG 2.1 AA contrast.

### 4.2 Non-functional

- **NFR1 — Performance budget.** On the perf-seed dataset (≥ 10 000 transactions,
  ~30 000 splits, ~5 000 notes), keystroke → rendered list **p95 < 100 ms**, p99
  < 200 ms, on a baseline laptop (i5-class, 16 GB). Measured end-to-end:
  user types → debounce fires → filter runs → React commits → table paints.
- **NFR2 — Memory.** Pre-computed search haystack adds ≤ 2× the size of the raw
  searchable text per row (roughly 0.5–1 KB / tx including splits and notes).
  At 10k tx that's ≤ 10 MB — acceptable for a desktop app.
- **NFR3 — Offline.** Search is a pure function of the local ReadModel. No
  network. Works in degraded storage mode (vision §7 Principle 5).
- **NFR4 — Accessibility (WCAG 2.1 AA).** Input labelled, keyboard-reachable,
  screen-reader announces result count changes, no colour-only indicators for
  match highlights.

## 5. UX Notes

Full flows live in [`ux-008-movement-search.md`](../ux-008-movement-search.md).
Constraints that bear on architecture:

- The input lives in the **AppShell topbar** (`app/src/renderer/screens/AppShell/AppShell.tsx`,
  lines 228-232), reusing the existing ⌘K placeholder. Global entry point:
  typing from any screen routes to Movements with `?q=...`. Already on
  Movements → query updates in place.
- **Topbar → Movements wiring contract:**
  - Topbar owns: input rendering, focus on ⌘K / Ctrl+K, blur on second Esc.
  - On Enter or 200ms debounce: if not on Movements → `navigate('/movements?q=...')`;
    if on Movements → `updateSearchParam('q', ...)`.
  - Movements screen: reads `?q` from route params on mount, applies as filter
    alongside existing structured filters (date, account, category, etc.).
- Match highlighting (`<mark>` around matched substrings in the description /
  comment columns) ships in **v1**. Splits highlights ship in v1 (since splits
  are the most likely to motivate a search). Highlighting on amount/date columns
  is deferred to v1.1 (more design work needed for currency-formatted strings).
- Empty-state when no matches: `"No transactions match '{query}'"` + a
  *"Clear search"* CTA that clears the input and strips `?q` from URL. The
  toolbar filters remain editable so the user can widen.

## 6. Data Model

### 6.1 Domain events

**SPEC-024 introduces no new events.** Search is a pure read-side concern.

### 6.2 Read-model projections

Add a derived field to the in-memory representation used by the search index
only — NOT persisted, NOT on the wire:

```
MovementSearchRow = {
  id: string                         // Transaction.id
  haystack: string                   // pre-normalised concatenated searchable text
  amountCents: number                // for numeric query matching
  dateIso: string                    // YYYY-MM-DD
  monthNameLocaleNorm: { es: string; en: string } // pre-normalised long-month + year
  splitMatchTokens: readonly string[] // per-split haystacks for granular highlighting
}
```

This row is rebuilt:
- On initial ReadModel projection.
- Incrementally on each event apply that mutates a transaction, note, split,
  account, category, subcategory, or tag (account/category/tag rename
  invalidates every row that references that entity — O(N) but only on rename
  events, which are rare).

The renderer service (`movementsApi.ts`) gains a `searchMovements(query, base)`
helper that runs over the in-memory haystack array and returns matched IDs +
per-row split-match token positions for highlighting.

### 6.3 File layout on OneDrive

No new files. Search is in-memory only.

## 7. IPC Surface

**No new IPC channels.** The renderer already loads the full filtered set via
`listMovements`; search runs entirely in the renderer's in-memory view of that
result. If profiling reveals the haystack rebuild on every IPC refresh is
expensive, we can move haystack construction to the main process and ship it as
part of `MovementRecord` — deferred decision.

## 8. Security Considerations

This spec does not interact with Switch-owned domains in v1:

- Search operates on already-decrypted, already-projected data in the renderer.
- No new persisted artefacts, no new file types.
- No new IPC payloads cross the renderer ↔ main boundary.
- The query string itself is user input, but is consumed only by an in-memory
  `String.includes` after normalisation — no `eval`, no DOM injection (React
  handles the highlight rendering through a vetted `<mark>` component, never
  via `dangerouslySetInnerHTML`).
- No PII concern beyond what the Movements screen already shows.

If FR14 (URL state) is accepted and the renderer ever migrates to a hash-router
that surfaces in window titles or recent files, **the query string MUST be
excluded from any logged URLs** (R15). Add to the existing log redaction list.

## 9. Test Plan

### 9.1 Unit (Vitest, plain Node)

- `normalise(s)` — NFD + diacritic strip + lowercase round-trip cases (es / en).
- `parseQuery(q)` — tokenisation, AND default, quoted phrase, mixed.
- `matchAmount('27,5', 2750cents)` true; `('27', 2700)` true; `('27', 2750)` false.
- `matchDate('2024-09', '2024-09-15')` true; `('sep', '2024-09-15', locale='en')` true.
- `buildHaystack(tx, splits, notes, lookups)` covers every FR1 field.
- AND-across-tokens: query `comida material` requires both, possibly in
  different fields.
- Splits match flagging: parent flagged with `splitMatchIds: ['split-2']`.
- Performance regression: 10k synthetic rows + 30 keystrokes worth of queries
  measured against the NFR1 budget (CI threshold @ 150 ms p95 to leave headroom).

### 9.2 Integration (Vitest, in-memory storage adapter)

- Project full ReadModel (real fixtures, ~500 events) → run search for known
  terms → expected IDs returned.
- Apply a `subcategory.renamed` event → re-projected haystack reflects new name
  on the next search.
- Apply a `tx.split:create` event → parent row's `splitMatchIds` populates
  correctly when querying split comment.

### 9.3 E2E (Playwright)

- Type query → list updates → result-count badge appears.
- Type then `Esc` → input cleared, full list back.
- `Ctrl/Cmd+F` on Movements screen focuses input.
- Search + active date filter → both shown active; clearing one keeps the other.
- Splits scenario: parent surfaces, expand shows highlighted split.
- Empty state: query with no match → empty-state copy + "Clear search" CTA.
- A11y: axe-core passes; aria-live region announces "23 of 487 transactions".

## 10. Acceptance Criteria

Each maps to a test (unit, integration, or e2e). Cypher converts §10 → e2e
specs.

- [ ] **AC1** — Typing a query that appears in `description` returns those rows
  within the active filter set; result-count badge shows `matched of total`.
- [ ] **AC2** — Diacritic-insensitive: `cafe` matches a row whose description is
  `Café del puerto`.
- [ ] **AC3** — Multi-token AND: `comida equipo` returns only rows where BOTH
  tokens appear (possibly across different fields).
- [ ] **AC4** — Quoted phrase: `"comida equipo"` returns only rows containing
  that exact phrase post-normalisation; `"frase inexistente"` returns 0 rows.
- [ ] **AC5** — Amount: `27,5` returns rows with amount €27.50; `27.5`
  returns the same set; `27` returns rows with amount €27.00 only.
- [ ] **AC6** — Date: `2024-09` returns September 2024 rows. `sep` (locale=ES /
  EN) returns rows in any September. `sep 2024` narrows to September 2024.
- [ ] **AC7** — Splits: a parent whose split comment contains the query appears
  in results with the split-match indicator; expanded view highlights the
  matching split.
- [ ] **AC8** — Search composes with filters: with date filter "this year" and
  account "Unicaja" active, search runs over that subset and never returns rows
  outside it.
- [ ] **AC9** — Empty state: a query with zero matches renders "No transactions
  match '{query}'" + a "Clear search" button that restores the unfiltered (by
  search) view.
- [ ] **AC10** — Keyboard: `/` and `Ctrl/Cmd+K` focus the topbar input from any
  screen; first `Esc` while focused clears the query, second `Esc` blurs.
- [ ] **AC11** — Performance: on the 10k-row perf-seed fixture, p95
  keystroke→render < 100 ms (measured by the perf harness used in WI-13).
- [ ] **AC12** — A11y: input has accessible name, clear button has accessible
  name, result-count region has `aria-live="polite"`, axe-core finds no
  WCAG 2.1 AA violations on the Movements screen with search active.

## 11. Out of Scope (v1)

Explicitly deferred — do NOT slip these into the implementation PR:

- **Cross-account search via account selector.** Already covered: search
  composes with the existing account filter; "all accounts" is the
  no-account-filter default.
- **Field hint syntax** (`category:material`, `>50€`, `account:unicaja`). Power
  user pattern; revisit in v1.1 once we have usage data on plain queries.
- **Saved searches.**
- **Search history / autocomplete suggestions.**
- **Regex queries.**
- **Fuzzy / typo-tolerant matching.** Substring + AND tokenisation covers ~95 %
  of intents at near-zero cost. Re-evaluate if Pedro surfaces typo complaints.
- **CSV export of search results.**
- **Highlighting on amount and date columns.** Description / comment / split
  comment only in v1.
- **Audit-metadata search** (createdAt, deletedBy, importBatchId). Out of scope
  per Pedro's brief.
- **Global command palette** in the AppShell topbar — different feature, deferred.

## 12. Performance Approach (decision)

**Chosen: pre-computed normalised haystack string per row, kept on a derived
in-memory side table; linear scan on each query post-debounce.**

Why not the alternatives:

- **Reverse index (token → Set<txId>).** Wins on huge corpora (>100k rows) but
  costs complexity (substring queries don't map to token indexes; you'd need
  trigram, which adds 3-5× memory). At 10k rows the linear scan is ~2-4 ms in
  Node — well under budget.
- **Fuse.js / MiniSearch / lunr.** Adds 30-90 KB gzipped to the renderer
  bundle, brings fuzzy matching we explicitly de-scoped, and locks our match
  semantics to the library's quirks. Skip.
- **Pure on-the-fly concat (no haystack cache).** Each keystroke would
  re-stringify amounts, look up category/account names, walk splits, walk notes
  — measured at ~80–120 ms for 10k rows. Right at the budget cliff. Caching
  the haystack moves it to 5-15 ms. Worth the memory.

Implementation notes for Trinity / Morpheus:

- Build the haystack lazily on first search use (not on every projection) to
  keep cold-start cheap.
- Invalidate per-row haystack on the events listed in §6.2; rename events
  invalidate by foreign key (track `categoryId → Set<txId>` etc., or accept the
  O(N) rebuild cost on rename — measure and decide).
- Debounce **200 ms** trailing. Spinner not needed at this latency.
- Virtualisation: the table is already virtualised via the shared
  `TransactionsTable` (per Trinity's WI extraction). Confirm before merge.

## 13. Traceability

- **PRD:** Pending — PRD-024 reservation needed.
- **ADRs:** ADR-001 (in-memory ReadModel, event sourcing).
- **Paired UX:** [`docs/ux/ux-008-movement-search.md`](../ux-008-movement-search.md).
- **Paired Design:** Pending (Mouse).
- **Related specs:** SPEC-023 (splits — surfaced via FR2/AC7).
- **Supersedes / superseded by:** —

## 14. Open Questions

1. ~~**Topbar input vs Movements toolbar input.**~~ **RESOLVED v0.2:** Topbar
   location confirmed by Pedro. Wiring contract defined in §5.
2. **Highlight style.** Mouse owns the visual treatment of `<mark>` (token
   colour, contrast). Niobe proposes: brand-tinted background, inherit text
   colour, no border, sufficient contrast in dark mode.
3. ~~**URL state (`?q=`).**~~ **RESOLVED v0.2:** Implemented with `pushState`
   on cross-screen navigation, `replaceState` on in-place query updates. See
   FR14.
4. **Renderer-only vs main-process haystack.** Start in renderer. Revisit if
   IPC refresh latency dominates the keystroke budget.
5. **Locale switch invalidation.** When the user switches ES↔EN, the localised
   month-name index must rebuild. Cheap (constant-time) but must be wired.
6. **URL persistence on reload.** Should `?q` survive a window reload, or clear
   on app restart? Recommendation: persist — user expectation from web apps.

## 15. Status History

| Date       | Status     | By    | Notes                                                                                                                         |
| ---------- | ---------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-02 | Draft v0.1 | Niobe | Initial draft from Pedro's brief; 12 ACs, perf budget = 100 ms p95 @ 10k rows, splits-aware.                                 |
| 2026-05-02 | Draft v0.2 | Niobe | Topbar pivot per Pedro decision. ⌘K focus, `?q` route param, cross-screen navigation wiring defined. Resolved OQ1 + OQ3. |
