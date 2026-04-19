# PRD-001 — Movements / Transaction List

> **Status:** Draft · **Owner:** Link (PM) · **Last updated:** 2026-04-19
> **Target milestone:** [M1 — Single-user happy path](../roadmap-v1.md#m1--single-user-happy-path)
> **Depends on:** [vision §5](../vision.md#5--scope--in-v1), [ADR-001 §3 Option A](../../architecture/adr-001-tech-stack.md) C1–C3/C10/C11, [security-requirements v0.2](../../security/security-requirements-v0.1.md) R3/R5/R8, [crypto-spec](../../security/crypto-spec.md) §2.1/§8, [PRD-010 Accounts](#), [PRD-011 Categories](#), [PRD-012 Tags](#)
> **Prototype reference:** [`prototype/movimientos.jsx`](../../../prototype/movimientos.jsx)

---

## 1. Summary

The Movements page is the treasurer's primary working surface — a **filterable, searchable ledger** of every income and expense transaction. Per the locked team decision of 2026-04-19, the page **starts empty on open** and only loads data once the user picks a date range (explicit preset or custom), preventing stale-ledger cognitive overload.

## 2. User Problem

**Who.** The NGO treasurer during their weekly or monthly reconciliation session.

**Pain (observed in cloud opentreasury + volunteer-treasurer interviews that informed the vision):**
- Opening the cloud "Transactions" tab auto-loads *everything* the user has access to, instantly scrolling past the last three years. Treasurers repeatedly describe feeling "lost in old data".
- Filter state doesn't persist between sessions; the treasurer rebuilds the same "this-month, expenses only" view every single session.
- Uncategorized transactions hide in the middle of the list; no quick way to surface the backlog.
- The cloud app loads all rows over the network — slow on weak NGO Wi-Fi.

**Evidence.** This PRD inherits vision.md's framing (§2–§3) and the explicit team decision that "Transaction list page starts EMPTY — user must select a date range (or preset) before data loads. No auto-loading on page open." Pedro cites repeated complaints from cloud opentreasury's user base.

## 3. User Scenarios

**S1 — Weekly reconcile.** María (treasurer) opens Movements on Monday. She clicks the "This month" preset. The list loads. She filters by account = Unicaja, type = Expense, and categorizes the four uncategorized rows.

**S2 — Year-end prep.** Juan is preparing an end-of-year summary. He picks the "2025" custom range, filters by type = Income, groups by category (visual only — grouping is v1 via category filter, not a grouped view), notes the totals strip at the bottom, and clicks Export (CSV in M3).

**S3 — Search a donor.** During a board meeting, the president asks "did we get the €2,500 from Empresa #E014 in April?" The treasurer opens Movements, picks "Last 3 months", types the donor ref into the search box. One row lights up.

**S4 — Bulk cleanup.** After importing a CSV (M2) the treasurer ticks "Solo sin categorizar", selects all, and would like to assign a category to all of them at once. **(Bulk *actions* are M4; the selection UI lives here from M1.)**

**S5 — Approval workflow.** A co-treasurer creates tentative entries as `pending`. The head treasurer opens Movements, filters by status = Pending, and approves each one. Every approval produces an audit entry (C10 / R8).

## 4. Product Requirements

Numbered, testable. Each maps to a success metric in §6 and at least one test in the future `docs/specs/001-movements.md`.

### Core behaviour

- **PR1 — Start empty.** On navigation to the page, the transaction list area MUST render an empty state with a date-range selector. No transactions MUST be loaded until the user selects a range. This is a **hard** requirement; no configuration, no "remember last range" behaviour in v1.
- **PR2 — Date-range presets.** The user MUST be able to choose from at least: **This month**, **Last month**, **This year**, **Last year**, **Last 3 months**, **Custom range**. Custom range exposes two date pickers with validation (end ≥ start).
- **PR3 — Loaded state rendering.** Once a range is picked, the table MUST render the matching transactions in descending date order (newest first), with columns: date, account (visual pill with colour), observations (free-text description), category, subcategory, amount (right-aligned, income/expense colour).
- **PR4 — Filter bar.** The filter bar MUST support: type (All / Income / Expense), account, category, month-within-range, amount min/max, "uncategorized only", text search over description + subcategory. Filters apply in real time.
- **PR5 — Totals strip.** A summary strip MUST show: total income, total expense, net (income − expense), count of matching rows, all updating live as filters change.
- **PR6 — Selection.** A checkbox column MUST allow selecting one, many, or all visible rows. Selection count displays in the totals strip. **Bulk actions are out of scope for M1** (see §5); selection UI ships so M4 can wire them.
- **PR7 — Row actions.** Each row exposes: edit, delete, approve (if status = pending). Edits and deletes produce new events per ADR-001 Option A (event-sourced, no in-place mutation).
- **PR8 — New transaction.** A "Nuevo Movimiento" button opens a create-transaction form. Mandatory fields: date, account, amount, type inferred from amount sign (positive = income, negative = expense — consistent with cloud). Optional: description, category, subcategory, tags, status (default = pending). Submission produces a `tx.created` event.
- **PR9 — Status workflow.** Transactions MUST support two statuses: `pending` and `approved`. A pending row is visually distinct (design tokens owned by Mouse). An `approve` action produces a `tx.approved` event. Only the `approve` transition is user-driven in M1; `pending` is the default on create (may be made configurable in a later PRD).
- **PR10 — Clear filters.** When any filter is active, a "Limpiar filtros" action MUST be available that resets filters (but preserves the loaded date range).

### Data integrity

- **PR11 — Every mutation is an event.** Create/edit/delete/approve all produce encrypted event files per crypto-spec §2.1 with AAD binding (C2). ULID filenames (C11). No in-place file rewrites.
- **PR12 — Every mutation writes an audit entry.** Per R8 / C10: actor device_id, timestamp, action, target id, before/after hashes, chain hash, Ed25519 signature. Even though the **viewer** ships in M2, the **data** is written from M1.
- **PR13 — Read-model rebuildable.** The transaction list is rendered from the derived SQLite read model (ADR-001 Option A). Deleting the local cache and restarting the app MUST reproduce the same list by replaying events.

### Performance / NFR

- **PR14 — Filter latency.** With 1,000 events on typical hardware, filter changes MUST apply in ≤100ms (p95).
- **PR15 — Cold open.** Cold start → empty Movements page in ≤500ms. Cold start → loaded "This month" preset in ≤1s at 1,000 events.
- **PR16 — Offline capability.** All interactions MUST work with zero network connectivity. OneDrive sync happens in the background per vision Principle 5.

### Accessibility

- **PR17 — Keyboard.** Every filter, the date-range selector, the table rows, and all row actions MUST be keyboard navigable. Focus visible.
- **PR18 — Screen-reader.** Filter state changes MUST be announced via ARIA live region. Empty state and loaded state are distinct landmarks.

### Localisation

- **PR19 — i18n-ready.** All user-visible strings MUST come from the i18n resource layer from day one. M1 ships ES only; EN resource file exists but may be empty (blank EN fails CI in M3, not M1).

### Security-adjacent

- **PR20 — No PII in logs.** Descriptions, amounts, account numbers, category values MUST never appear in log output. Per R15 the allowlist lint applies.
- **PR21 — Renderer isolation.** This page is a renderer-only concern. No direct filesystem or crypto access from the renderer. All data flows through schema-validated IPC per R12 / C13.

## 5. Scope

### In (v1 / M1)

- Empty-on-open + date-range gate.
- Full filter bar, totals strip, selection UI (no bulk *actions*).
- Create, edit, delete, approve transactions.
- In-page text search over the current result set.
- Prototype screen parity: the columns, filter chips, account pills, totals strip, and "Nuevo Movimiento" CTA shown in `movimientos.jsx` are the M1 baseline.

### Out (later milestones)

| Out of scope | Target | Why |
|---|---|---|
| CSV **import** | M2 (PRD-006) | Multi-device + import safety (R17) packaged together. |
| CSV **export** | M3 (PRD-008) | Part of v1 feature-parity batch. |
| PDF / Excel export | M4 | Separate PRDs. |
| Bulk *actions* (categorize, tag, approve N rows) | M4 (PRD-019) | Selection UI ships M1 so the M4 work is wiring only. |
| Recurring / template transactions | M4 (PRD-020) | Needs its own event model. |
| Attachments (receipts) | M4 (PRD-022) | Encrypted file storage design. |
| Cross-page **global** search | M3 (PRD-013) | This PRD only covers in-list search over the current range. |
| Multi-account reconciliation view | M4 (PRD-021) | Distinct surface. |
| Saved filter presets (beyond the built-in date presets) | v1.x+ | Wait for pilot usage data. |

## 6. Success Metrics

Observable without cloud telemetry (per vision §8). Each target maps to a PR.

| Metric | Target | Ties to | Source |
|---|---|---|---|
| Time to first filtered view (pick range → list visible) | ≤1s @ 1,000 events | PR15 | Local timing instrumentation (dev-only) |
| Filter-change p95 latency | ≤100ms @ 1,000 events | PR14 | Local instrumentation |
| Empty-on-open compliance | 100% of opens | PR1 | Automated e2e test |
| Uncategorized backlog time-to-zero | Pilot NGO: from import to full categorization ≤ 1 session | PR4 (uncat filter), PR8 | Pilot-NGO interview |
| Data-loss incidents | **Zero** (hard floor) | PR11–PR13 | Issue tracker |
| Keyboard accessibility | Every control reachable ≤5 Tab hops from header | PR17 | Manual audit + axe-core automated check |

## 7. Dependencies

Every dependency resolves to a doc path.

- **Vision** — [`docs/product/vision.md`](../vision.md) §5 (v1 scope), §7 Principles 1/5/6, §14 Q7 (prototype-as-contract — resolved below).
- **ADRs** — [ADR-001](../../architecture/adr-001-tech-stack.md) Option A (event sourcing + SQLite read model + AEAD); [ADR-002](../../architecture/adr-002-repo-structure.md) renderer/main boundary.
- **ADR-001 conditions satisfied by the paired spec** — **C1** (AEAD envelope on every tx event), **C2** (AAD binding `record_type=event`, `record_id=ULID`, `dataset_id`, `dek_version`), **C3** (192-bit random nonces), **C6** (renderer isolation: all reads go via IPC), **C7** (Electron hardening: renders in the sandboxed renderer), **C10** (audit entry on every mutation), **C11** (ULID filenames for events), **C13** (schema-validated IPC for tx channels).
- **Security requirements** — [`security-requirements-v0.1.md`](../../security/security-requirements-v0.1.md) v0.2: **R1** (data classification), **R3** (AEAD), **R5** (integrity), **R8** (append-only audit log), **R11** (Electron hardening), **R12** (IPC schema validation), **R15** (logging redaction).
- **Crypto-spec** — [`crypto-spec.md`](../../security/crypto-spec.md) **§2.1** (per-file envelope), **§8** (audit log format — data, not viewer).
- **Other PRDs** — PRD-010 Accounts (the account filter needs accounts), PRD-011 Categories (category filter), PRD-012 Tags (tag assignment on create/edit; list display is v1.x).
- **Prototype** — [`prototype/movimientos.jsx`](../../../prototype/movimientos.jsx) is the **UX baseline**. Niobe resolves any prototype↔PRD conflict in the paired UX spec; deviations require a UX-spec rationale.

## 8. UX Handoff Notes (for Niobe)

Niobe owns the detailed UX spec at `docs/ux/001-movements.md`. Points that need her attention:

- **Empty-on-open is a first-class state, not a loading state.** Spec the empty state copy (ES + EN placeholders), the date-range presets layout, and the transition from "empty" → "loaded" (no flash; no auto-dismiss).
- **Three distinct empty states** to spec clearly:
  1. "No date range picked yet" (PR1) — inviting the preset click.
  2. "Range picked, no transactions in range" — "No hay movimientos en este periodo" affordance to widen range.
  3. "Range + filters active, result is empty" — affordance to clear filters (PR10).
- **Date-range selector affordance.** Prototype has a simple month select; M1 needs the full preset set (PR2). Niobe chooses visual pattern (segmented control? popover?) — but the behavioural contract is fixed by PR2.
- **Selection UX without bulk actions.** Users will select rows and wonder what they can do. Niobe: decide whether to (a) show a disabled-with-tooltip bulk-action bar or (b) suppress it entirely in M1. I lean (a) with copy "Las acciones en lote llegan en v1.x" — but it's her call.
- **Status pill vs colour.** Status = pending must be unambiguous without relying on colour alone (PR9 + PR18). Niobe specs the dual channel (pill + icon + text).
- **Error states on create/edit.** Invalid amount, missing required field, account missing — Niobe specs the inline validation pattern; do not reinvent per field.
- **Keyboard affordances** (PR17) — tab order, focus rings, Escape closes modals.

Niobe: DO NOT respec the filter-bar fields or the totals-strip fields — those are locked by the prototype and this PRD. DO spec the micro-interactions.

## 9. Open Questions (for Pedro)

1. **Default date-range preset on first-ever open.** After PR1 (empty state), should the app *preselect* a preset in the UI (still requiring a click to load), or present the presets as equally-weighted buttons? *Recommendation: equally-weighted, no preselection — the empty rule is cleanest when nothing is auto-chosen.*
2. **Remembering the last selected range across sessions.** Currently out of scope. If you want "reopen to the range I last looked at" it adds a user-settings file + a PR. *Recommendation: do not remember; it re-introduces the "stale ledger" smell the empty rule was designed to prevent.*
3. **Amount sign convention for create-tx.** Prototype has positive=income, negative=expense inferred from sign (PR8). Do you want an explicit type toggle instead of sign-based inference? *Recommendation: keep sign-based (matches cloud + prototype).*
4. **Pending → Approved reversibility.** Can an approver *un*-approve (move back to pending)? M1 currently says no (forward-only). Reversible approval requires a new event type. *Recommendation: forward-only in M1; revisit at pilot feedback.*
5. **Uncategorized visual treatment.** Prototype shows a "Sin categorizar" badge. Should uncategorized transactions also appear in a sticky section at the top of the list (regardless of sort)? *Recommendation: no — let the "Solo sin categorizar" filter do that work.*

## 10. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-19 | Draft v0.1 | Link | Initial PRD for the Movements screen in M1. Team decision on empty-on-open encoded as PR1. |

---

*End of PRD-001 Draft — next: Pedro reviews, Niobe drafts `docs/ux/001-movements.md` in parallel.*
