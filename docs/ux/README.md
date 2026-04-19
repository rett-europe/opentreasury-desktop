# UX Specs

> **Owner:** Niobe (UX) · **Status:** folder scaffolded, specs arrive per feature

This folder holds **UX specifications** — user flows, interaction specs, wireframes, and
first-run/onboarding copy for OpenTreasury Desktop.

## Scope

- **In scope:** user flows, interaction rules, state diagrams for screens, form validation rules,
  error/empty/loading states, first-run wizard copy (see [R20](../security/security-requirements-v0.1.md)),
  accessibility requirements per feature, i18n key inventories.
- **Out of scope (→ `docs/design/`):** visual tokens, color palettes, typography scales,
  component-level visual specs, screen-level pixel mocks. Niobe says *what happens*;
  Mouse says *what it looks like*.

## File naming

Match the paired feature spec under `docs/specs/`. Example:
`docs/specs/002-transactions.md` ↔ `docs/ux/002-transactions.md`.

## Standard sections (recommended per file)

1. Summary — one paragraph, the user outcome this UX enables.
2. Entry points — how the user gets to this flow.
3. Happy-path walkthrough — step by step, with screen IDs.
4. Empty / loading / error states — explicit for each screen.
5. Edge cases — multi-device sync lag, encryption prompts, conflict resolution UX.
6. Accessibility — keyboard navigation, screen-reader labels, focus order.
7. Copy — canonical strings (ES + EN).
8. Traceability — links to the paired PRD and feature spec, and the R-series requirements
   the UX must satisfy (e.g., R20 first-run posture wizard).

## Source of truth for prototype reference

The existing [`prototype/`](../../prototype/) is the **historical UX reference** — frozen.
Whether it is the v1 UX contract or a sketch we can depart from is still an open
product question (Vision §14 Q7). Until answered, treat it as authoritative for layout
intent, *not* for final copy or visual detail.
