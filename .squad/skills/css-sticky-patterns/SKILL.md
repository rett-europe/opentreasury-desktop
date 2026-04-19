# Skill: CSS sticky patterns (gotchas)

**Confidence:** Low (two datapoints from the Movimientos table fix, 2026-04-19).
Update when more patterns appear.

Two subtle layout traps you will hit when combining `position: sticky` with
styled wrappers and button-wrapped sortable headers.

---

## 1. `<button>` resets `text-transform` and `letter-spacing`

### Symptom

A `<th>` styled with `text-transform: uppercase; letter-spacing: 0.08em;`
renders uppercase for non-sortable columns, but sortable columns (whose label
is wrapped in `<button class="…sort-btn">`) render in the button's default
case — even if the button has `font: inherit`.

### Why

`font: inherit` is the shorthand for font properties only. It does **not**
cover `text-transform` or `letter-spacing`. The `<button>` UA stylesheet
resets both, so any typography the parent `<th>` set via those properties
is lost at the button boundary.

### Fix

Explicitly inherit them on the button:

```css
.ot-table__sort-btn {
  font: inherit;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  /* … */
}
```

### Checklist

When wrapping text in a `<button>` inside a styled container, always verify:
- [ ] `text-transform: inherit`
- [ ] `letter-spacing: inherit`
- [ ] `font: inherit` (for size/weight/family)
- [ ] `color: inherit`

---

## 2. `overflow: clip` vs `overflow: hidden` for sticky escape

### Symptom

A `thead` with `position: sticky; top: 0` is expected to anchor to an outer
scroll container (e.g. `.ot-shell__main`), but instead it sticks inside the
nearest styled wrapper and vanishes once the user scrolls past the wrapper's
own height.

### Why

`overflow: hidden` establishes a **scroll containing block**. `position: sticky`
anchors to the nearest scrolling ancestor — if an intermediate wrapper has
`overflow: hidden`, that wrapper becomes the anchor, even though it isn't
actually scrollable. The sticky element is trapped inside.

### Fix

Use `overflow: clip` on the wrapper. It:
- Still **visually** clips overflowing children (rounded corners via
  `border-radius` work).
- Does **NOT** create a scroll containing block, so `position: sticky`
  descendants escape to the real scroll container above.

```css
.ot-table-wrap {
  border-radius: var(--radius-lg);
  overflow: clip; /* NOT `hidden` — would trap sticky thead */
}
```

Supported in Electron/Chromium (and modern browsers generally).

### Rule

**Wrappers that need rounded-corner clipping AND contain a `position: sticky`
descendant that must anchor outward → use `overflow: clip`, not `hidden`.**
Add a CSS comment explaining this so it doesn't get "optimized" back.

---

## See also

- Decision note: `.squad/decisions/inbox/trinity-table-sticky-clip.md`
- Affected file: `app/src/renderer/components/Table/Table.css`
