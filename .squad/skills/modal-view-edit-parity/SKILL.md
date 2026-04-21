# Skill: Modal View-Edit Parity

## When to Use

Apply this pattern whenever a modal has both:
- **View mode** — displaying read-only data in a structured layout
- **Edit mode** — allowing the user to modify that data

## The Pattern

Edit mode should be a **SKIN** of view mode, not a separate template.

### Core Principles

1. **Same Layout Primitives** — Edit mode uses the same CSS grid structure, same column count, same gap values, same field ordering as view mode

2. **Same Labels** — Label text, font-size, text-transform, letter-spacing, color all identical between modes

3. **Same Row Rhythm** — Vertical spacing between rows matches exactly; no added/removed sections

4. **Only Value Cells Change** — The only visual transformation is:
   - View: `<dd>Text value</dd>` 
   - Edit: `<input value={...} />` or `<select>...</select>`

5. **Preserve Context** — Keep read-only summary sections (like date/description/amount header) visible in edit mode so users know WHAT they're editing

### CSS Unification

```css
/* View mode's field structure */
.modal__field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.modal__field dt {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  font-weight: 600;
}

/* Edit mode labels MUST match exactly */
.form-fields__label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  font-weight: 600;
  /* ^^^ SAME as view mode dt ^^^ */
}
```

### Grid Template Parity

```css
/* View mode grid */
.modal__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5) var(--space-6);
}

/* Edit mode grid MUST match */
.form-fields__row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-5) var(--space-6);
  /* ^^^ SAME as view mode ^^^ */
}
```

## Anti-Patterns to Avoid

❌ Using a completely separate form component with its own layout system  
❌ Different gap/spacing values between view and edit  
❌ Removing the summary header (date/desc/amount) in edit mode  
❌ Different label styling (font-size, case, color) between modes  
❌ Adding extra min-height that makes the modal jump in size  

## Visual Test

Toggle between view and edit mode rapidly. If done correctly:
- The modal shell stays the same size
- Labels don't move
- Only the value cells morph (text → input)
- Footer buttons change but layout stays fixed

## Example: TransactionDetailModal

```tsx
{isEditMode ? (
  <div className="modal__edit-body">
    {/* Summary header: SAME as view mode (read-only context) */}
    <div className="modal__summary">
      <span className="modal__date">{formatDate(date, locale)}</span>
      <p className="modal__description">{description}</p>
      <span className="modal__amount">{formattedAmount}</span>
    </div>
    
    {/* Form fields using SAME grid structure as view mode */}
    <TransactionFormFields ... />
  </div>
) : (
  <div className="modal__read-body">
    {/* Same summary header */}
    <div className="modal__summary">...</div>
    
    {/* Same grid, but text values instead of inputs */}
    <dl className="modal__grid">
      <div className="modal__field">
        <dt>CUENTA</dt>
        <dd>{accountLabel}</dd>
      </div>
      ...
    </dl>
  </div>
)}
```

## Related

- `.squad/agents/mouse/history.md` — "Edit Mode is a Skin of View Mode" entry
- `TransactionDetailModal.tsx` — Reference implementation
- `TransactionFormFields.css` — Unified spacing with view mode
