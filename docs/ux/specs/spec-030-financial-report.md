# SPEC-030 (UX) — Financial Report

> **Status:** In Review (stub) · **Owner:** Niobe · **Last updated:** 2026-06-14
> **Paired feature spec:** [`docs/specs/030-financial-report.md`](../../specs/030-financial-report.md)
> **Paired Design:** Pending — Mouse (template fidelity to the RSE Financial Report 2024 PDF)

---

## 1. Summary

Pedro needs the year-end financial statement the board and the auditor expect — the
one-page document with income, expenses, and an opening/closing bank-balance
reconciliation. He opens **Informes → Informe financiero**, picks the calendar year (or a
custom range), chooses the **grouping level** (category vs category→subcategory) and the
**account scope** (all accounts consolidated, or one account), reviews a live preview
built from his own (decrypted-in-main, aggregated) figures, confirms a lightweight
decrypted-artifact warning, and saves a **PDF** to his Documents folder. He prints it and
the **external auditor signs the finished PDF** — the app neither captures nor stores any
signature image. The screen starts empty and walks him through one decision at a time.

This UX stub captures the entry point, the happy path, the key states, and the copy
surface. The canonical functional/security behaviour lives in the paired feature spec;
full flows, every error/empty state, the ES/EN copy table, and the state diagram are
**TODO** for the In-Review pass.

## 2. Entry Points

| # | Trigger | Behaviour |
|---|---|---|
| 1 | Click **Informes** / **Reports** in the sidebar (UX-006 nav slot) | Route → `/reports`; v1 content is the Financial Report generator. |
| 2 | Deep link `/reports` | Same; state = "period-empty" (list-starts-empty rule). |

Sidebar item uses the Lucide `FileText` icon; ES label `Informes`, EN label `Reports`.

## 3. Happy-Path Walkthrough (outline)

Screen ID: **`REP-1` (Financial Report screen)**.

| # | Step | Screen state |
|---|---|---|
| 1 | Pedro opens `/reports` | `REP-1.period-empty` — title *"Informe financiero"*, prompt *"Selecciona un año o un rango para comenzar."*, *Generar* disabled. |
| 2 | He picks **Año 2024** (or a custom date range), sets the **grouping level** (Categoría / Categoría → Subcategoría) and the **account scope** (Todas las cuentas / una cuenta) | `REP-1.building` → `REP-1.preview` — credits table, debits table, reconciliation block and signature footer render from the `ReportModel`. |
| 3 | He reviews / edits header (incl. **logo**) & signatory fields in the side panel | `REP-1.preview` (no state change). |
| 4 | He clicks **Generar PDF** | `REP-1.confirming` — **lightweight** decrypted-artifact confirmation modal (simple confirm button, **no typed-word step**, unlike SPEC-027 Export). |
| 5 | He confirms; OS save dialog opens (default = Documents) | `REP-1.choosing-path`. |
| 6 | He saves | `REP-1.generating` → `REP-1.success` — toast *"Informe financiero 2024 generado."* + **Mostrar en carpeta**. |

## 4. States (to expand in In-Review pass)

- `period-empty` · `building` · `preview` · `confirming` · `choosing-path` ·
  `generating` · `success` · `error` (CE-XXX) · `locked-workspace` (encrypted-but-locked
  → generation refused).

## 5. Accessibility

WCAG 2.1 AA. Keyboard-reachable period picker, grouping-level selector, account-scope
selector, header/footer fields, preview region, and confirmation modal.
`aria-live="polite"` announces the preview totals and the busy state. Full audit is
**TODO**.

## 6. Copy (ES / EN) — TODO

A complete ES + EN copy table (titles, prompts, modal body, toasts, error copy via the
`crypto-error-copy-catalog` process) is required before this UX spec moves to In Review.

## 7. Open Questions

All nine feature-spec Open Questions were **resolved by Pedro on 2026-06-14** (see
[feature spec §12](../../specs/030-financial-report.md#12-open-questions)). No
signature-image upload UX exists — signatures are printed blocks signed externally.
Remaining UX-only detail (preview-panel layout, header/footer + logo edit affordance,
grouping/account selector placement) is design polish owned by Niobe/Mouse for the
In-Review pass.
