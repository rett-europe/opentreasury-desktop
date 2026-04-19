# Trinity thead Border + Radius Polish — 38038a9

**Commit:** `38038a9` on `fix/trinity-prototype-parity`  
**Author:** perocha <pedrojrocha@outlook.com>  
**Date:** 2026-04-19T16:46:21+0200  
**Scope:** Trinity Movements table card — sticky thead pin-point border frame polish

## Context
Follow-up to `1350d95` (sticky thead implementation). Two CSS gotchas emerged in production parity testing:
1. Mask pseudo erosion of wrap's 1px top border at rest
2. Loss of card silhouette (rounded corners) when thead pins

## Changes

### Issue 1: Top Border Visibility at Rest
**File:** `app/src/renderer/components/Table/Table.css`

The wrap's 1px top border was being erased by the sticky thead mask when at rest. The mask pseudo anchors at `bottom:100%` of the sticky `th`, and `overflow-clip-margin: 1px` (isotropic) bleeds on the block axis, causing the mask to paint over the wrap's top border band with the app background.

**Fix:** Switch from `overflow-clip-margin: 1px` to `overflow-clip-margin-inline: 1px` on `.ot-table-wrap`, constraining bleed to the horizontal axis only (where gotcha #4 actually needs it). Top border now renders cleanly at rest.

### Issue 2: Missing Rounded Corners When Pinned
**File:** `app/src/renderer/components/Table/Table.css`

When the thead sticks and the wrap scrolls past the pin offset, the card's rounded top corners disappear. `overflow: clip` does not trap sticky elements, so the thead's geometry doesn't inherit the wrap's border-radius.

**Fix:** Add unconditional `border-top-{left,right}-radius: calc(var(--radius-lg) - 1px)` to `th:first-child` and `th:last-child`. This radius matches the wrap's inner curve. No-op at rest (geometry already matches); at pin point, the header carries the card silhouette.

## Skill & Decision Artifacts

- **SKILL Updated:** `.squad/skills/css-sticky-patterns/SKILL.md`
  - Gotcha #5: `overflow-clip-margin` block-axis bleed breaks top border → inline-only fix
  - Gotcha #6: `overflow: clip` doesn't trap sticky → thread radius inheritance workaround
  
- **Decision:** `.squad/decisions/inbox/trinity-thead-border-radius.md`
  - Technical deep-dive on inline vs. block bleed semantics
  - Rationale for radius inheritance strategy
  - Scheduled for merge into `decisions.md`

## Quality Gates
- ✅ Typecheck: 0 errors
- ✅ Lint: 0 warnings
- ✅ Test: 39/39 passing
- ✅ Build: All green

## Files Changed
```
.squad/skills/css-sticky-patterns/SKILL.md    +127, -0
app/src/renderer/components/Table/Table.css   +28, -5
```

**Co-authored-by:** Copilot <223556219+Copilot@users.noreply.github.com>
