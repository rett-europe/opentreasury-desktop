# Design Specs

> **Owner:** Mouse (Design) · **Status:** folder scaffolded, specs arrive per feature

This folder holds **visual design specifications** — design tokens, component visual specs,
and screen-level mocks for OpenTreasury Desktop.

## Scope

- **In scope:** design tokens (color, typography, spacing, radius, shadow, motion),
  component visual specs (buttons, inputs, tables, cards, dialogs, toasts), screen-level
  mocks (light/dark), iconography, illustration, brand identity, dark-mode rules.
- **Out of scope (→ `docs/ux/`):** user flows, interaction logic, state transitions,
  form validation rules. Mouse says *what it looks like*; Niobe says *what happens*.

## File naming

- Tokens: `tokens.md` (single source of truth).
- Component specs: `components/{component-name}.md`.
- Feature-level visual specs pair with their UX spec: `docs/design/002-transactions.md`
  alongside `docs/ux/002-transactions.md`.

## Standard sections (recommended per file)

1. Summary — the visual intent.
2. Tokens used — explicit references to tokens from `tokens.md`.
3. States — default, hover, focus, active, disabled, loading, error, dark-mode.
4. Layout — spacing, grid, breakpoints (for window resize).
5. Accessibility — color contrast ratios, focus indicators, touch target sizes.
6. Assets — references to icons/illustrations in the repo or external source.
7. Traceability — links to paired UX spec and feature spec.

## Relationship to renderer styles

Tokens in this folder are the **source of truth** consumed by
`app/src/renderer/styles/` (CSS variables / CSS-in-JS tokens). A change to a token
is a design-spec change, reviewed here, then mirrored to renderer code in the same PR.
