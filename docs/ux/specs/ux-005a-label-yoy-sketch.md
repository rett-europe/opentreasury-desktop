# UX-005a — Per-label YoY Insights view (v1)

> **Status:** v1 (finalized) · **Owner:** Niobe · **Promoted:** 2026-04-26
> **Tracks:** GitHub issue **#69** (`priority:v1.x`, originally WI-C in #67's three-WI decomposition)
> **Milestone:** **M4** — inaugural view of the new Análisis/Insights section.
> **Parent IA:** [UX-005 Insights section (v1)](./ux-005-insights-section-ia.md)
> **Roadmap rationale:** Link's brief (`.squad/decisions/inbox/link-69-insights-prio.md`) selected option (b) — spec now, ship in M4.
> **Pedro's directional answers:** `.squad/decisions/inbox/copilot-directive-20260426-174833-insights-section.md` and Pedro's 2026-04-26 reply on Q1–Q6 (all six accepted as recommended; folded into §2 below).
> **Related:** [UX-004 Saldo](./ux-004-saldo-screen.md) (top-N pattern, projection precedent) · [UX-004a subcategory drill-down](./ux-004a-saldo-subcategory-drilldown.md)

---

## 1. Goal

Show, per label, how yearly totals have moved across multiple years. Labels are an orthogonal axis to category (a transaction can carry 0..N labels), so this view answers questions Saldo structurally cannot: *"Did our 'COVID-19 Relief' work taper as expected? Is 'Eventos' growing year-over-year? Which labels are new this year?"*

Inaugural inhabitant of the Insights section (UX-005), shipping in M4.

## 2. Normative spec (resolved 2026-04-26)

The six open questions in the DRAFT were answered by Pedro on 2026-04-26 — all six accepting Niobe's recommendation. The decisions below are normative for the M4 implementation.

### 2.1 Layout — small-multiples grid (Q1)

- One **tile per label**. Each tile contains N year-bars **stacked vertically** inside it.
- Grid is **4 columns × N rows**, wrapping responsively (collapse to 2 cols on narrow viewports; minimum tile width preserves bar-label legibility).
- Bars within a tile share a per-tile y-axis (so the eye reads YoY trend within a label); axes are **not** shared across tiles (each label has its own magnitude scale). Magnitude comparison *between* labels is read from tile order (top-N ranking, §2.2), not from bar height.
- Reads like a contact sheet: outliers and trend reversals pop visually.
- Rejected alternatives (recorded for traceability): single stacked-bar one-per-year (unreadable past 8 labels), sparkline grid (under-communicates magnitude), heatmap (weaker at YoY comparison than at ranking).

### 2.2 Top-N rule (Q2)

- Show **top 8 labels + an `Otras` bucket** (9 tiles total).
- Ranking metric: **total magnitude across the active comparison window** (sum of `|netSum|` per label across the window's years). Same convention as Saldo's category top-N (decisions.md 2026-04-23).
- `Otras` aggregates the long tail (labels not in the top 8) into a single tile that follows the same tile shape. Tooltip on `Otras` lists how many labels were folded in.

### 2.3 Scope / threshold (Q3)

- A label qualifies for an own tile only if it has **≥3 transactions in the comparison window**.
- Labels below the threshold are pushed into `Otras` (they do not vanish — their amounts still contribute to the totals visible there).
- Threshold applies to tile *eligibility*, not to bar rendering: a qualifying label can still have 0-tx years (handled per §2.6).

### 2.4 Comparison window (Q4)

- **Default window:** **last 3 full calendar years + current YTD** (4 bars per tile).
- **Control:** per-view selector to extend the window to **5 full years + current YTD** (6 bars per tile). No other window lengths in v1.
- The **YTD bar is visually marked** (hatched fill + `(YTD)` sublabel under the year). This signals "partial period" without implying anything beyond observed data.
- **No projection** is shown for the YTD bar. Saldo dropped projection (precedent: decisions.md, Saldo redesign) and Insights inherits that decision.
- Re-ranking for top-N (§2.2) uses the *currently selected* window, so changing the window may reshuffle which labels appear as tiles vs. fall into `Otras`.

### 2.5 Drill-down (Q5)

- Clicking a label tile **navigates to Movimientos**, pre-filtered by:
  - `label = <tile's label>` (or, for the `Otras` tile: the union of folded-in labels), AND
  - **date range = the tile's window** (i.e., the full set of years currently rendered, including the YTD partial year up to today).
- Reuses the existing Movimientos label-filter surface (2026-04-19 work) and the Saldo subcategory drill-down model (UX-004a). Zero new UI.
- Optional in-tile expand was rejected for v1 to keep the section read-only and consistent with Saldo's drill-out pattern.

### 2.6 Empty / sparse data (Q6)

- **Per-year empty (label has 0 tx in year Y, but qualifies overall):** render a **0-height bar with a thin baseline tick** so the year column is preserved (visual alignment across tiles is non-negotiable). Tooltip: **"Sin movimientos en {{year}}"**.
- **All-empty within the window (label exists in dataset but has 0 tx across every year of the active window):** **exclude from the grid** and surface in a footer chip **"Etiquetas inactivas"** with a count and a tooltip enumerating the names. Clicking the chip is out of scope for v1 (no expansion).
- **Dataset-level empty (< 2 distinct years OR < N transactions overall):** defer to UX-005 §4 section-level empty state. Do not render a half-grid.

## 3. Projection / data requirements (heads-up to Morpheus, not commitments)

This view will need an aggregation IPC like `insights.labelYoY({ years: number[], accountId?, minTxCount? })` returning, per label:

- `labelId`, `labelName`, `archived: boolean`
- `byYear: { year: number, incomeSum: number, expenseSum: number, netSum: number, txCount: number }[]`
- `windowTxCount`, `windowNetSum` (for Top-N ranking per §2.2)

Open data-model questions for Morpheus (to be answered in the M4 read-model mini-spec referenced in Link's brief §3):

- **Archived labels:** include if they have transactions in the window? (Recommendation: yes, but flag with a muted tile style and `(archivada)` sublabel.)
- **Multi-label transactions:** each label tile counts the full transaction amount (overlap is by design; sum-across-tiles ≠ grand total). This must be called out in copy or a tooltip to avoid the "your math doesn't add up" support ticket.
- **Account scope:** per-view filter (§2.4 parent rule from UX-005 §4), not inherited from any global state.
- **YTD bucket boundary:** must be timezone- and fiscal-year-aware (Link's brief §3).

## 4. Test scenarios (sketch for future test plan)

1. **Multi-year trend:** dataset with 4 calendar years; label `Eventos` present in all 4 with growing totals → 4 ascending bars in the `Eventos` tile, top-N rank reflects total magnitude.
2. **Sparse label:** label `COVID-19 Relief` has transactions in years Y-3 and Y-2 only (qualifies, ≥3 tx total) → tile shows 0-height ticks for Y-1 and YTD with the empty-tooltip copy.
3. **Multi-label transaction:** one transaction tagged with both `Eventos` and `Patrocinadores` → its amount appears in *both* tiles (documented overlap behavior).
4. **Archived label with history:** label archived mid-window → still rendered, with archived styling; clicking still drills through to Movimientos with the label filter applied.
5. **Threshold edge:** label with exactly 2 transactions in window → folded into `Otras`, surfaces in `Otras` tooltip count.
6. **Window-change re-rank:** switching from 3y to 5y window reshuffles the top-N tiles; previously-tile labels may move to `Otras` and vice-versa.
7. **All-inactive label:** label exists in catalogue but has 0 tx across the window → not in grid; appears in `Etiquetas inactivas` footer count and tooltip enumeration.
8. **YTD marking:** current-year bar renders with hatched fill and `(YTD)` sublabel; no projection overlay.

## 5. Decision gate

✅ **Pedro's Q1–Q6 answers are locked** (2026-04-26, all matching Niobe's recommendations; folded into §2).
✅ **Roadmap placement is locked** — M4, per Link's brief.

⛔ **One remaining gate before code:**

1. **Morpheus projection mini-spec** for `insights.labelYoY(...)` — covering the open data-model questions in §3 (archived labels, multi-label overlap accounting, YTD bucket boundary, account scope). Per Link's brief §3, Neo schedules this in late M2 / early M3 so Morpheus can land aggregation work in M3 idle capacity, ahead of the M4 UI.

When that mini-spec lands, this v1 spec becomes implementation-ready; copy/i18n keys, a11y notes, and traceability matrix will be appended (or merged into a sibling `ux-005a-impl.md`) on the same pattern as UX-004.

---

*v1 spec — answers to Q1–Q6 normative; Morpheus projection contract is the only outstanding upstream dependency.*
