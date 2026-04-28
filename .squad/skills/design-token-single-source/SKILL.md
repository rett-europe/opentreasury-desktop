# Skill — Design tokens have a single source of truth

> Tokens shared across components MUST live in `app/src/renderer/styles/tokens.css`,
> never in component CSS. Component-scoped definitions only affect their own
> consumers and silently diverge from parallel ones.

## Why this exists

PR #142 round 2 shipped Palette P1 (OKLCH wide-hue donut palette) by redefining
`--color-donut-0..7` inside `app/src/renderer/components/DonutChart/DonutChart.css`
under a `:root` selector. CSS-wise the `:root` rule cascades globally as soon as
that stylesheet is loaded, so on paper both the SVG donut and the
`SubcategoryRankedTable` rank pills should have updated together.

In practice Pedro saw the rank pills pick up the new palette while the donut
slices stayed on the old colours. Two ways this can happen even when the rule
is technically global:

1. **Build / HMR ordering.** The renderer ships `tokens.css` → `globals.css`
   first via `main.tsx`. A `:root` override defined later in a component CSS
   bundle wins for that build, but a stale cached chunk of `DonutChart.css`
   (Electron renderer cache, Vite HMR partial reload) can leave the SVG donut
   stroked with the old `--color-donut-N` while the rank-pill component, freshly
   re-mounted with new code, picks up the new tokens via inline `style.background`
   read from a JS map. The two consumers ended up reading the variable at
   different times.
2. **Future drift.** Even with a clean reload, putting tokens in a component
   file makes it easy for a later contributor to:
   - delete the component thinking it's local,
   - duplicate the same token elsewhere with slightly different values,
   - or move the file under a CSS-Modules wrapper and accidentally scope
     `:root` to the module.

Both failure modes share one root cause: **shared design tokens were not in the
single shared design-token file.**

## The rule

For OpenTreasury Desktop:

| Token kind                                        | Lives in                        |
| ------------------------------------------------- | ------------------------------- |
| Brand / surface / text / border / semantic colour | `app/src/renderer/styles/tokens.css` |
| Spacing / radius / typography / shadow / z-index  | `app/src/renderer/styles/tokens.css` |
| Categorical chart palette (donut, legend, pills)  | `app/src/renderer/styles/tokens.css` |
| Component-only layout variables (e.g. `--ot-rank-color` set inline) | component CSS (component-private) |

If a token is consumed by **more than one component** — or is even *likely* to
become so — it goes in `tokens.css`. Period.

Component CSS may still define **private** custom properties (typically
prefixed `--ot-<component>-…`) that are set by the component on its own
elements via `style={{ ['--ot-rank-color']: ... }}` and consumed inside the
same component. Those are not "tokens" in the design-system sense and do not
belong in `tokens.css`.

## Checklist before merging a colour / typography change

- [ ] Is the new variable consumed by exactly one component? If no → `tokens.css`.
- [ ] Did I add it to **both** `:root[data-theme='light']` and
      `:root[data-theme='dark']` blocks in `tokens.css`?
- [ ] Did I also add it under the `@media (prefers-color-scheme: dark)
      :root[data-theme='system']` block so OS-driven dark mode picks it up?
- [ ] Does any component CSS still carry a stale duplicate definition? Grep:
      `rg --pcre2 '^\s*--color-' app/src/renderer/components` — if a component
      file matches, it is almost certainly wrong.
- [ ] Did I delete the old definition rather than leaving both? Two `:root`
      definitions of the same variable is a future divergence waiting to happen.

## Related

- `.squad/skills/svg-donut-chart/SKILL.md` — donut renderer reads `var(--color-donut-${idx % 8})`.
- `.squad/skills/tinted-rank-pill/SKILL.md` — rank pill reads the same variable
  via the inline `--ot-rank-color` indirection.
- PR #142 — the rounds where this rule was learned the hard way.
