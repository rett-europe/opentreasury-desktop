# Orchestration: trinity-table-header-fix

**Timestamp:** 2026-04-19T14:14:46Z  
**Agent:** Trinity (general-purpose)  
**Branch:** `fix/trinity-prototype-parity`  
**Commit:** 2508ba0

## Scope

Fix table header capitalization and sticky-header clipping after Movements table parity pass.

**Issues Diagnosed:**
1. Table headers (non-sort-btn) rendered uppercase via CSS but sort-button headers rendered natural case — inconsistent.
   - Root: sort-btn has `<button>` UA default `text-transform: none` which overrides inherited `text-transform: uppercase`
   - Fix: `.ot-table__sort-btn` gains `text-transform: inherit` + `letter-spacing: inherit`

2. Sticky `thead` clipped off-screen when table scrolls past its container.
   - Root: `.ot-table-wrap { overflow: hidden }` establishes scroll container, traps `position: sticky` inside
   - Fix: `.ot-table-wrap { overflow: clip }` — clips visually (preserves rounded corners) but doesn't create scroll container
   - Durable rule: `overflow: clip` (not `hidden`) when wrapper needs rounded corners + sticky descendants

## Deliverables

- **Files:** `app/src/renderer/components/Table/Table.css` (2 edits)
- **Tests:** all 39 pass; build green; lint 0 warnings
- **Decision note:** `.squad/decisions/inbox/trinity-table-sticky-clip.md`
- **Skill:** `.squad/skills/css-sticky-patterns/SKILL.md` (overflow clip + sticky anchor pattern)

## Outcome

✅ **PASS** — typecheck / lint / test / build all green
