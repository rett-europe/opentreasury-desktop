# Decision: SPEC-024 Topbar Location Pivot

**Date:** 2026-05-02  
**Decided by:** Pedro (perocha)  
**Documented by:** Niobe (Spec / UX Analyst)  
**Status:** Confirmed  
**Affected specs:** SPEC-024 v0.2, UX-008 v0.2

---

## Decision

The free-text movement search input will be located in the **AppShell topbar**,
reusing the existing non-functional `⌘K` placeholder at lines 228-232 of
`app/src/renderer/screens/AppShell/AppShell.tsx`.

The Movements toolbar approach from SPEC-024 v0.1 is **abandoned**.

---

## Rationale

1. **Global discoverability:** Search is accessible from every screen (Panel, Movements, Insights, Saldo, Configuración). Users don't need to navigate to Movements first.

2. **⌘K muscle memory:** Industry-standard keyboard shortcut for search/command palette. Reusing the existing placeholder reduces user learning curve.

3. **Cross-screen workflow:** Treasurer working in Insights can search "cafetería" and land directly on Movements with filtered results — no manual navigation step.

4. **Reduced toolbar clutter:** The Movements toolbar already hosts 7+ filter chips (date, account, category, type, amount, tags, uncategorised). Adding search would push the action button off-screen at typical viewport widths.

5. **Pedro's directive:** Explicit decision to wire the topbar input rather than add a new input to Movements toolbar.

---

## Wiring Contract

**Topbar component responsibilities:**

- Render the search input (already present in AppShell.tsx).
- Focus on `⌘K` / `Ctrl+K` keypress (global handler).
- Focus on `/` keypress (when no other input focused).
- Clear on first `Esc`, blur on second `Esc`.
- On **Enter** or **200ms debounce** (whichever fires first):
  - If **not on Movements:** `navigate('/movements?q={encoded query}')` using `pushState`.
  - If **already on Movements:** update `?q` param using `replaceState`.

**Movements screen responsibilities:**

- Read `?q` param from route on mount.
- Apply query as filter alongside existing structured filters (date, account, category, etc.).
- Display result-count badge: `"{matched} of {filtered_total}"`.
- Render empty-state when no matches.
- Sync topbar input value when query changes (bi-directional binding).

---

## Impact

### Engineering (Trinity / Morpheus)

- **Topbar refactor (Trinity):**
  - Wire focus handler for `⌘K` / `Ctrl+K` / `/`.
  - Implement Enter / debounce navigation logic.
  - Manage `?q` URL state with push/replace logic.
  - Lift input value to shared state (router-aware).

- **Movements screen refactor (Trinity):**
  - Read `?q` on mount, parse, apply to filter pipeline.
  - Render result-count badge + empty-state variant.
  - Keep existing structured filter UI unchanged.

- **Performance:** No change — search algorithm stays in-memory linear scan (SPEC-024 §12).

### UX (Mouse)

- Result-count badge placement on Movements screen (not in topbar).
- `<mark>` highlight styling for matched substrings.
- Empty-state "no matches" variant with "Clear search" CTA.

### Documentation

- SPEC-024 updated to v0.2 (§2, §5, FR12–FR14, AC10, OQ1/OQ3 resolved).
- UX-008 updated to v0.2 (§2, §2.1, §3, §4, §6, §7, §8).

---

## Open Questions

1. **URL persistence on reload:** Should `?q` survive a window reload / app restart, or clear on fresh launch?  
   **Recommendation:** Persist — matches user expectation from web apps.

2. **Topbar input always visible?** At narrow viewports (≤960px), AppShell CSS auto-collapses some topbar elements. Confirm search input remains visible or provide mobile-first alternative.  
   **Action:** Mouse to review responsive behavior in next design pass.

3. **Future command palette conflict?** If a global command palette is added later (e.g., ⌘K for multi-entity search across movements, categories, accounts), this decision locks ⌘K to movement search only.  
   **Mitigation:** The topbar input placeholder already hints "Buscar movimientos, categorías, cuentas…" — wiring it as movement-only in v1 is a stepping stone. Command palette can extend it in v2.

---

## Alternatives Considered

### Alt 1: Movements toolbar input (SPEC-024 v0.1 approach)

**Pros:**

- Search sits beside structured filters, reinforcing "search narrows filters" mental model.
- Avoids topbar real-estate contention.

**Cons:**

- Invisible when user is on Insights / Saldo / Dashboard.
- Toolbar already crowded (7+ chips + action button).
- Requires navigation before search — extra friction.

**Verdict:** Rejected per Pedro's directive.

### Alt 2: Dual inputs (topbar + Movements toolbar)

**Pros:**

- Topbar for global, toolbar for local refinement.

**Cons:**

- Two inputs with identical behavior confuses users.
- Syncing state across two components adds complexity.
- Violates DRY principle.

**Verdict:** Over-engineered for v1.

### Alt 3: Modal search (⌘K opens overlay)

**Pros:**

- Industry pattern (Spotlight, VSCode command palette).
- No toolbar clutter.

**Cons:**

- Modal interrupts flow — treasurer needs to see results + filters simultaneously.
- Extra implementation cost (modal component, focus trap, backdrop).

**Verdict:** Deferred to future command palette feature.

---

## Success Criteria

1. User on **Insights** presses `⌘K`, types `comida`, presses `Enter` → lands on Movements with 12 matched transactions visible.
2. User on **Movements** types in topbar → 200ms later, list updates in place, no history entry added.
3. User clears search with `Esc` → `?q` stripped, full filtered list restored.
4. Result-count badge reads `"23 of 487 movimientos"` (ES) / `"23 of 487 transactions"` (EN).
5. axe-core passes on Movements with search active.

---

## References

- **SPEC-024 v0.2:** `docs/ux/specs/spec-024-free-text-search.md`
- **UX-008 v0.2:** `docs/ux/ux-008-movement-search.md`
- **AppShell topbar input:** `app/src/renderer/screens/AppShell/AppShell.tsx` lines 228-232
- **Pedro's brief (2026-04-28):** "free text, flexible search. And fast 🙂 and it needs to search all the fields, notes included."
