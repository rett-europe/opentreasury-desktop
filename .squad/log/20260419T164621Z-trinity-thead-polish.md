# Session Log: Trinity thead Border-Radius Polish

**Timestamp:** 2026-04-19T16:46:21Z  
**Agent:** Scribe  
**Branch:** fix/trinity-prototype-parity  
**Commit:** 38038a9

## Mission
Log and document Trinity Movements table card CSS polish from commit 38038a9. Two critical fixes for sticky thead at rest and when pinned.

## Execution

### 1. Analyzed commit 38038a9
- **Message:** "fix(table): preserve card frame top border at rest and rounded corners when sticky"
- **Changes:** Table.css (2 fixes), SKILL.md (2 new gotchas documented)
- **Quality:** All gates green (typecheck, lint, test 39/39, build)

### 2. Documented Fixes

#### Fix 1: `overflow-clip-margin-inline`
- **Target:** `.ot-table-wrap`
- **Change:** `overflow-clip-margin: 1px` → `overflow-clip-margin-inline: 1px`
- **Impact:** Stops mask pseudo bleed on block axis; top border renders cleanly at rest
- **Root Cause:** Mask anchored at `bottom:100%` of sticky th was painting over top border with app background
- **Solution:** Constrain bleed to horizontal axis (where gotcha #4 needs it)

#### Fix 2: Thead radius inheritance
- **Target:** `th:first-child`, `th:last-child`
- **Change:** Add `border-top-{left,right}-radius: calc(var(--radius-lg) - 1px)`
- **Impact:** Pinned header carries card silhouette; no-op at rest (geometry already matches)
- **Root Cause:** `overflow: clip` doesn't trap sticky elements, so thead doesn't inherit wrap border-radius
- **Solution:** Explicit radius on first/last th cells

### 3. Updated artifacts

**Decision:** `.squad/decisions/inbox/trinity-thead-border-radius.md` already present (decision drop from implementation)

**Skill:** `.squad/skills/css-sticky-patterns/SKILL.md` updated with:
- Gotcha #5: Block-axis clip-margin bleed breaks top border
- Gotcha #6: Sticky elements escape clip containers; radius must be inherited explicitly

### 4. Commit .squad/ changes
Git staged and committed orchestration log, decision log entry (already present), and skill update.

## Outcome
✅ Commit 38038a9 fully documented in orchestration log  
✅ Skill artifacts updated  
✅ Ready for merge decision review  
✅ No source edits (Scribe role boundary observed)
