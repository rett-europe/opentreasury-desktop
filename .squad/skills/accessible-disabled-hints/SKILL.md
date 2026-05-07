---
name: "accessible-disabled-hints"
description: "Pattern for accessible disabled-field hints using native tooltips + visually-hidden text"
domain: "accessibility, forms, ux"
confidence: "high"
source: "earned (PR #298 — polish/edit-lock-tooltip)"
---

## Context

When a disabled form input needs to explain WHY it's locked, visible inline text creates visual noise—especially when multiple fields share the same lock reason. The solution: native browser tooltips for sighted users, visually-hidden text for screen readers.

**When to use:**
- Disabled inputs that need contextual hints (e.g., "Change status to unlock")
- Multi-field scenarios where repeating the same visible message creates clutter
- Any disabled control that requires WCAG 2.1 AA compliance (screen readers must announce the reason)

**When NOT to use:**
- When the disabled state is self-explanatory from context
- When only ONE field is locked (inline text may be fine)
- When the lock reason is already explained in a nearby banner/alert

## Patterns

### 1. Native Tooltip on Disabled Input

Add the `title` attribute to the disabled `<input>` / `<select>` / `<textarea>`:

```tsx
<input
  id="tx-date"
  type="date"
  value={date}
  disabled={statusLocked}
  title={statusLocked ? statusHint : undefined}
  aria-describedby={statusLocked ? 'lock-hint-date' : undefined}
/>
```

**Why `title`:** Zero infra. Works in all browsers. Shows on hover. Native affordance.

### 2. Visually-Hidden Text for Screen Readers

Keep the `aria-describedby` linkage, but make the target element visually hidden using `.ot-sr-only`:

```tsx
{statusLocked && (
  <span id="lock-hint-date" className="ot-sr-only" role="note">
    {statusHint}
  </span>
)}
```

**CSS for `.ot-sr-only`** (from `globals.css`):
```css
.ot-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

### 3. Full Pattern (4 Locked Fields)

```tsx
// Date field
<input
  id="tx-date"
  disabled={statusLocked}
  title={statusLocked ? statusHint : undefined}
  aria-describedby={statusLocked ? 'lock-hint-date' : undefined}
/>
{statusLocked && (
  <span id="lock-hint-date" className="ot-sr-only" role="note">
    {statusHint}
  </span>
)}

// Description field
<input
  id="tx-description"
  disabled={statusLocked}
  title={statusLocked ? statusHint : undefined}
  aria-describedby={statusLocked ? 'lock-hint-description' : undefined}
/>
{statusLocked && (
  <span id="lock-hint-description" className="ot-sr-only" role="note">
    {statusHint}
  </span>
)}

// (Repeat for Account, Amount...)
```

**Result:**
- Sighted users: clean UI + tooltip on hover
- Screen reader users: full explanation via `aria-describedby`
- No visual noise from 4 copies of the same message

## Examples

**PR #298:** `TransactionFormFields.tsx` — 4 status-locked fields (Date, Description, Account, Amount) + 1 split-locked field (Amount).

**Before:** Visible `.ot-tx-fields__field-hint` spans rendered under each field → 4 stacked copies of "Set status to Pending to edit".

**After:** `.ot-sr-only` spans + `title` attributes → clean modal, tooltips on hover, SR-accessible.

**Test update:** `TransactionDetailModal.test.tsx` — verify hints are in DOM with `.ot-sr-only` class instead of asserting on visible `.ot-tx-fields__field-hint` elements.

## Anti-Patterns

❌ **Using `aria-label` instead of `aria-describedby`**
- `aria-label` overrides the input's label, breaking the field name announcement.
- `aria-describedby` supplements the label with the hint.

❌ **Omitting the visually-hidden span entirely**
- `title` alone is NOT screen-reader accessible. Most AT ignore `title` on disabled inputs.
- Always include the `aria-describedby` + `.ot-sr-only` span.

❌ **Making the hint visible when only one field is locked**
- If visual noise isn't an issue, visible inline text is fine. This pattern is for MULTI-field scenarios.

❌ **Using `display: none` or `visibility: hidden` for the SR-only text**
- Screen readers ignore these. Use the `.ot-sr-only` clip-rect pattern (standard SR-only recipe).

---

**References:**
- PR #298: https://github.com/rett-europe/opentreasury-desktop/pull/298
- SPEC-025 (status-based edit locks): Introduced the 4-field lock scenario
- `.ot-sr-only` class: `app/src/renderer/styles/globals.css` (line 107)
