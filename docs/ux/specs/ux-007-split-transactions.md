# UX-007 — Split Transactions

> **Status:** Draft v0.3 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-04-29
> **Paired spec:** [`docs/specs/023-split-transactions.md`](../../specs/023-split-transactions.md)
> **Paired PRD:** Pending (PRD-023 reservation needed — see issue #59)

**Traceability:** SPEC-023 FR1–FR16 · vision §5, §7 Principles 2 & 5 · ADR-001 C6/C13

---

## 1. Overview

This UX spec covers the full interaction design for **Split Transactions** — the ability
to divide one confirmed transaction into two or more sub-amounts, each with its own
category and comment. It extends the Movements screen
([UX-003](./ux-003-movements-screen.md)) with a modal split editor.

The spec answers:
- How the user discovers and triggers a split.
- What the split editor looks like and how it behaves.
- How split transactions appear in the list and in financial views.
- How the user removes a split.

---

## 2. Entry Points

### 2.1 Row action — "Split transaction"

On the Movements list, every confirmed transaction row exposes a contextual action menu
(the same menu that contains Edit and Delete per UX-003 §4.3).

A new item is added: **Dividir movimiento** (ES) / **Split transaction** (EN).

- This action is only available for confirmed, non-deleted transactions.
- It opens the Split Editor modal (§3).

### 2.2 Split badge on already-split rows

A transaction that already has active splits shows a persistent split badge alongside its
amount. The badge is a small icon (scissors or split-path icon per Mouse's design token
conventions). Clicking the badge (or choosing "Editar división" from the action menu)
opens the Split Editor in edit mode, pre-populated with the existing splits.

---

## 3. Split Editor Modal

### 3.1 Modal anatomy

```
┌──────────────────────────────────────────────────────────────────────┐
│  Dividir movimiento                                        [×]       │
│  ─────────────────────────────────────────────────────────────────── │
│  Movimiento original: 2026-03-15 · Unicaja · €500,00 Gasto          │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  #   Importe       Categoría       Subcategoría   Comentario │   │
│  │  ─────────────────────────────────────────────────────────── │   │
│  │  1   €[______]    [─ Selec. ─▾]   [─ Selec. ─▾]  [______]  │   │
│  │  2   €[______]    [─ Selec. ─▾]   [─ Selec. ─▾]  [______]  │   │
│  │  [+ Añadir parte]                                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  Importe distribuido: €0,00 de €500,00       Restante: €500,00      │
│  ⚠ Los importes deben sumar €500,00                                 │
│                                                                      │
│  [Eliminar división]          [Cancelar]  [Guardar división]        │
└──────────────────────────────────────────────────────────────────────┘
```

*(EN variant — labels swap to "Split transaction", "Original movement", "Amount",
"Category", "Subcategory", "Comment", "+ Add part", "Distributed: €0.00 of €500.00",
"Remaining: €500.00", "⚠ Amounts must total €500.00", "Remove split", "Cancel",
"Save split".)*

### 3.2 Fields per split row

| Field | Type | Required | Constraints |
|---|---|---|---|
| Amount | Numeric input | **Yes** | Positive, EUR, locale-aware (`Intl.NumberFormat`) |
| Category | Dropdown (same list as transaction form) | No | Nullable |
| Subcategory | Dropdown (filtered by selected category) | No | Nullable; resets when category changes |
| Comment | Text input | No | Max 500 chars; trimmed; empty → null |

The **Category → Subcategory** dependency mirrors the existing transaction create/edit
form (UX-003 §5.2). When the user changes a category, the subcategory resets to "None".

### 3.3 Running total strip

Below the split rows, a persistent strip shows:

```
Importe distribuido: €300,00 de €500,00    Restante: €200,00
```

- Updates live on every amount keystroke.
- When restante = €0,00: strip turns green and the warning message disappears.
- When restante ≠ €0,00: strip shows warning text (amber); **Guardar división** button
  is disabled.
- When any split has amount = €0 (or empty): strip shows warning; button disabled.

Locale-aware formatting: `Intl.NumberFormat` with active locale for all amounts
displayed in the strip.

### 3.4 Add / remove split rows

- **"+ Añadir parte"** appends a new empty row at the bottom. Maximum 20 rows (SPEC-023
  FR — `MAX_SPLITS_PER_TX = 20`); at 20 rows the button is disabled with tooltip
  "Máximo 20 partes".
- Each split row has a **[×]** delete control on the right. Deleting a row:
  - Removes the row.
  - If fewer than 2 rows remain: the deleted row UI is replaced with an inline warning
    "Una división requiere al menos 2 partes." — the × control on the last row is
    disabled (minimum 2 enforced in UI, SPEC-023 FR2).
- The editor opens with 2 empty rows pre-populated (one for each minimum split).

### 3.5 Save behaviour

"Guardar división" is enabled only when:
1. ≥ 2 split rows exist.
2. All rows have amount > 0.
3. Sum of split amounts (in cents) equals parent amount (SPEC-023 FR3). Integer
      comparison — no floating-point tolerance needed.

On click:
1. Renderer sends `tx:split` IPC request.
2. Loading state on button: spinner, "Guardando…".
3. On success: modal closes; parent row in the Movements list updates to show the split
   badge; totals strip recalculates.
4. On error (sum mismatch from main process, validation error): modal stays open; inline
   error banner at top: "No se pudo guardar la división: [reason]".

### 3.6 Cancel behaviour

"Cancelar" closes the modal without saving. If the user has made any changes (compared
to the initial state when the editor opened), show a confirmation dialog:

```
¿Descartar cambios?
Los cambios en esta división no se han guardado.
[Descartar]   [Seguir editando]
```

If no changes were made, close immediately without confirmation.

### 3.7 Remove split

"Eliminar división" appears only when editing an existing split (editor opened from the
split badge or "Editar división" action). It is NOT shown when creating a new split.

On click, show a confirmation dialog:

```
¿Eliminar la división?
Se eliminarán todas las partes. El movimiento volverá
a tratarse como un único importe de €500,00.
[Eliminar]   [Cancelar]
```

On confirm:
1. Renderer sends `tx:split:remove` IPC request.
2. On success: modal closes; parent row reverts to normal (no split badge); totals strip
   recalculates using the parent amount.

### 3.8 Transaction edit form — amount field locked when splits are active (FR14)

When the user opens the standard Edit Transaction form for a parent that has active
splits, the **Amount field is disabled** (grayed out, not focusable). An inline notice
appears below the field:

> *"El importe está bloqueado porque este movimiento tiene partes. Elimina la división
> para cambiar el importe."*
> *(EN: "Amount is locked because this transaction has splits. Remove the split to
> change the amount.")*

All other fields (description, tags, reference, details) remain editable.

The "Edit" row action on a split parent SHOULD open the split editor directly (not the
plain edit form), routing via `hasSplits` from the `movementRecordSchema` wire field.
If the user reaches the plain edit form through another path (e.g. keyboard shortcut),
the amount lock provides the safety net.

---

## 4. Movements List — Split Row Presentation

### 4.1 Parent row (has active splits)

The parent row renders normally in the Movements table with the following additions:

- **Split badge:** A small scissors / split icon appears to the left of the amount
  column (exact styling: Mouse owns). The badge has an accessible label:
  `aria-label="Movimiento dividido"` / `"Split transaction"`.
- **Amount column:** The parent's own amount is shown (e.g., "€500,00") but is
  visually de-emphasised (lighter colour or strikethrough is Mouse's decision). A
  secondary label below the amount reads "N partes" (e.g., "2 partes") indicating
  the split count.
- **Category column:** Shows "—" or "Dividido" (Mouse's call) since the category
  is per-split, not on the parent row.
- **Row actions:** "Editar" on a split parent MUST open the split editor (not the plain
  transaction edit form) — routed via `hasSplits` from `movementRecordSchema`; "Eliminar"
  deletes the parent and all splits; "Dividir" / "Editar división" is the contextual
  split-specific action (see §2.2).

### 4.2 Filtering behaviour (SPEC-023 FR10)

When a category filter is active, the parent row appears if **any** of its splits
matches the selected category. The secondary "N partes" label is still shown to signal
that the full amount may not apply to the filtered category.

### 4.3 Individual splits do NOT appear as rows

Splits are never shown as separate rows in the Movements list. This preserves the
one-row-per-bank-transaction mental model.

---

## 5. Financial Views — Aggregation Presentation

### 5.1 Movements totals strip

The totals strip (income / expense / net) uses split amounts, not the parent amount,
for split transactions (SPEC-023 FR9). No additional visual treatment is required in
the strip itself — it just computes correctly.

### 5.2 Saldo view (UX-004)

Saldo category breakdowns show each split under its own category. If a split has no
category, it appears under "Sin categorizar" with a label clarifying it is a split part.

### 5.3 Panel / Dashboard (UX-005)

The Panel expense / income breakdown by category uses split amounts per category bucket.
No special "split" affordance is needed in the Panel — the numbers just aggregate
correctly.

---

## 6. Empty & Error States

| State | Trigger | Copy (ES) | Copy (EN) |
|---|---|---|---|
| No splits yet (new split editor) | User opens split for first time | *Pre-populated with 2 empty rows; no empty-state copy needed.* | — |
| Sum mismatch | Amounts do not sum to parent | "Los importes deben sumar €{amount}" | "Amounts must total €{amount}" |
| Single split attempt | User deletes to 1 row | "Una división requiere al menos 2 partes" | "A split requires at least 2 parts" |
| Save IPC error | Main process returns error | "No se pudo guardar la división: {reason}" | "Could not save the split: {reason}" |
| Remove IPC error | `tx:split:remove` returns error | "No se pudo eliminar la división" | "Could not remove the split" |

---

## 7. Keyboard & Accessibility

- **Focus trap:** The modal traps focus within it when open. `Escape` triggers the
  "Cancelar" flow (with unsaved-changes confirmation if applicable).
- **Tab order per split row:** Amount → Category → Subcategory → Comment → [×] delete
  → (next row Amount, or "+ Añadir parte" button).
- **"+ Añadir parte"** button: activated by `Enter` or `Space`. New row receives focus
  on Amount field immediately.
- **Save button:** Activated by `Enter` when focused; also responds to keyboard shortcut
  `Ctrl+Enter` / `⌘+Enter` from anywhere inside the modal.
- **ARIA live region:** A visually-hidden `role="status"` element announces changes to
  the running total strip (e.g., "Restante: €200,00") so screen-reader users hear the
  balance update without moving focus.
- **Error announcements:** Inline errors are associated with their fields via
  `aria-describedby`. The sum-mismatch warning is also announced via the live region
  when it first appears.
- **Split badge in the list:** `aria-label` on the badge icon communicates the split
  state to screen readers (see §4.1).

---

## 8. i18n String Keys

All keys belong to the `split` namespace in the i18n string table. Both ES and EN must
be populated before this spec moves to Accepted.

| Key | ES | EN |
|---|---|---|
| `split.modal.title` | Dividir movimiento | Split transaction |
| `split.modal.originalLabel` | Movimiento original | Original movement |
| `split.modal.colAmount` | Importe | Amount |
| `split.modal.colCategory` | Categoría | Category |
| `split.modal.colSubcategory` | Subcategoría | Subcategory |
| `split.modal.colComment` | Comentario | Comment |
| `split.modal.addPart` | + Añadir parte | + Add part |
| `split.modal.distributed` | Importe distribuido: {distributed} de {total} | Distributed: {distributed} of {total} |
| `split.modal.remaining` | Restante: {amount} | Remaining: {amount} |
| `split.modal.sumWarning` | Los importes deben sumar {amount} | Amounts must total {amount} |
| `split.modal.minPartsWarning` | Una división requiere al menos 2 partes | A split requires at least 2 parts |
| `split.modal.maxPartsWarning` | Máximo 20 partes | Maximum 20 parts |
| `split.modal.cancel` | Cancelar | Cancel |
| `split.modal.save` | Guardar división | Save split |
| `split.modal.saving` | Guardando… | Saving… |
| `split.modal.remove` | Eliminar división | Remove split |
| `split.modal.saveError` | No se pudo guardar la división: {reason} | Could not save the split: {reason} |
| `split.modal.removeError` | No se pudo eliminar la división | Could not remove the split |
| `split.modal.discardTitle` | ¿Descartar cambios? | Discard changes? |
| `split.modal.discardBody` | Los cambios en esta división no se han guardado. | Changes to this split have not been saved. |
| `split.modal.discardConfirm` | Descartar | Discard |
| `split.modal.discardCancel` | Seguir editando | Keep editing |
| `split.modal.removeTitle` | ¿Eliminar la división? | Remove the split? |
| `split.modal.removeBody` | Se eliminarán todas las partes. El movimiento volverá a tratarse como un único importe de {amount}. | All parts will be removed. The transaction will revert to a single amount of {amount}. |
| `split.modal.removeConfirm` | Eliminar | Remove |
| `split.modal.removeCancel` | Cancelar | Cancel |
| `split.list.badge` | Movimiento dividido | Split transaction |
| `split.list.partCount` | {count} partes | {count} parts |
| `split.list.categoryCell` | Dividido | Split |
| `split.actions.split` | Dividir movimiento | Split transaction |
| `split.actions.editSplit` | Editar división | Edit split |
| `split.saldo.uncategorizedSplit` | Sin categorizar (parte de división) | Uncategorized (split part) |

---

## 9. Open Questions for Niobe / Mouse

1. **Split badge icon:** Should the badge be a scissors icon, a split-path icon, or a
   numeric count bubble (e.g., ②)? *Recommend scissors + count ("✂ 2"), but Mouse
   decides the exact token.*

2. **Parent amount visual treatment in the list:** Should the parent amount be shown
   with a strikethrough, de-emphasised, or hidden entirely? *Recommend de-emphasised
   (muted colour) with "N partes" sub-label — strikethrough may confuse users.*

3. **Split editor: inline form or slide-over panel?** The spec assumes a centred modal;
   a slide-over panel on the right would keep the transaction list visible for context.
   *Recommend slide-over for desktop Electron — more spatial context — but open to
   Mouse's preference.*

4. **Category display in list row when parent is split:** "Dividido" may not be
   meaningful to users. Alternatives: list the first split's category + "…", or show
   nothing. *Recommend blank ("—") with the split badge handling the communication.*

---

## 10. Status History

| Date | Status | By | Notes |
|---|---|---|---|
| 2026-04-26 | Draft v0.1 | Niobe | Initial UX spec from issue #59. Paired with SPEC-023. |
| 2026-04-26 | Draft v0.2 | Niobe | Rev 2 in response to Neo architectural review: updated max-splits reference from open question to constant (§3.4), added §3.8 (amount field locked when splits active — FR14), updated Edit row action routing to use `hasSplits` (FR14), updated traceability to FR1–FR16. |
| 2026-04-29 | Draft v0.3 | Niobe | Rev 3: Updated sum validation to integer cents (no float tolerance). Aligned with SPEC-023 Rev 3 (Pedro's 6 lock answers). |
