---
name: "modal-shell-overrides"
description: "Resize or restyle a shared <dialog> shell from a child component's own CSS without forking the shell."
domain: "css, components, modals"
confidence: "high"
source: "earned — BulkClassifyModal sizing fix (2026-04-23, fix/bulk-classify-modal-size)"
---

## Context

Several modals in this app reuse the `TransactionDetailModal` shell (header / footer / backdrop / padding / focus ring). The shell is sized for the largest consumer (the full transaction edit form: `width: 760px`, `edit-body min-height: 520px`). Smaller consumers — e.g. `BulkClassifyModal` (Category + Subcategory pickers only) — need a tighter footprint without duplicating the shell.

Apply this skill whenever a child modal:
- Renders the shell classes (`ot-transaction-detail-modal`, `ot-transaction-detail-modal--edit`, etc.) on its `<dialog>`,
- Wants to keep the shell's chrome (header, footer, focus, tokens, backdrop), but
- Needs different sizing (width, min-height, max-height) or other surgical visual changes.

## Patterns

1. **Add a sibling marker class on the `<dialog>`** — e.g. `ot-bulk-classify-modal`. Render it alongside the shell classes:
   ```tsx
   <dialog className="ot-transaction-detail-modal ot-transaction-detail-modal--edit ot-bulk-classify-modal" />
   ```

2. **Order the CSS imports so the child wins the cascade.** In the child .tsx, import the shell CSS first, then the child CSS:
   ```ts
   import '../TransactionDetailModal/TransactionDetailModal.css';
   import './BulkClassifyModal.css';
   ```
   Equal-specificity rules from the later import win — no `!important` needed.

3. **Scope every override under the marker class.** Don't restyle bare shell selectors:
   ```css
   .ot-bulk-classify-modal { width: 480px; }
   .ot-bulk-classify-modal .ot-transaction-detail-modal__edit-body { min-height: 0; }
   ```

4. **Keep `max-width: 92vw` (and other safety rules) inheriting from the shell.** Only override what you actually need to change.

5. **Let internal scrollers handle growth.** If the modal has variable-height content (e.g. a failures panel), give that section its own `max-height` + `overflow-y: auto` so the dialog stays compact when the section is empty and grows predictably when populated.

## Examples

`app/src/renderer/components/BulkClassifyModal/BulkClassifyModal.css`:
```css
.ot-bulk-classify-modal {
  width: 480px;
}
.ot-bulk-classify-modal .ot-transaction-detail-modal__edit-body {
  min-height: 0;
}
```
Combined with `BulkClassifyModal.tsx` rendering the marker class on the `<dialog>` and importing its CSS after the shell — the detail modal stays 760×520 for editing transactions, the bulk modal collapses to ~480 wide, auto-height.

## Anti-Patterns

- ❌ **Forking the shell CSS** into the child component. Drift between consumers (header padding, focus colour, backdrop blur) follows quickly.
- ❌ **Editing `TransactionDetailModal.css`** to add child-specific sizing branches. The shell should not know about its consumers.
- ❌ **Using `!important`** to overpower the shell. Import order + marker class are sufficient.
- ❌ **Re-rendering the dialog with totally different classes** (e.g. only the marker, not the shell). You lose the header / footer / focus / token system.
- ❌ **Forgetting to scope under the marker class.** Bare selectors like `.ot-transaction-detail-modal__edit-body { min-height: 0 }` would shrink the real edit modal too.
