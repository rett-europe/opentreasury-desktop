# Skill: Config Priority Precedence

**Owner:** Morpheus (Backend Dev)  
**Created:** 2026-05-06  
**Applies to:** Configuration loading, bootstrap logic, settings management  
**Last applied:** PR #202 (data-dir priority fix)

## Pattern

When configuration can come from **multiple sources** (environment variables, config files, command-line flags, defaults), establish a clear priority order that respects **user intent** and **developer escape hatches**.

### Priority Principle

**User-deliberate input (UI-saved config) MUST outrank developer escape-hatches (env vars, CLI flags).**

Rationale:
- **User trust:** When a user deliberately configures something via the UI (e.g., Preferences), that choice must be authoritative. If an env var silently overrides it, users lose trust in the UI.
- **Dev/prod consistency:** Env vars and CLI flags are often dev-only conveniences. Making them trump user config leads to behavior divergence between dev and prod.
- **Escape hatch semantics:** Env vars and CLI flags are useful for fresh-start scenarios (e.g., testing a different config without touching the saved file). Once the user has saved a config, that should stick across sessions.

### Priority Order Template

1. **User config from UI** — saved to persistent storage (e.g., `app-config.json`, `profile.json`)
2. **Env vars / CLI flags** — developer escape hatches; only apply when user config is unset or fails validation
3. **Defaults** — hardcoded fallbacks

### When Sources Diverge

**Always surface the effective state in the UI, never silently.**

When a developer escape-hatch (env var, CLI flag) is set AND user config exists AND they differ:
- **Log a warning** at bootstrap/load time: `[bootstrap] ⚠️ {env/flag name} ({value}) ignored — user config ({config}) takes precedence. Unset {env/flag name} or update via UI if intended.`
- **Show a drift warning in the UI** (e.g., Settings/Preferences screen): `⚠️ Active {setting} differs from configured: {effectiveValue}. Likely cause: {env/flag name} override.`

This prevents user confusion when config file and runtime state disagree.

## Example: Data Directory Resolution (PR #202)

**Problem:** `OT_DATA_DIR` env var overrode user-configured `appConfig.dataDir`, causing split-brain state.

**Solution:**
1. Flipped priority in `app/src/main/bootstrap.ts` `resolveEventLogDir()`:
   - Priority 1: `appConfig.dataDir` (user config)
   - Priority 2: `OT_DATA_DIR` env var (only when `appConfig.dataDir` is unset or fails)
   - Priority 3: Default (`<userData>/dev-events`)
2. Added warning log when both are set and differ.
3. Added UI drift warning in `PreferencesScreen` when configured path ≠ effective path.

**Code pattern (simplified):**

```typescript
async function resolveEventLogDir(
  userDataDir: string,
  appConfig: AppConfig,
): Promise<string> {
  const envOverride = process.env['OT_DATA_DIR']?.trim();
  const configPath = appConfig.dataDir;

  // Priority 1: User config
  if (configPath) {
    const validated = await validatePath(configPath);
    if (validated) {
      // Warn if env override is set but ignored
      if (envOverride && envOverride !== configPath) {
        console.warn(
          `[bootstrap] ⚠️ OT_DATA_DIR env var (${envOverride}) ignored — appConfig.dataDir (${validated}) takes precedence.`,
        );
      }
      return validated;
    }
  }

  // Priority 2: Env var (escape hatch)
  if (envOverride) {
    const validated = await validatePath(envOverride);
    if (validated) return validated;
  }

  // Priority 3: Default
  return path.join(userDataDir, 'dev-events');
}
```

**UI pattern (PreferencesScreen):**

```tsx
{configData.dataDir !== null &&
  configData.dataDir !== configData.effectiveDataDir && (
    <div className="warning">
      ⚠️ Active data folder differs from configured: {configData.effectiveDataDir}.
      Likely cause: OT_DATA_DIR env override.
    </div>
  )}
```

## Generalization

This pattern applies to any config setting that can come from multiple sources:
- Database connection strings
- API endpoints
- Feature flags
- Logging levels
- File paths
- Port numbers
- Credentials (with extra care for security)

Always:
1. **Document the priority order** in code comments (JSDoc).
2. **Log warnings** when sources diverge.
3. **Surface effective state in UI** when it differs from configured state.

## Anti-patterns

❌ **Don't:** Let env vars silently override user config without warning.  
✅ **Do:** Warn at bootstrap, show drift in UI.

❌ **Don't:** Use env vars as the highest priority by default.  
✅ **Do:** Reserve env vars for dev-only escape hatches.

❌ **Don't:** Hide effective state from users.  
✅ **Do:** Show both configured and effective values when they differ.

## Testing

When implementing this pattern, test:
1. **Config set, env unset** → config wins.
2. **Config set, env set (different)** → config wins, warning logged.
3. **Config unset, env set** → env wins.
4. **Both unset** → default wins.

Example from `bootstrap.test.ts`:

```typescript
it('should prefer appConfig.dataDir over OT_DATA_DIR (user config wins)', async () => {
  const envPath = path.join(testDir, 'env-priority');
  const configPath = path.join(testDir, 'config-priority');
  const config: AppConfig = { version: 1, dataDir: configPath, readOnly: false };

  const resolved = await testResolveEventLogDir(testDir, config, envPath);
  expect(resolved).toBe(configPath); // User config wins
});
```

## Related

- PR #202 (data-dir priority fix)
- Issue #201 (P0 split-brain dataset state)
- `.squad/decisions/inbox/morpheus-data-dir-priority-flip.md` (decision note)
