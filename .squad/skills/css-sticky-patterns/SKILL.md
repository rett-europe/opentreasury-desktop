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

---

## 4. Sticky mask bands leak their wrapper's side borders

### Symptom

A sticky `<thead>` pins at an offset (`top: 28px`) rather than `top: 0` so it
aligns with sibling chrome (e.g. a sidebar section label). A pseudo-element
mask (`::before` on the sticky cell) paints the 0..offset band with the page
background so rows don't bleed through. When scrolled, the mask strip is
the right color, but a 1px vertical hairline shows on each side of the band.

### Why

The mask pseudo is anchored to the sticky `<th>`, so its `left: 0; right: 0`
spans only the th's own box — which sits **inside** the outer table/card
wrapper (`.ot-table-wrap`). That wrapper has `border: 1px solid` and
`overflow: clip`. When the wrap's top scrolls out of view, its left/right
borders still render across the full pin-offset band, flanking the mask
horizontally. The pseudo never covered them. (Pseudo-elements do **not**
inherit borders from their host, so the hairlines aren't from the pseudo
itself — they're the wrapper's card frame showing past the mask.)

### Fix

Extend only the first- and last-child pseudos 1px outward, and loosen
`overflow: clip` just enough to let that bleed paint:

```css
.ot-table-wrap {
  overflow: clip;
  overflow-clip-margin: 1px; /* allow mask pseudo to cover 1px side borders */
}

.ot-table thead th::before {
  /* …mask geometry… */
  border: 0; /* explicit — defensive; pseudos don't inherit borders but this
              * documents intent and guards against future cascade leaks */
}
.ot-table thead th:first-child::before { left: -1px; }
.ot-table thead th:last-child::before  { right: -1px; }
```

### Rule

**When a sticky mask band lives inside a bordered wrapper, the mask must
cover the wrapper's side borders across the band — not just the interior
width.** Achieve this with first/last-child negative offsets + matching
`overflow-clip-margin` on the wrap. Keep `border: 0` on the pseudo as an
explicit no-op so the mask itself never paints chrome of its own.

### Checklist

- [ ] Mask pseudo has explicit `border: 0`
- [ ] First-of-type cell pseudo extends `left: -Npx` to cover wrap's left border
- [ ] Last-of-type cell pseudo extends `right: -Npx` to cover wrap's right border
- [ ] Wrap's `overflow: clip` is paired with `overflow-clip-margin: Npx`
- [ ] At rest (scroll=0) the mask is still clipped out — verify both states

---

## See also

- Decision note: `.squad/decisions/inbox/trinity-table-sticky-clip.md`
- Decision note: `.squad/decisions/inbox/trinity-sticky-padding-gap.md`
- Decision note: `.squad/decisions/inbox/trinity-mask-band-borders.md`
- Affected file: `app/src/renderer/components/Table/Table.css`
