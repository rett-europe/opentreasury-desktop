# Decision: Data Directory Priority — User Config > Env Var

**Date:** 2026-05-06  
**Agent:** Morpheus (Backend Dev)  
**Issue:** #201  
**PR:** #202  
**Status:** Shipped

## Context

User configured data folder via Preferences to `C:\temp\opentreasury`. The app relaunched successfully, but on next boot, it loaded events from a different folder (`my-data` in userData), silently ignoring the user's configured path. The config file (`app-config.json`) and actual data directory were in disagreement — **split-brain**.

Root cause: `OT_DATA_DIR` env var had **Priority 1** in `resolveEventLogDir()` (in `app/src/main/bootstrap.ts`), overriding `appConfig.dataDir` (user's deliberate choice via Preferences UI).

This was introduced in P0-3 trial-readiness (PR #199) to allow flexible dev bootstrap, but the priority was backwards. Env vars are meant to be dev-only escape hatches for fresh-start scenarios, not hijacks that override user config.

## Decision

**When config can come from multiple sources (env, file, default), user-deliberate input (UI-saved config) MUST outrank developer escape-hatches (env vars).**

### New Priority Order (highest to lowest)

1. **appConfig.dataDir** — from `userData/app-config.json` (user's deliberate choice via Preferences UI)
2. **OT_DATA_DIR env var** — dev bootstrap escape hatch; only applies when `appConfig.dataDir` is unset or fails validation
3. **Default** — `<userData>/dev-events`

### When Sources Diverge

**Always surface the effective state in the UI, never silently.**

When both `appConfig.dataDir` and `OT_DATA_DIR` are set and they differ:
- **Bootstrap:** Log a single warning: `[bootstrap] ⚠️ OT_DATA_DIR env var ({env}) ignored — appConfig.dataDir ({config}) takes precedence. Unset OT_DATA_DIR or update Preferences if intended.`
- **UI:** Show a drift warning in Preferences: `⚠️ Active data folder differs from configured: {effectivePath}. Likely cause: OT_DATA_DIR env override.`

This prevents user confusion when config file and runtime state disagree.

## Rationale

1. **User trust:** Users deliberately choose a data folder via Preferences. That choice must be authoritative. If an env var silently overrides it, users lose trust in the UI.
2. **Dev/prod consistency:** In packaged builds, `OT_DATA_DIR` env var wouldn't be set, so behavior would diverge between dev and prod. By making user config win, dev and prod behave the same.
3. **Escape hatch semantics:** Env vars are useful for fresh-start scenarios (e.g., `npm run dev:empty` with a custom folder). But once the user has configured a folder via Preferences, that should stick across relaunches, regardless of what env vars are set.

## Implementation (PR #202)

1. **Priority flip in `bootstrap.ts`:** `appConfig.dataDir` (user config) now wins over `OT_DATA_DIR`. Env var only applies when `appConfig.dataDir` is unset or fails validation.
2. **Warning log:** When both are set and differ, log the warning above.
3. **UI drift detection in `PreferencesScreen`:** Added warning row when configured path differs from effective path.
4. **i18n:** Added `preferences.dataset.driftWarning` to `en/es common.json`.
5. **CSS:** Added `.ot-preferences__warning` style (yellow/orange border, similar to error card).
6. **Tests:** Updated `bootstrap.test.ts` to reflect new priority. New test: `should prefer appConfig.dataDir over OT_DATA_DIR (user config wins)`. All 938 tests pass.

## Generalization

This pattern applies to **any** future config-source conflicts (e.g., command-line flags vs saved config):
- User-deliberate input (saved config from UI) is always authoritative.
- Env vars, command-line flags, and other developer tools are escape hatches for fresh-start scenarios.
- When sources diverge, surface the effective state in the UI with a clear explanation.

## Related

- Issue #201 (P0 split-brain dataset state)
- PR #199 (storage-scope pivot — introduced the bug)
- P0-3 trial-readiness milestone
