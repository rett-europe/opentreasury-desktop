# Skill: Wizard Gates Before Hydration

**Owner:** Morpheus (Backend Dev)
**Created:** 2026-05-08
**Applies to:** First-run flows, setup wizards, gated UI states
**Last applied:** PR for `squad/fix-dev-empty-onboarding-regression` (#196 / dev:empty regression)

## Pattern

When a UI gate (a setup wizard, a permission prompt, a profile picker) decides whether the main app renders, the data layer behind that gate **must not have already loaded anything**. If hydration runs before the gate answers, the wizard becomes cosmetic — the side effects already happened, and the in-memory state behind the wizard is lying to the user.

## Principle

**Bootstrap reads the gate's input first, and skips the data path when the gate would force the wizard.**

For any "I need to ask the user before I can proceed" decision:

1. **Identify the gate's input.** Usually a persisted boolean / null sentinel (e.g., `appConfig.dataDir === null`, `profile === null`, `consent.accepted === false`).
2. **Promote that decision to bootstrap-time.** Don't defer it to the renderer alone. Bootstrap inspects the same input and short-circuits any data-loading work the gate's outcome would invalidate.
3. **Track the deferred state explicitly.** A flag like `isOnboardingPending()` lets bootstrap, IPC registration, and accessors all agree on "we are still waiting on the user."
4. **Make the gate's predicate read from bootstrap state, not the persisted file.** `needsOnboarding: isOnboardingPending()` is more truthful than `needsOnboarding: config.dataDir === null` — it reflects what the data layer actually did.

## Anti-pattern that motivated this skill

PR #215 added a first-run onboarding wizard gated on `config.dataDir === null`. Bootstrap continued to: resolve a fallback event-log directory (`<userData>/dev-events`), create `dataset.json` there, load leftover events, replay them into the read model, and (in dev) emit a demo seed if empty. All BEFORE the renderer probed `app:needsOnboarding`. The wizard rendered over a populated read model. Pedro's bootstrap log showed `hydrated 238 events from dev-events` while the wizard was supposed to be the only thing on screen.

## The fix shape

```typescript
// bootstrap.ts
let onboardingPending = false;

export function isOnboardingPending(): boolean {
  return onboardingPending;
}

export function shouldDeferEventLog(appConfig: AppConfig): boolean {
  return appConfig.dataDir === null;
}

export async function initializeApp(): Promise<void> {
  // … load profile, appConfig, deviceId …

  if (shouldDeferEventLog(appConfigInstance)) {
    onboardingPending = true;
    bootstrapped = true;
    return; // no event log, no hydration, no seed
  }

  // … normal flow: resolveEventLogDir, loadDatasetId, log.load(), replayEvents …
}
```

```typescript
// ipc/handlers.ts
export function registerIpcHandlers(ipcMain: IpcMain): void {
  // Always register: wizard-relevant handlers (config, dialog, profile, onboarding probe).

  if (isOnboardingPending()) {
    return; // skip every handler that needs getEventLog() / getDatasetId()
  }

  // Register data-path handlers (transactions, accounts, imports, …).
}
```

```typescript
// ipc/handlers/onboarding.ts
return {
  ok: true,
  needsOnboarding: isOnboardingPending(), // single source of truth
  defaultDataDir,
};
```

## When to apply

Any first-run flow where:
- A UI gate must run before the main app.
- The data layer would otherwise load state that the gate's outcome could invalidate.
- The fallback path (default location, default tenant, default workspace) writes to disk or memory in a way the user might want to reject.

Examples:
- Onboarding wizard for data folder choice.
- Profile setup before any user-attributed event is written.
- Tenant/workspace picker for multi-tenant clients.
- License-acceptance gates before downloading large assets.
- Crash-recovery prompts before re-applying a partial transaction.

## Anti-patterns

❌ **Don't:** Render the wizard "over" a fully-loaded data layer. The user's choice becomes a no-op because the data is already in memory.
✅ **Do:** Defer hydration until the wizard answers (typically via a relaunch after the user persists their choice).

❌ **Don't:** Leave the gate's predicate reading from the persisted config file directly while bootstrap reads it differently.
✅ **Do:** Bootstrap marks its decision in a runtime flag; the IPC handler reads that flag.

❌ **Don't:** Register IPC handlers that depend on the deferred data layer when the gate is pending. They throw on the first call from any errant renderer code path.
✅ **Do:** Skip those registrations in the gate-pending branch. The renderer gated on the same flag won't call them, but defense in depth keeps the failure loud and early.

❌ **Don't:** Synthesize a fallback path "just in case". It pollutes disk and the in-memory model.
✅ **Do:** Truly skip the path. The fallback only applies AFTER the gate clears.

## Testing

Cover at minimum:
1. **Pure helper**: `shouldDeferEventLog(emptyConfig)` returns true; configured choice returns false.
2. **First-run accept-empty-folder**: gate-pending state allows the user's pick to persist without raising "switch workspace" errors.
3. **First-run adopt-existing**: gate-pending state allows opening a folder with an existing dataset.json (no current workspace to switch from).
4. **Absolute refusals stay refusals**: schema-too-new, corrupt dataset.json, foreign events without dataset.json must still be rejected on first run.
5. **No `previousDataDir` recorded on first run**: the persisted config must not list a fictitious predecessor.

## Related

- `.squad/skills/config-priority-precedence/SKILL.md` — sister rule for resolving multi-source config.
- PR #215 — first-run wizard ship.
- `.squad/decisions/inbox/morpheus-dev-empty-semantics.md` — team contract change for `dev:empty`.
