# SPEC-030 (Design) — Financial Report

> **Status:** Accepted (design-fidelity pass complete) · **Owner:** Mouse (visual design) — with Niobe (UX) · **Last updated:** 2026-06-14
> **Paired feature spec:** [`docs/specs/030-financial-report.md`](../specs/030-financial-report.md)
> **Paired UX spec:** [`docs/ux/specs/spec-030-financial-report.md`](../ux/specs/spec-030-financial-report.md)
> **Design system:** [`tokens.md`](./tokens.md) · [`components-v1.md`](./components-v1.md) · [`design-principles.md`](./design-principles.md)
> **Reused-pattern precedent:** SPEC-027 Export (decrypt-in-main confirmation modal, locale/number format, save-toast).
> **Visual target:** *RSE Financial Report 2024* — the one-page, externally-signed PDF statement Pedro hands to the board and the auditor.

---

## 1. Summary

This is the **visual contract** for the Financial Report (SPEC-030). It pins pixel-fidelity
to the *RSE Financial Report 2024* PDF so a board member or external auditor recognises the
document instantly, and maps every visual decision to a **design token** in
[`tokens.md`](./tokens.md) so the implementing PR has no room to improvise.

Two surfaces are in scope and they are **deliberately different**:

1. **The PDF document** — the deliverable. Rendered by a **main-process HTML template →
   `webContents.printToPDF`** (feature spec FR11). It is **A4, paged, print-first**, and must
   survive black-and-white printing and external (wet-ink) signing. This is where the bulk of
   the fidelity work lives (§4–§9).
2. **The on-screen preview** (`REP-1.preview`) — the renderer's WYSIWYG view built from the
   non-secret `ReportModel` (feature spec FR12). It reuses the app's screen tokens and the
   [Data table](./components-v1.md#13-data-table) component, and shows the *same layout* at
   screen scale (§10).

Mouse owns "what it looks like"; Niobe owns "what happens" (the period picker, grouping
selector, account-scope control, confirmation modal flow, and states live in the UX spec).
Where the two meet — the preview panel and the editable header/footer side panel — this doc
defines the visuals and defers the interaction to UX.

**Design intent in one line:** *a calm, recognisably-institutional financial statement —
generous white space, a single brand accent, hairline rules, bold totals, tabular digits that
line up to the cent, and two dignified blank signature areas.*

---

## 2. Tokens used

All values reference [`tokens.md`](./tokens.md). The PDF is a **print medium**, so screen px
tokens are *mapped* to a print scale (§9.2) rather than used verbatim — but the **semantic**
token (which colour, which weight, which rhythm) is always the one named here.

| Area | Token(s) |
|---|---|
| Document text | `color.text.primary` (#1a1420) body & headings; `color.text.secondary` legal/address; `color.text.muted` meta ("Generated …", page footer) |
| Brand accent (rules, title, TOTAL emphasis) | `color.accent.default` (#6d4d8c) |
| Credits / income amounts | `color.success.default` (#1e7a2c) — **see §4.6 B/W rule** |
| Debits / expense amounts | `color.danger.default` (#b81f1f) — **see §4.6 B/W rule** |
| Reconciliation box fill | `color.surface.secondary` (#f4eef8) · border `color.border.default` (#e1d6ea) |
| Closing-balance emphasis fill | `color.accent.subtle` (#ede4f2) |
| Table rules / hairlines | `color.border.subtle` (#ede4f2) row dividers; `color.border.default` section rules |
| Signature blank-area rule | `color.border.strong` (#b8a6ca) |
| Typography family | `--font-family-sans` (system stack); amounts add `font-variant-numeric: tabular-nums` (tokens §2.4) |
| Type scale (semantic) | `type.h1` report title · `type.h2` table captions (Credits/Debits/Reconciliation) · `type.h3` org name · `type.body` line items · `type.body-strong` TOTAL rows & closing balance · `type.small` legal/address/signatory lines · `type.caption` page footer/meta · `type.micro` uppercase section eyebrows |
| Weights | `--font-weight-regular: 400` body · `--font-weight-semibold: 600` headings & TOTALs · `--font-weight-bold: 700` **reserved** — closing-balance figure only |
| Spacing rhythm | 4px base / 8px primary (tokens §3); mapped to mm for print (§9.2) |
| Radius | `radius.md` (6px) reconciliation box & preview card; tables stay square-cornered |
| Elevation | **None in the PDF** — print is flat (no `shadow.*`). The on-screen preview card uses `shadow.card`. |
| Preview controls | [Select](./components-v1.md#3-select--dropdown) (grouping, account scope), [DateRange picker](./components-v1.md#4-date--daterange-picker) (period), [Dialog](./components-v1.md#6-dialog--modal) (confirm), [Button](./components-v1.md#1-button) (Generar PDF) |

**Rule (inherited from tokens §9):** the print template consumes the **same CSS custom
properties** as the renderer (a `report.css` that imports the token `:root` block), so a token
change propagates to the PDF. No raw hex in the template except where §9.2 explicitly fixes a
print-only value (page geometry).

---

## 3. Document anatomy (full-page wireframe)

A4 portrait, one page for the canonical RSE dataset. Regions top-to-bottom: **Header lockup →
Credits table → Debits table → Reconciliation box → Signature footer → page footer**.

```
╔══════════════════════════════════════════════════════════════════════════╗  ← A4 page edge
║  ┌────────────────────────────────────┐        FINANCIAL REPORT 2024      ║
║  │ [LOGO]  Rett Syndrome Europe        │        1 Jan 2024 – 31 Dec 2024   ║  ← HEADER band
║  └────────────────────────────────────┘        Generated 14 Jun 2026      ║
║  Association sans but lucratif — RCS Luxembourg F1819                      ║
║  12 Rue de l'Exemple, L-1234 Luxembourg · treasurer@rett.eu               ║
║ ─────────────────────────────────────────────────────────────────────────║  ← 1.5px accent rule
║                                                                            ║
║  CREDITS 2024                                                              ║  ← H2 caption (eyebrow)
║  Membership fees 2024 ............................     4.650,00 €          ║
║  Donations and grants ............................     4.856,21 €          ║
║ ───────────────────────────────────────────────────────────────────────  ║
║  TOTAL                                                  9.506,21 €         ║  ← bold TOTAL row
║                                                                            ║
║  DEBITS 2024                                                               ║  ← H2 caption
║  Office Expenses .................................    − 1.240,00 €         ║
║  Event / Conference Expenses .....................    − 5.317,50 €         ║
║      ↳ Conference Madrid .........................    − 3.100,00 €         ║  ← indented sub-row
║      ↳ Workshop Lisbon ...........................    − 2.217,50 €         ║  (subcategory grouping)
║  Bank Fees .......................................    −   430,00 €         ║
║  Unclassified ....................................    − 1.660,00 €         ║
║ ───────────────────────────────────────────────────────────────────────  ║
║  TOTAL                                                − 8.647,50 €         ║  ← bold TOTAL row
║                                                                            ║
║  ┌──────────────────────────────────────────────────────────────────┐    ║  ← RECONCILIATION box
║  │ Balance of account 01.01.2024 ...............    32.162,93 €       │    ║
║  │ Credits 2024 ................................   + 9.506,21 €       │    ║
║  │ Debits 2024 .................................   − 8.647,50 €       │    ║
║  │ ════════════════════════════════════════════════════════════════ │    ║
║  │ Balance of account 31.12.2024 ...............    33.021,64 €       │    ║  ← emphasised closing
║  └──────────────────────────────────────────────────────────────────┘    ║
║                                                                            ║
║  ┌───────────────────────────────┐   ┌───────────────────────────────┐   ║  ← SIGNATURE footer
║  │                               │   │                               │   ║   (two columns)
║  │   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄    │   │   ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄    │   ║  ← blank signature rule
║  │   Pedro Rocha                 │   │   Bahadir Dinler              │   ║
║  │   Treasurer RSE               │   │   Auditor                     │   ║
║  │   Spain, 14 Jun 2026          │   │   Türkiye, ____________        │   ║  ← place, date line
║  └───────────────────────────────┘   └───────────────────────────────┘   ║
║                                                                            ║
║         OpenTreasury · Informe financiero 2024 · Page 1 of 1              ║  ← page footer (muted)
╚══════════════════════════════════════════════════════════════════════════╝
```

> Figures above reproduce the RSE 2024 golden fixture; the debit line-items/subtotals are
> illustrative of *subcategory* grouping. At **category** grouping the `↳` sub-rows collapse
> into the parent category total — TOTALs are invariant either way (FR7).

---

## 4. Region specs

### 4.1 Header lockup (FR3)

**Decision (Mouse): left logo-lockup, right-aligned title block.** This is the institutional
convention auditors expect, keeps the brand mark and the legal identity together (top-left
reading anchor), and frees the right rail for the report's "what/when".

- **Left — org identity lockup:**
  - **Logo** first: max height **56px print** (≈14.8mm), width auto, never upscaled past its
    intrinsic size. Aligned to the cap-height of the org name to form a true *lockup*. If no
    logo is set, the org name alone occupies the slot (no placeholder box, no broken-image).
  - **Org name** immediately right of the logo: `type.h3`, `--font-weight-semibold`,
    `color.text.primary`.
  - **Legal registration line** beneath ("Association sans but lucratif — RCS Luxembourg
    F1819"): `type.small`, `color.text.secondary`.
  - **Address · email** on the next line, ` · `-separated: `type.small`, `color.text.muted`.
- **Right — report meta block** (right-aligned):
  - **Title** "Financial Report {year}" / "Informe financiero {año}": `type.h1`,
    `--font-weight-semibold`, `color.accent.default`. For a custom range the title reads
    "Financial Report" with the range carried on the period line.
  - **Period covered**: `type.body`, `color.text.secondary` — "1 Jan 2024 – 31 Dec 2024" (or
    the custom range, locale-formatted dates).
  - **Generated {date}**: `type.caption`, `color.text.muted`.
- **Separator:** a **1.5px `color.accent.default` rule** spans the content width below the band
  (`space.4` above and below). This is the single strongest brand signal on the page.
- **Logo provenance:** non-sensitive org-setting asset embedded by main at generation time
  (FR3, §6.3 of the feature spec) — the renderer/template never reaches into the encrypted
  store for it.

### 4.2 Credits table (FR4)

- **Caption / eyebrow:** "CREDITS {year}" — `type.h2` rendered with `type.micro` treatment
  (uppercase, letter-spacing `0.04em`, `color.accent.default`), `space.5` above, `space.3`
  below.
- **Two columns:** **label** (left, flush-left, `type.body`, `color.text.primary`) +
  **amount** (right, **right-aligned**, `tabular-nums`, European format with `€` suffix).
- **One row per line item.** Leader dots (`....`) optional and decorative only — the binding
  alignment is the right-aligned amount column, not the dots. Row height ≈ **22px print**.
- Income amounts use `color.success.default` **only as reinforcement** — the `+`/positive
  reading and column position carry the meaning (§4.6).
- **Hairline** `color.border.subtle` between the last line item and the TOTAL row.
- **TOTAL row:** label "TOTAL" + amount, both `type.body-strong` (`--font-weight-semibold`),
  `color.text.primary`. A **0.75px `color.border.default` rule above**, no zebra. The TOTAL
  amount equals `getRangeKPIs(from,to).income` — fidelity target **9.506,21 €**.

### 4.3 Debits table (FR5)

Identical structure and styling to Credits, with:

- **Caption:** "DEBITS {year}".
- **Negative amounts:** rendered with a **leading minus and a thin space** before the figure
  — `− 1.240,00 €` (U+2212 MINUS SIGN, not hyphen, for tabular alignment). `color.danger.default`
  as reinforcement only.
- **Subcategory breakout (FR7, when grouping = `category-subcategory`):** sub-rows indented
  `space.5` (20px) under the parent category, prefixed with a `↳` glyph in `color.text.muted`,
  label in `type.small` `color.text.secondary`, amount still right-aligned in the same column
  (the indent never shifts the amount column — digits stay aligned to the cent across parents
  and children). The parent category row becomes a **subtotal header** in `type.body-strong`.
- **TOTAL row:** **− 8.647,50 €**, `type.body-strong`. Same rule-above treatment as Credits.

> **Column-alignment invariant:** the Credits and Debits amount columns share **one right
> edge** down the whole page. Subcategory indentation, sign prefixes, and the reconciliation
> figures all align to that single edge. This is the most important table-fidelity rule.

### 4.4 Reconciliation block (FR8)

The arithmetic heart of the statement — **visually set apart** so the eye lands on the closing
balance.

- **Container:** a boxed block, `color.surface.secondary` fill, `1px color.border.default`
  border, `radius.md` (6px) corners, padding `space.5`, full content width, `space.6` above.
- **Four rows**, label left + amount right (same right edge as the tables):
  1. "Balance of account 01.01.{year}" — opening — **32.162,93 €**, `type.body`.
  2. "Credits {year}" — **+ 9.506,21 €**, `type.body`.
  3. "Debits {year}" — **− 8.647,50 €**, `type.body`.
  4. **"Balance of account 31.12.{year}"** — closing — **33.021,64 €**.
- **Label note (FR8):** reconciliation lines are labelled with the **report year**, not the
  source PDF's "2023" typo. For custom ranges, the opening/closing labels use the range-start
  and range-end dates.
- **Closing-balance emphasis:** a **double rule** (or a 1px `color.accent.default` rule with
  `space.2` gap) separates rows 1–3 from the closing row; the closing row sits on a
  `color.accent.subtle` fill strip, label in `type.body-strong`, **figure in
  `--font-weight-bold` (700)** — the *only* 700-weight on the page (tokens §2.3 reserves bold
  for this kind of singular emphasis). `color.text.primary` (never coloured — the closing
  balance is neither "income" nor "expense").
- **Tie-out:** `32.162,93 + 9.506,21 − 8.647,50 = 33.021,64`. The template renders only what
  `assertReconciles` (FR20) has already proven; design assumes a balanced model.

### 4.5 Signature footer (FR9)

**Two-column, equal-width, printed blocks only — no embedded signature image.**

- **Layout:** two columns, `space.7` gutter, each column 50% minus half-gutter, `space.7`
  above the band (kept off the very bottom edge so the page footer breathes).
- **Left — Treasurer:** blank signature area on top, then printed identity:
  - **Blank signature area:** a clear space ≈ **64px print** tall closed by a **single
    `color.border.strong` rule** (the line you sign on). No box, no shadow, no "X".
  - **Name** "Pedro Rocha" — `type.body`, `color.text.primary`.
  - **Role** "Treasurer RSE" — `type.small`, `color.text.secondary`.
  - **Place, date** "Spain, {date}" — `type.small`, `color.text.muted`. Date may render as a
    fill-in blank (`Spain, ____________`) when signed later in ink.
- **Right — Auditor:** identical structure — blank area + rule, "Bahadir Dinler" / "Auditor" /
  "Türkiye, {date}". The **auditor signs the finished PDF externally**; the app embeds,
  captures, and stores **no** signature image (FR9, §8 of the feature spec). The blank area is
  therefore *real empty space*, sized for a wet or digital signature.
- Signatory name/role/place come from org/profile settings with at-generation overrides; the
  template prints whatever the `ReportModel` carries.

### 4.6 Colour usage that survives B/W printing (FR — print spec)

Auditors print in black-and-white. Colour is **never the sole channel**:

| Meaning | Primary (always-on) channel | Colour (reinforcement) |
|---|---|---|
| Income / credit | Column = Credits table; positive figure | `color.success.default` |
| Expense / debit | Column = Debits table; **`−` minus prefix** | `color.danger.default` |
| TOTAL | "TOTAL" label + semibold weight + rule-above | — (stays `text.primary`) |
| Closing balance | Boxed + `accent.subtle` strip + bold weight + double rule | — (stays `text.primary`) |
| Brand | Header rule + title | `color.accent.default` |

In grayscale, `success.default` (#1e7a2c) and `danger.default` (#b81f1f) resolve to clearly
**different mid-greys**, and every semantic distinction remains legible from position, weight,
prefix, and rules alone. **Test:** print the golden fixture in grayscale — no information may
be lost (§8 checklist).

---

## 5. Number & currency formatting (FR10)

- **European format, active locale:** `.` thousands separator, `,` decimal — `9.506,21`.
- **Currency:** `€` as a **suffix**, preceded by a **non-breaking space** (U+00A0):
  `9.506,21 €`. The amount and its symbol never wrap apart.
- **Negative:** **U+2212 MINUS SIGN** + thin space + figure: `− 8.647,50 €`. (Hyphen-minus is
  forbidden in the document body — it breaks tabular alignment and reads as a list dash.)
- **Tabular digits:** every amount cell carries `font-variant-numeric: tabular-nums` +
  `font-feature-settings: 'tnum'` (tokens §2.4) so digits, thousands dots, and the decimal
  comma form perfect vertical columns down the page.
- **Right-alignment:** all amount columns (tables + reconciliation) are right-aligned to the
  single shared right edge (§4.3 invariant).

---

## 6. Layout & grid

- **Content frame:** A4 portrait, `210 × 297mm`, with print margins **18mm top/bottom,
  20mm left/right** (§9.2). Content column ≈ **170mm** wide.
- **Vertical rhythm:** header → `space.4` → accent rule → `space.5` → Credits → `space.5` →
  Debits → `space.6` → reconciliation box → `space.7` → signatures → page footer pinned to the
  bottom margin.
- **Two-column zones:** only the header band (identity | meta) and the signature footer
  (treasurer | auditor). Everything else is a single full-width column for maximum digit-row
  legibility.
- **One page is the target** for a typical NGO year. Long category lists page-break per §7.

---

## 7. Print / page spec (FR11 — HTML → `printToPDF`)

### 7.1 Page geometry

```css
@page {
  size: A4 portrait;
  margin: 18mm 20mm;            /* top/bottom 18mm, left/right 20mm */
}
```

- Rendered by `webContents.printToPDF` with `printBackground: true` (so the reconciliation
  box fill, the accent strip, and table rules survive), `pageSize: 'A4'`, `landscape: false`,
  and margins matching `@page` (set in `printToPDF` options to avoid double margins).

### 7.2 Page-break behaviour (long category lists)

- **Tables never split a line item from its amount:** every line-item row is
  `break-inside: avoid`.
- **A TOTAL row never orphans:** the last 2 line items + the TOTAL row are kept together
  (`break-inside: avoid` on a wrapping `<tfoot>`/group). A TOTAL never starts a new page alone.
- **The reconciliation box is atomic:** `break-inside: avoid` — it is short and must read as
  one unit; if it doesn't fit, it moves wholesale to page 2.
- **The signature footer is atomic** and `break-inside: avoid` — both columns always travel
  together; signatures never split across a page boundary.
- **Caption + first rows stay together:** each table caption uses `break-after: avoid` so a
  "DEBITS 2024" heading is never stranded at the foot of a page.
- **Running page footer:** "OpenTreasury · Informe financiero {year} · Page {n} of {m}" in
  `type.caption` / `color.text.muted`, pinned to the bottom margin on every page.
- **Repeat table headers:** when a table spans pages, its column context repeats via
  `<thead>` (`display: table-header-group`).

### 7.3 Font & colour for print

- **Font:** the OS system stack (`--font-family-sans`, tokens §2.1) — embedded by the print
  engine; **no web fonts** (Principle P4, offline-first). Tabular numerics via
  `tabular-nums` are supported by every system font in the stack.
- **Colour:** `print-color-adjust: exact` on coloured fills/rules so the accent rule and box
  fills are not "ink-saved" away by the print pipeline.
- **No shadows, no rounded photographic chrome** — print is flat. The only radius is the
  reconciliation box (`radius.md`), which prints as a clean 6px corner.

---

## 8. Fidelity checklist (Mouse signs off against the RSE 2024 template)

Each item is a binary pass/fail the implementing PR must satisfy before the PDF is considered
faithful. Mouse reviews the rendered golden-fixture PDF against this list.

**Header**
- [ ] Logo embeds at ≤56px height, never upscaled; org-name lockup aligned to logo cap-height.
- [ ] Legal registration line present verbatim ("Association sans but lucratif — RCS
      Luxembourg F1819"), `type.small`/`text.secondary`.
- [ ] Address + contact email render on one ` · `-separated line, `text.muted`.
- [ ] Title "Financial Report {year}" right-aligned, `type.h1`, `accent.default`; period line
      beneath; "Generated {date}" meta.
- [ ] 1.5px accent rule separates header from body.

**Credits & Debits tables**
- [ ] Label column left, amount column right-aligned to a **single shared right edge**.
- [ ] One row per line item; bold "TOTAL" row with rule-above.
- [ ] Credits TOTAL = **9.506,21 €**; Debits TOTAL = **− 8.647,50 €** on the golden fixture.
- [ ] Debit amounts use U+2212 minus + thin space; subcategory rows indent without shifting the
      amount column.
- [ ] "Unclassified" line appears in the correct table when fixture has uncategorised rows.

**Reconciliation**
- [ ] Boxed/ruled block, `surface.secondary` fill, set apart from the tables.
- [ ] Four rows: opening **32.162,93 €**, credits **+9.506,21 €**, debits **−8.647,50 €**,
      closing **33.021,64 €**.
- [ ] Lines labelled with the **report year** (not "2023").
- [ ] Closing balance emphasised: `accent.subtle` strip + **700-weight** figure + double rule;
      arithmetic ties out exactly.

**Signature footer**
- [ ] Two equal columns, Treasurer left / Auditor right.
- [ ] Each block: blank signature area closed by a `border.strong` rule + printed name + role +
      place/date line.
- [ ] **No embedded/captured signature image anywhere** (verify template has no `<img>` for a
      signature).

**Number format**
- [ ] European format `9.506,21`; `€` suffix with non-breaking space; tabular digits aligned.

**Print / page**
- [ ] A4 portrait, 18/20mm margins, `printBackground: true`.
- [ ] One page for the canonical fixture; long lists page-break without orphaning TOTALs or
      splitting the reconciliation/signature blocks.
- [ ] **Grayscale print test:** print in B/W — every income/expense/total/closing distinction
      remains legible from position, weight, prefix, and rules (no colour-only meaning).
- [ ] Running page footer with "Page n of m".

**On-screen preview parity**
- [ ] Preview layout matches the PDF region order and the shared amount right-edge.
- [ ] Preview built from `ReportModel` aggregates only — no transaction-level rows (FR12).

---

## 9. Token mapping detail (for the implementing PR)

### 9.1 Semantic → CSS variable

The print template imports the token `:root` block and references variables — it does **not**
hard-code hex (except page geometry, §9.2):

| Template element | CSS variable |
|---|---|
| Body text | `var(--color-text-primary)` |
| Legal/address | `var(--color-text-secondary)` / `var(--color-text-muted)` |
| Title + header rule + closing strip border | `var(--color-accent-default)` |
| Income amount | `var(--color-success-default)` |
| Expense amount | `var(--color-danger-default)` |
| Reconciliation box fill / border | `var(--color-surface-secondary)` / `var(--color-border-default)` |
| Closing strip fill | `var(--color-accent-subtle)` |
| Table dividers | `var(--color-border-subtle)` |
| Signature rule | `var(--color-border-strong)` |
| Font family | `var(--font-family-sans)` |

### 9.2 Screen px → print scale

Screen tokens are px (96dpi UI). For A4 print, the template fixes an explicit **print type
scale** that preserves each token's *semantic step* while reading correctly at paper size.
(`pt` chosen because print engines reason in pt; 1pt ≈ 1.333px.)

| Semantic token | Screen (px) | **Print (pt)** | Applied to |
|---|---|---|---|
| `type.h1` | 22 | **17pt** | Report title |
| `type.h3` | 16 | **12.5pt** | Org name |
| `type.h2` (eyebrow) | 18 | **9.5pt** uppercase, `0.04em` tracking | Table captions |
| `type.body` | 14 | **10.5pt** | Line items, reconciliation rows |
| `type.body-strong` | 14/600 | **10.5pt/600** | TOTAL rows, closing label |
| closing figure | — | **11.5pt/700** | Closing balance only |
| `type.small` | 13 | **9pt** | Legal, address, signatory lines |
| `type.caption` | 12 | **8pt** | Meta, page footer |

| Spacing token | Screen (px) | **Print (mm)** |
|---|---|---|
| `space.3` | 12 | **3mm** |
| `space.4` | 16 | **4mm** |
| `space.5` | 20 | **5mm** |
| `space.6` | 24 | **6mm** |
| `space.7` | 32 | **8mm** |

> These print values are the **only** place the template departs from raw screen tokens, and
> they are derived 1:1 from the semantic scale — not invented. A change to the screen scale
> updates this table in the same PR (tokens §9 propagation rule).

---

## 10. On-screen preview (`REP-1.preview`) — design notes

The renderer preview is **not** the PDF; it is a faithful screen rendering of the same
`ReportModel`, using app screen tokens and existing components. Interaction (period picker,
grouping/account selectors, confirm modal, save toast) is owned by the
[UX spec](../ux/specs/spec-030-financial-report.md); this section pins only the visuals.

- **Preview card:** `color.surface.primary`, `radius.md`, `shadow.card`, padding `space.6`.
  Renders header → Credits → Debits → reconciliation → signatures in the **same order and the
  same shared amount right-edge** as the PDF, at screen type scale (px tokens, not the print
  pt scale).
- **Tables:** reuse the [Data table](./components-v1.md#13-data-table) component
  (`tabularNumeric: true`, `align: 'end'` on the amount column). No selection, no sort — this
  is a passive view. TOTAL rows use the data-table `stickyFooter`-style emphasis (semibold,
  rule-above), **not** sticky (the preview scrolls as one document).
- **Controls (side panel / toolbar, UX-owned placement):**
  - Period: [DateRange picker](./components-v1.md#4-date--daterange-picker) + a calendar-year
    quick-pick.
  - Grouping level: [Select](./components-v1.md#3-select--dropdown) — "Categoría" /
    "Categoría → Subcategoría".
  - Account scope: [Select](./components-v1.md#3-select--dropdown) — "Todas las cuentas
    (consolidado)" / per-account.
  - **Generar PDF**: primary [Button](./components-v1.md#1-button) — disabled until a period is
    selected (list-starts-empty).
- **Confirmation modal:** [Dialog](./components-v1.md#6-dialog--modal) `sm`, **lightweight** —
  a single confirm button, **no typed-word step** (unlike SPEC-027 Export's `EXPORTAR` gate).
  Body reuses the SPEC-027 §2.6 decrypted-artifact disclosure tone (`warning` accenting).
- **Editable header/footer side panel:** org name/legal/address/email, **logo**, and the two
  signatory blocks are pre-filled from settings and editable inline; uses standard
  [Input](./components-v1.md#2-input--textfield) fields. Live edits reflect into the preview.
- **Dark mode:** the **preview** honours dark theme (tokens §1.3) like any screen. The **PDF**
  is always the light/print palette regardless of app theme — an auditor's document is never
  dark-mode.
- **Accessibility:** preview region `aria-live="polite"` announces totals on rebuild (NFR3);
  amount cells tabular; colour-not-sole-channel as §4.6; controls keyboard-reachable per the
  component specs.

---

## 11. Accessibility (design-level)

- **Contrast:** every text/background pair used is an AA-passing pair from tokens §1.4
  (`text.primary` on `surface.secondary` = 14.3:1; `success.default` on white = 5.6:1;
  `danger.default` on white = 6.1:1; `accent.default` on white = 6.7:1 for the title/rule as a
  large/UI element).
- **Colour-not-sole-channel:** §4.6 — position, weight, `−` prefix, and rules carry every
  meaning; grayscale-print-safe.
- **PDF readable order (NFR3):** template DOM order = visual order (header → credits → debits →
  reconciliation → signatures → footer), so `printToPDF` tagged/readable order is correct on a
  best-effort basis. Tables are real `<table>` with `<th scope="col">`.
- **Touch/print targets:** N/A for the PDF; preview controls inherit component min-sizes.

---

## 12. Open design risks (Mouse flags for the coordinator)

1. **Logo aspect ratio is org-supplied and unconstrained.** A very wide or very tall logo can
   unbalance the header lockup. *Mitigation:* cap at 56px height **and** ~280px width (print),
   `object-fit: contain`; document a "recommended logo: horizontal, ≥2:1, transparent PNG/SVG"
   note in org settings. Low severity, but worth a one-line settings hint in the implementing
   PR.
2. **Long category lists → multi-page balance of the signature footer.** If categories push the
   signatures to a second page, page 1 can look sparse. *Mitigation:* the atomic page-break
   rules (§7.2) keep it correct, but Mouse recommends the implementer **visually QA a
   30+-category fixture**, not just the 4-line golden one.
3. **System-font metric drift across OSes.** `Segoe UI Variable` (Win11) vs `Segoe UI` (Win10)
   vs the macOS/Linux fallbacks have slightly different widths, so the right-edge amount column
   is pinned by `tabular-nums` + right-alignment, **not** by fixed pixel widths. Verified safe,
   but flagged so no one "fixes" alignment with hard widths later.
4. **Subcategory indent vs amount alignment.** The `↳` indent must never shift the amount
   column. Called out as the §4.3 invariant; the single highest-risk table detail — worth an
   explicit visual-regression snapshot.
5. **B/W proximity of mid-greys.** In grayscale, income-green and expense-red land on close-ish
   mid-greys; the `−` prefix and column position are the real differentiators. The §8 grayscale
   test is **mandatory**, not optional.

None of these block acceptance — they are implementation-QA notes for the build PR.

---

## 13. Traceability

- **Paired feature spec:** [`docs/specs/030-financial-report.md`](../specs/030-financial-report.md)
  (FR3–FR11, FR21 mapped above).
- **Paired UX spec:** [`docs/ux/specs/spec-030-financial-report.md`](../ux/specs/spec-030-financial-report.md)
  (states, flows, copy — interaction owner).
- **Design system:** [`tokens.md`](./tokens.md) · [`components-v1.md`](./components-v1.md) ·
  [`design-principles.md`](./design-principles.md).
- **Reused-pattern precedent:** [SPEC-027 Export](../specs/027-export.md) — confirmation modal
  tone, locale/number format, save-toast, decrypted-artifact disclosure.

---

## 14. Sign-off

**Mouse (visual design) — design-fidelity pass: APPROVED, 2026-06-14.**
The PDF template contract above pins pixel-fidelity to the RSE Financial Report 2024 across
all six target regions (header lockup, credits table, debits table, reconciliation block,
two-column signature footer, A4 print/page behaviour), maps every visual decision to a named
design token, and provides a build-ready fidelity checklist (§8) the implementing PR is
measured against. The five open items in §12 are implementation-QA notes, not blockers.

**Niobe (UX) — concurs:** preview/control placement and the lightweight-confirmation
treatment are consistent with the paired UX spec; no interaction conflicts.

This was the final gate outstanding for SPEC-030. With Pedro's scope sign-off and all five
reviewers approved, the spec advances **In Review → Accepted**.
