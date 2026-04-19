# Skill: CSS sticky patterns (gotchas)

**Confidence:** Medium (three datapoints from the Movimientos table work:
button-boundary typography, `overflow: clip` vs `hidden`, and the
padded-scroll-container gap — all 2026-04-19).
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
- Decision note: `.squad/decisions/inbox/trinity-sticky-padding-gap.md`
- Affected file: `app/src/renderer/components/Table/Table.css`

---

## 3. `padding-top` on the scroll container leaves a visible gap above sticky

### Symptom

`<thead>` is `position: sticky; top: 0;` and correctly anchored to the outer
scroll container (`.ot-shell__main`). The sticky IS working — the header stays
on screen while the user scrolls. But transaction rows are visibly rendered
*above* the pinned header strip, flowing all the way to the top of the
scrollport as they scroll up. It looks like the rows "pass behind/above" the
header.

### Why

The scroll container has `padding-top: var(--space-9)` (~48 px). For sticky
elements, `top: 0` anchors to the scrollport top — but the padding area is
still inside the scrollport and is paintable scroll-through space. Rows
inside the scrolling content are rendered in that padding band as they move
up, so they appear above the pinned thead (whose opaque background only
covers its own box).

In short: **`padding-top` on the scroll ancestor of a sticky header creates
a gap of that exact height through which scrolled content bleeds above the
sticky strip.**

### Fix

Set `padding-top: 0` on the scroll container and move the top gutter onto
the first child (e.g. a page-header recipe) via its own `padding-top`. The
sticky strip then anchors flush with the scrollport's top edge — no
paintable band above it — and rows disappear cleanly under the header.

```css
/* AppShell.css */
.ot-shell__main {
  overflow-y: auto;
  padding: 0 var(--space-10) var(--space-9); /* top MUST be 0 */
}

/* globals.css — every screen's first child */
.ot-page-header {
  padding-top: var(--space-9);
  margin-bottom: var(--space-9);
}
```

### Rule

**If an outer scroll container hosts a `position: sticky; top: 0;` header,
its `padding-top` must be 0. Push that top gutter onto the first in-flow
page element.** Alternatives (top-extending `box-shadow` or `::before`
cover on the sticky element) work but are fragile; they either obscure the
natural non-stuck position or rely on JS to toggle. Zero-padding-top is the
only structural fix.

### Checklist

When introducing `position: sticky; top: 0` inside a scroll container:
- [ ] `padding-top` on the scroll container is 0
- [ ] First in-flow child carries the top gutter (padding-top / margin-top)
- [ ] Sticky element has an opaque background
- [ ] No intermediate wrapper has `overflow: hidden` (see gotcha #2)
