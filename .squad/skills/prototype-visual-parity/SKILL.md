# Skill — Prototype → Desktop Visual Parity Workflow

**When to use**: You've been handed a list of visual discrepancies between a
static prototype (HTML/JSX/CSS reference) and a production component screen,
and asked to align one to the other.

## The workflow

### 1. Lock the prototype as source of truth

Read the relevant prototype files **first and in full**: the component JSX,
the stylesheet tokens/recipes, and the data fixture. The prototype wins on
every ambiguity. Users describing the prototype from memory may be wrong
(e.g. reporting a link as "top-right" when the prototype actually places it
bottom-right). Quote the prototype, not the user's recollection, in your
diff rationale.

### 2. Diff tokens, not rules

Map each prototype token (`--clr-income`, `--rad-md`, `--spc-16`) to its
desktop equivalent (`--color-income-default`, `--radius-md`, `--space-7`).
This mapping usually exists in a comment block at the top of the desktop
`tokens.css`. If a rule in the live codebase references a token that
**doesn't exist** in `tokens.css`, that's a silent bug — browsers fall back
to `0` / `unset` / `initial`, not to the prototype value. Grep for
`var(--` usages against the defined token list.

### 3. Hunt for shadow rules

Component-scoped CSS imported after a global stylesheet **wins every
cascade conflict**. The symptom is "I updated the global but nothing
changed." Search for every class in the global recipe and confirm no
component file redefines it. Consolidate: keep the recipe in one place.
Empty-file-with-comment is a legitimate resolution.

### 4. Fix responsive breakpoints against *content* width, not viewport

If the prototype lives outside your app shell (no sidebar, no topbar), its
media queries are calibrated against the viewport. In the real app,
subtract sidebar width + shell padding before picking breakpoints.
Concrete check: at the lowest target viewport (e.g. 1024px), compute
`viewport - sidebar - 2×shell-padding` and confirm the grid still fits.
Add an intermediate breakpoint if the prototype jumps too aggressively
(e.g. 5→3 columns with no stop at 4).

### 5. Replace mocks with prototype fixtures verbatim

Don't paraphrase. If the prototype ships `Unicaja / Caixa 5315 / Caixa
FinRett / Caixa 0951 / PayPal` with specific balances and colours, your
desktop mock should ship exactly those. This is the only way to verify
pixel-parity against the reference screenshots. Contract changes are
usually unnecessary — mocks can overload existing fields (with a
comment noting the convention) until the real resolver lands.

### 6. Verify at target widths

Test explicitly at the widths the user cares about (1024, 1280, 1440,
1920). Use browser devtools or a `@media` override. Screenshot-diff if
the team has visual regression tooling; otherwise, a manual before/after
walkthrough in your report is acceptable.

## Signals something is wrong

- "Cards pile on top of each other" → 99% a `min-width` on the child
  fighting a fixed-column grid on the parent.
- "Colours don't match" → token shadowing or undefined custom properties.
- "Icons look different" → either icon library mismatch *or* a broken
  `border-radius` / `background` token rendering the container wrong
  while the icon itself is fine.
- "Layout works at one width but not another" → breakpoint mis-calibration
  against the shell chrome.

## Anti-patterns to avoid

- **Inline styles for colour/spacing** when the prototype uses tokens —
  you'll drift on the next theme change.
- **Adding a new token** to fix a single bug — check if an equivalent
  one already exists (the codebase probably renamed it).
- **Changing the shared contract to make a visual fix easier** — use
  mock conventions + comments, flag a formal contract change separately.
- **Trusting the user's description of the prototype over the prototype
  file** — open the file.
