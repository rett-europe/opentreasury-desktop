# UX-008 — Free-text Movement Search

> **Status:** Draft v0.2 · **Owner:** Niobe (Spec / UX Analyst) · **Date:** 2026-05-02

## Changelog

### v0.2 — 2026-05-02 (Topbar pivot)

**Location change:** Search input relocated from Movements toolbar to AppShell topbar, reusing the existing ⌘K placeholder at `app/src/renderer/screens/AppShell/AppShell.tsx` lines 228-232.

**Cross-screen behavior:**

- Typing from **Insights / Saldo / Dashboard** → Enter navigates to Movements with `?q=...`
- Already on **Movements** → input updates query in place, no navigation
- **Universal entry point:** ⌘K / Ctrl+K focuses topbar search from any screen

**Flow updates:**

- Added §2.1 (cross-screen navigation journey)
- Updated §2 (placement), §4 (keyboard map)
- Result count and empty states remain on Movements screen

---
> **Paired spec:** [`docs/ux/specs/spec-024-free-text-search.md`](./specs/spec-024-free-text-search.md)
> **Paired Design:** Pending (Mouse — input chrome, match highlight token, dark-mode contrast)

**Traceability:** SPEC-024 FR1–FR15 · UX-003 §filter-toolbar · UX-007 §splits-list-presentation · vision §7 Principle 2 (fast, low-friction)

---

## 1. Overview

This UX spec covers the visible behaviour of the free-text search input on the
Movements screen: where it lives, how it looks in each state, what the user types,
how results render, and how the keyboard maps. The functional contract lives in
SPEC-024; this doc is what Mouse and Trinity build against.

Design intent: *"the person who has 30 seconds between phone calls."* Type a
word, see the row. No syntax to learn. Splits surface their parents.

---

## 2. Placement

The search input lives in the **AppShell topbar** (`app/src/renderer/screens/AppShell/AppShell.tsx`,
lines 228-232), reusing the existing non-functional `⌘K` placeholder.

```
┌────────────────────────────────────────────────────────────────────┐
│  [◆ OpenTreasury] │ Demo NGO     🔍 [Buscar... ⌘K]  ES EN ☀ 🌙 ⚙  │
└────────────────────────────────────────────────────────────────────┘
```

Why the topbar:

- **Global discoverability:** Entry point visible from every screen (Panel, Movements, Insights, Saldo, Configuración).
- **⌘K muscle memory:** Users expect ⌘K / Ctrl+K to summon search. Reusing the placeholder reduces cognitive load.
- **Cross-screen navigation:** Typing from Insights → results land on Movements automatically. The user doesn't need to navigate first.
- **Pedro's call:** Confirmed topbar location to avoid toolbar clutter.

When the user activates search (focuses input + types + presses Enter OR waits 200ms debounce), the app:

- If **not on Movements:** navigates to `/movements?q={encoded query}` (pushState, adds history entry).
- If **already on Movements:** updates the `?q` param in place (replaceState, no history pollution).

The Movements screen reads `?q` on mount and applies it as a filter alongside date / account / category chips.

---

## 2.1 Cross-Screen Navigation Journey

**Scenario A: User on Insights, searches "comida"**

1. User presses `⌘K` → topbar input focuses, cursor blinks.
2. User types `comida` → input shows "comida", no navigation yet.
3. User presses `Enter` → app navigates to `/movements?q=comida` (pushState).
4. Movements screen mounts, reads `?q=comida`, applies search filter.
5. Table shows matched transactions, result-count badge: `"12 of 487"`.
6. Topbar input still contains "comida" (shared state).

**Scenario B: User already on Movements, refines search**

1. User presses `⌘K` → topbar input focuses (already visible).
2. User types `material` → input shows "material", no route change.
3. 200ms debounce fires → route updates to `/movements?q=material` (replaceState).
4. Movements screen re-filters in place, table updates, badge: `"8 of 487"`.
5. No history entry added → back button returns to previous screen, not previous query.

**Scenario C: User clears search**

1. User presses `Esc` while focused → input clears, `?q` param removed (replaceState).
2. Movements screen shows full filtered list (date / account / category chips still active).
3. Second `Esc` → input blurs.

---

## 3. States

### 3.1 Empty (default — topbar)

```
🔍 [ Buscar movimientos…                       ] ⌘K
```

- Magnifier icon left, 16 px, `currentColor`, `aria-hidden`.
- Placeholder text in muted token (`--color-text-secondary`).
- `⌘K` hint on the right (already present in AppShell.tsx).
- No clear button.
- Input width: as defined in AppShell topbar layout.

### 3.2 Typing (focused, user has typed — topbar)

```
🔍 [ comida                                    ] ✕
```

- Clear button (`✕`) appears on the right inside the input frame.
- Input value updates on every keystroke (no lag).
- **Result-count badge and table updates:** appear on the **Movements screen only**.
  The topbar input itself does NOT show result counts — it's a navigation
  affordance, not a result viewer.

### 3.3 Results (on Movements screen after Enter or debounce)

When the user navigates to Movements (or is already there), the screen shows:

```
Movimientos                                              [+ Añadir movimiento]

📅 Este año (2026) ✕    Cuenta: Unicaja ✕                  «12 of 487 movimientos»

───────────────────────────────────────────────────────────────────────────────
[virtualised transactions table with matched rows only]
```

- Table rows below show only matched transactions.
- Each row is rendered exactly as in UX-003 (date / account / description /
  category / amount), with two additions:
  - **Description / comment / reference / details** column: matched substrings
    wrapped in `<mark>` (Mouse-styled highlight).
  - **Splits**: if a parent matched **only** because a split matched, the
    parent row gets a split-match badge — see §5.
- Result-count badge appears near the toolbar (Mouse decides exact placement),
  reads `"{matched} of {filtered_total}"` — i.e. how many of the
  structured-filter set the search narrowed to.
- Toolbar filter chips (date, account, category) remain visible and active.

### 3.4 No matches (on Movements screen)

When search returns zero results, the Movements screen shows:

```
Topbar: 🔍 [ xyzabc                                    ] ✕

Movements screen:
                                                «0 of 487»

┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                            🔍                                        │
│                                                                      │
│         Ningún movimiento coincide con "xyzabc"                      │
│                                                                      │
│              [ Borrar búsqueda ]   [ Editar filtros ]                │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

- Empty-state component (re-uses `EmptyState`).
- Primary CTA *"Borrar búsqueda"* clears the topbar input, strips `?q` from
  URL, restores the filter-only view.
- Secondary CTA *"Editar filtros"* — scrolls/focuses to the filter chip row
  (helps when the *filters* are the reason nothing matches, not the query).

### 3.5 With active filters (most common case — Movements screen)

```
Topbar: 🔍 [ comida                                    ] ✕

Movements screen:
📅 Este año (2026) ✕    Cuenta: Unicaja ✕                  «12 of 134»
```

- Each active filter is independently dismissible. Clearing all filters AND the
  search query returns the screen to its default state.
- Result-count denominator (`134` here) is the post-filter, pre-search count.
  Clearing search alone restores the 134-row view.

### 3.6 Loading (initial movements fetch — Movements screen)

The topbar search input remains **enabled** at all times (global). When the
user navigates to Movements and the transactions list is loading, the Movements
screen shows a loading state, but the topbar input is still usable. If the user
types + presses Enter while Movements is loading, the `?q` param is set and
applied once the data arrives.

---

## 4. Keyboard Map

| Key                  | Context                                   | Action                                      |
|----------------------|-------------------------------------------|---------------------------------------------|
| `Ctrl/Cmd + F`       | Movements screen, anywhere                | Focus search input. Preempts browser find.  |
| `/`                  | Movements screen, no other input focused  | Focus search input.                         |
| `Esc`                | Search input focused, has text            | Clear text. Input stays focused.            |
| `Esc`                | Search input focused, empty               | Blur input.                                 |
| `Enter`              | Search input focused                      | No-op (search is live). Reserved.           |
| `Tab` / `Shift+Tab`  | Search input focused                      | Standard focus traversal to next/prev chip. |
| `Arrow Down`         | Search input focused                      | Move focus to first row of the table.       |

Note on `Ctrl/Cmd+K`: intercepted globally. Does NOT preempt browser find
(`Ctrl/Cmd+F`) — users can still use native browser search if needed.

---

## 5. Splits Interaction

Recommendation: **single parent row with a split-match badge; expand reveals
highlighted splits.**

```
│  2026-04-12  Unicaja   Pago materiales taller   Sin categoría   −€500,00 │
│                        🪓 1 de 3 partes coincide                          │
│                        [▾ Ver partes]                                      │
```

When the user expands the row (or it's already expanded), matching splits are
emphasised:

```
│  ↳  €300,00  Materiales       comida equipo  ← match highlight             │
│  ↳  €150,00  Viajes           taxi                                         │
│  ↳  €50,00   Materiales       material taller  ← match highlight           │
```

Why one row, not three:

- Treasury reconciliation is "one bank line = one statement row". Surfacing
  three rows for a single bank movement breaks that mental model.
- Result-count stays meaningful: "12 of 134" counts parents (or non-split tx),
  not splits. Splits are sub-items of their parent.
- Aligns with the splits visual pattern locked in UX-007 §4.

The badge text:
- ES: `"{n} de {total} partes coincide"` (singular: `"1 de 3 partes coincide"`).
- EN: `"{n} of {total} splits match"`.

---

## 6. Copy Table

| Key                                           | ES                                                                          | EN                                                                |
|-----------------------------------------------|-----------------------------------------------------------------------------|-------------------------------------------------------------------|
| `movements.search.placeholder`                | Buscar movimientos…                                                         | Search transactions…                                              |
| `movements.search.label` (sr-only)            | Buscar movimientos                                                          | Search transactions                                               |
| `movements.search.clear`                      | Borrar búsqueda                                                             | Clear search                                                      |
| `movements.search.count` (ICU plural)         | `{matched, plural, =0 {0 movimientos} one {1 de # movimiento} other {# de {total} movimientos}}` | `{matched, plural, =0 {0 transactions} one {# of {total} transaction} other {# of {total} transactions}}` |
| `movements.search.empty.title`                | Ningún movimiento coincide con "{query}"                                    | No transactions match "{query}"                                   |
| `movements.search.empty.editFilters`          | Editar filtros                                                              | Edit filters                                                      |
| `movements.search.splitMatchBadge` (ICU)      | `{n, plural, one {1 de {total} partes coincide} other {# de {total} partes coinciden}}` | `{n, plural, one {1 of {total} splits matches} other {# of {total} splits match}}` |
| `movements.search.shortcutHint` (tooltip)     | Buscar (Ctrl+F)                                                             | Search (⌘F)                                                       |
| `movements.search.loading`                    | Cargando…                                                                   | Loading…                                                          |

The existing AppShell key `shell.search.placeholder` at lines 228-232 of
`app/src/renderer/screens/AppShell/AppShell.tsx` is **reused** by this spec.
Trinity will wire behavior to the existing input — no new UI element needed.

---

## 7. URL State

When search is active, the Movements route URL gets `?q={uri-encoded-query}`.
Implementation notes (Trinity):

- Use `history.pushState` when navigating **from another screen** to Movements
  with a query (so back-button returns to previous screen).
- Use `history.replaceState` when updating the query **on Movements** (so
  back-button doesn't walk through every keystroke).
- On Movements mount, read `?q=` and seed the topbar input + apply search.
- Clearing the query (Esc or clear button) strips the param.

The query string is treated as user input only; it never round-trips through a
log or window title. (See SPEC-024 §8.)

---

## 8. A11y Checklist

- [ ] Topbar input has an accessible name via existing `aria-label` or linked
      `<label>` (check AppShell.tsx implementation).
- [ ] Magnifier icon and clear button: `aria-hidden="true"` for icon,
      `aria-label="Borrar búsqueda"` / `"Clear search"` for clear button.
- [ ] Result-count region (on Movements screen): `<output role="status" aria-live="polite">`.
      Announces `"23 of 487 transactions"` after debounce / navigation.
- [ ] Empty-state title has heading semantics matching the rest of the screen.
- [ ] `<mark>` highlight is supplemented by CSS background — never colour
      alone. Underline or weight bump at AA contrast level.
- [ ] Keyboard shortcut (⌘K) discoverable via the `<kbd>` hint in topbar.
- [ ] Focus ring meets WCAG 2.1 AA contrast in both light and dark mode.
- [ ] axe-core baseline: zero violations on Movements with search active and
      with the empty-state shown.

---

## 9. Microcopy & Tone Notes

- "Buscar movimientos…" — verb + noun, lowercase, ellipsis. Matches the rest
  of the toolbar (`Sin categorizar`, `Importe`, etc.).
- Avoid promising features we don't ship: no "search by category, account,
  amount…" preview text in v1 placeholder. The placeholder stays generic
  *because* search is universal — the user shouldn't have to know which fields
  it covers.
- Empty-state title sentences in ES use lowercase article ("Ningún
  movimiento…") because that's the canonical empty-state pattern from
  UX-003 §empty-states.

---

## 10. Status History

| Date       | Status     | By    | Notes                                                                                                                                         |
| ---------- | ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-05-02 | Draft v0.1 | Niobe | Initial draft paired with SPEC-024. Splits show as parent + badge (single-row pattern). Topbar input untouched pending Pedro decision.       |
| 2026-05-02 | Draft v0.2 | Niobe | Topbar pivot per Pedro. ⌘K focus, cross-screen navigation flows (§2.1), Enter triggers navigation, result count stays on Movements screen. |
