---
name: 'tinted-rank-pill'
description: 'Carry a category/colour signal on the existing rank chip via a low-alpha CSS color-mix tint, instead of adding a separate dot.'
domain: 'visual-design'
confidence: 'high'
source: 'PR #142 round 2 (squad/trinity-subcategory-ranked-tables, 2026-04-28). Pedro: "the dots in each subcategory don''t look good" — solved by promoting the rank pill into the colour carrier.'
---

## Context

Use this pattern when a ranked-list row needs to communicate **both** a
position (rank 1, 2, 3…) **and** a categorical colour (which donut slice it
belongs to, which account it lives in, etc.) and you currently have, or
would otherwise add, a separate small "dot" or "swatch" element.

Trigger symptoms:

- A 10–12 px dot inline with a label "looks like a smudge" rather than a
  deliberate marker.
- The same colour is also rendered elsewhere in the row (a magnitude bar, a
  background tint), so the dot is redundant.
- A reviewer reports "I read 3 things before I see the label" — you have
  rank + dot + label, where rank+colour can collapse into one chip.

## The pattern

1. **Delete the dot element.** Don't restyle it — remove the `<span>` from
   JSX and drop the `.pill` rule from CSS. One fewer node, one fewer test
   assertion, one fewer thing to align.

2. **Tint the rank pill.** The rank chip is already there, sized for a glyph
   (≈24×24 px), placed in a fixed column. Make it carry the colour:

   ```tsx
   <span
     className="ot-row__rank"
     style={{ ['--ot-rank-color' as string]: entry.colorVar }}
     aria-hidden="true"
   >
     {rank}
   </span>
   ```

   ```css
   .ot-row__rank {
     /* … existing pill geometry: 1.5rem square, border-radius: 999px, etc. */
     color: var(--color-text-primary);
     background: color-mix(
       in oklab,
       var(--ot-rank-color, var(--color-donut-otras)) 22%,
       var(--color-surface-primary)
     );
   }
   ```

3. **Pass the colour as a CSS custom property, not as `background:`
   directly.** Three reasons:
   - The tint formula (alpha, blend space, surface fallback) lives in one
     place — the CSS, not every call site.
   - You can swap to a darker hover or a pressed state without a JS round-trip
     (`:hover { background: color-mix(... 32% ...); }`).
   - Tests can assert on `style.getPropertyValue('--ot-rank-color')`
     containing `--color-donut-N`, which is stable across CSS changes; they
     don't have to parse a `color-mix()` expression.

4. **Pick alpha for worst-case contrast, not average.** WCAG AA against
   `--color-text-primary` on a 22% mix-over-surface holds even for the
   brightest swatch in our donut palette (`--color-donut-3` yellow at
   L=0.78). Bumping alpha past ~30% breaks contrast on the bright swatches;
   below ~15% the colour signal vanishes. 20–25% is the sweet spot for the
   muted v0.3 palette.

5. **Match the app's existing badge pattern.** In OpenTreasury that's
   `ot-type-arrow--income/--expense` in `globals.css` — a tinted-bg + solid
   semantic-color-text chip. Reusing the same visual primitive is what makes
   the new tinted rank pill feel like part of the app instead of a new
   gadget.

## Why this beats alternatives

| Alternative | Problem |
| --- | --- |
| Bigger / outlined dot | Still a separate floating element; still redundant with the bar fill below |
| Vertical colour stripe on the row's left edge | Introduces a new visual primitive; doesn't reuse anything |
| Solid-colour rank chip + white text | Needs a per-swatch text-colour switch (yellow swatch fails white-on-color); now you maintain a "white-on-this / dark-on-that" map per palette change |
| Tinted rank pill (this pattern) | Reuses an element you already have, contrast holds across all 8 hues with one rule, tokens stay the single source of truth |

## What to test

- The dot element no longer exists:
  `expect(container.querySelector('.ot-row__pill')).toBeNull();`
- The rank carries the right colour:
  `expect(rankSpan.style.getPropertyValue('--ot-rank-color')).toContain('--color-donut-0');`
- Optional: add a Storybook / visual snapshot at the brightest palette swatch
  to lock the contrast call.

## Where this is used in OpenTreasury

- `app/src/renderer/components/SubcategoryRankedTable/` — `.ot-subcategory-ranked__rank` carries `--ot-rank-color` set from the donut category colour map.
- Pattern is portable to any row list that currently has a `[rank][dot][label]` triple.
