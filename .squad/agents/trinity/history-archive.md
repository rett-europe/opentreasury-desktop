# Trinity History Archive (2026-04-19)

**Archived from:** `trinity/history.md` when it exceeded 12KB.  
**Archive date:** 2026-04-19T16:21:30Z  
**Reason:** File size ~36KB; summarized entries moved here to keep active history clean.

## Archived Entries

### 2026-04-19 — Wave 1 implementation shipped (branch: feat/trinity-wave-1-impl)
Built first runnable vertical slice with 8 primitives, 3 screens (Movements, AppShell, ComingSoonScreen), mock data (48 entries), theme switching (light/dark/system), i18n (ES/EN), CI gates green (typecheck, lint, format, test 38/38).

**Key deliverables:**
- `app/src/renderer/styles/tokens.css` + `globals.css` — Mouse v0.1 tokens, CSS custom properties, theme switching
- `types/movement.ts` + `mocks/movements.ts` — 48-entry mock dataset (Oct 2025–Apr 2026)
- 8 primitives: Button, Text, Stack, Card, Input, DateRangePicker, Table, EmptyState
- `screens/AppShell/` — 240px sidebar + 56px topbar, mobile collapse at 960px
- `screens/MovementsScreen/` — state machine, sortable Table, totals strip, Intl formatting
- `locales/{es,en}/common.json` — full namespaces + ICU plural

**Decisions:** `.squad/decisions/inbox/trinity-frontend-wave-1-choices.md` (8 decisions, 4 deferrals).

**Gotchas learned:**
1. `verbatimModuleSyntax: true` requires type-only imports and `.js` extensions
2. Vitest `globals: false` disables auto-cleanup — need setup file with `afterEach(cleanup)`
3. React component tests need `// @vitest-environment jsdom` at top
4. `@testing-library/react@16` has peerDep on `@testing-library/dom@^10`
5. Native `<input type="date">` has no role in jsdom
6. Vite `root: app/src/renderer` means `index.html` must live there
7. Permanent install flag: `npm install --legacy-peer-deps`

### 2026-04-19 — Prototype parity pass (branch: fix/trinity-prototype-parity)

Shipped Wave 1 remediation against `docs/product/prototype-fidelity-audit.md` on top of Mouse's tokens v0.2.

**Migrated:**
- Spacing tokens (v0.1→v0.2 index shift)
- Stack gap prop, hover direction, Inter font
- All three screens rebuilt to match prototype

**Build status:** All four gates green — typecheck ✅, lint ✅, test ✅, build ✅.

---

## Summary
Wave 1 completed with 8 primitives, 3 screens, full i18n scaffolding, and prototype parity remediation. Next: Panel-First WP (WI-3 Trinity, WI-7/8/9/10 polish tasks).
