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

4. **Same Field ORDER** — Fields must appear in the EXACT same sequence in edit mode as in view mode. If view shows Account → Category → Subcategory → Tags, edit must show them in that order.

5. **Only Value Cells Change** — The only visual transformation is:
   - View: `<dd>Text value</dd>` 
   - Edit: `<input value={...} />` or `<select>...</select>`

6. **Preserve Context** — Keep read-only summary sections (like date/description/amount header) visible in edit mode so users know WHAT they're editing

7. **FK Resolution** — All foreign-key fields (account ID, category ID, tag IDs) must resolve to display names in BOTH view and edit modes. Never render raw ULIDs/UUIDs.

### FK Resolution Rule

```typescript
// WRONG — displays raw ID if categoryLabel prop is undefined
{categoryLabel ?? transaction.categoryId ?? t('fields.none')}

// RIGHT — resolves internally from reference data
const category = categories.find((c) => c.id === transaction.categoryId);
const resolvedLabel = categoryLabel ?? category?.name ?? null;
{resolvedLabel ?? t('fields.none')}
```

**Rule:** If pre-resolved labels are passed, use them. Otherwise, resolve from available reference arrays. Never fall back to raw IDs.

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
❌ **Different field ORDER between view and edit modes**  
❌ **Showing raw FK IDs instead of resolved display names**

## Visual Test

Toggle between view and edit mode rapidly. If done correctly:
- The modal shell stays the same size
- Labels don't move
- **Fields stay in the same positions**
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
    
    {/* Form fields using SAME grid structure AND SAME FIELD ORDER as view mode */}
    <TransactionFormFields mode="edit" ... />
  </div>
) : (
  <div className="modal__read-body">
    {/* Same summary header */}
    <div className="modal__summary">...</div>
    
    {/* Same grid, but text values instead of inputs */}
    <dl className="modal__grid">
      <div className="modal__field">
        <dt>CUENTA</dt>
        <dd>{accountLabel}</dd>  {/* ← resolved name, not raw ID */}
      </div>
      ...
    </dl>
  </div>
)}
```

## Dual-Mode Form Components

When the same form component is used for both "add" and "edit":

```tsx
// Edit mode: mirrors view field order exactly
if (mode === 'edit') {
  return (
    <div className="form">
      {/* Row 1: Account / Category — matches view */}
      {/* Row 2: Subcategory / Tags — matches view */}
      {/* Row 3: Status / Currency — matches view */}
      {/* Then: Reference, Details */}
    </div>
  );
}

// Add mode: can have different order since there's no "view" to mirror
return (
  <div className="form">
    {/* Date / Type */}
    {/* Amount / Account */}
    {/* Description */}
    {/* Category / Subcategory */}
    {/* etc. */}
  </div>
);
```

## Related

- `.squad/agents/mouse/history.md` — "Edit Mode is a Skin of View Mode" + "FK Resolution" entries
- `TransactionDetailModal.tsx` — Reference implementation
- `TransactionFormFields.tsx` — Dual-mode render (edit mirrors view, add has own order)
- `TransactionFormFields.css` — Unified spacing with view mode
