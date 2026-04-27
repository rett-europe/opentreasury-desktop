# Skill — Compact Confirm Modal

> A small "card-style" confirmation dialog for irreversible-but-trivial yes/no actions.
> NOT for forms, NOT for multi-step flows. If the user is making a single boolean
> choice, this is the pattern.

## When to use

- The user clicks an action and the only remaining question is "really do it?"
- No fields to fill, no choices to make, just confirm or cancel.
- Examples: bulk approve, delete one item, archive, mark-as-paid.

## When NOT to use

- Any form input (use the full modal shell, e.g. `BulkClassifyModal`).
- Multi-step or destructive flows that need explanation/preview blocks.
- Anything where the user must type a value to confirm (use full modal + input).

## Anatomy

```
┌─────────────────────────────────────┐
│  ¿Aprobar 12 movimientos?           │   ← title = the question
│  3 ya aprobados — se omitirán.      │   ← optional muted skip/info line
│                                     │
│                  [Cancel] [Confirm] │   ← sm buttons, right-aligned
└─────────────────────────────────────┘
       width: min(400px, 92vw)
```

- **Title**: the question itself, no extra body paragraph.
- **Subtle note** (optional): one short muted line in `--color-text-secondary`
  / `--font-size-13`. Use for skip-counts, side-effects.
- **Error region** (when async): inline alert above the actions.
- **Actions**: `<Button variant="ghost" size="sm">` (cancel, left), `<Button
  variant="primary" size="sm">` (confirm, right).

## Tokens

| Element        | Token                         |
|----------------|-------------------------------|
| Width          | `min(400px, 92vw)`            |
| Padding        | `var(--space-5)`              |
| Content gap    | `var(--space-4)`              |
| Radius         | `var(--radius-lg)`            |
| Shadow         | `var(--shadow-lg)`            |
| Background     | `var(--color-surface-primary)`|
| Title color    | `var(--color-text-primary)`   |
| Skip-notice    | `var(--color-text-secondary)` |
| Notice size    | `var(--font-size-13)`         |
| Backdrop       | `rgba(0,0,0,0.5)` + `blur(2px)` |

## Behavior

- Native `<dialog>` + `showModal()` for accessibility (focus trap, escape).
- `aria-labelledby` → title id, `role="dialog"`, `aria-modal="true"`.
- Backdrop click + escape → close (unless submitting).
- Disable both buttons while submitting; primary shows `t('common.saving')`.
- Errors caught from `onConfirm()` rendered inline; toasts handled by the parent.

## Reference implementation

`app/src/renderer/components/BulkApproveConfirmModal/` (PR shrinking #123).
Self-contained CSS — does NOT inherit from `TransactionDetailModal.css`.

## Anti-patterns observed

- ❌ Reusing the 760px `TransactionDetailModal` shell for a confirm dialog
  (PR #123 originally did this — looked like a heavy edit form).
- ❌ Adding a long descriptive paragraph below the title ("They will be marked
  as approved and will no longer be pending review.") — the title already
  says it.
- ❌ Boxed callout for a 1-line skip notice — keep it as a muted text line.
- ❌ `md`-size buttons in a compact card — use `sm`.
