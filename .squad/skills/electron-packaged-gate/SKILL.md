# Electron Dev-Only Gates Pattern

**Pattern:** Use `app.isPackaged` to gate dev-only behavior, not `process.env.NODE_ENV`.

**Context:** In Electron apps, `process.env.NODE_ENV` is **undefined** in packaged builds (not `"production"`). Relying on `NODE_ENV` to suppress dev-only behavior will fail — packaged builds will incorrectly execute dev-only code.

## Correct pattern

```ts
import { app } from 'electron';

function shouldEnableDevBehavior(isPackaged: boolean): boolean {
  // Priority 1: Packaged builds NEVER run dev-only code
  if (isPackaged) return false;

  // Priority 2: Explicit production flag (useful for testing packaged behavior in dev)
  if (process.env['NODE_ENV'] === 'production') return false;

  // Priority 3: Custom env var override (e.g., DEV_FEATURE=off)
  const flag = process.env['DEV_FEATURE']?.trim().toLowerCase();
  if (flag === 'off' || flag === '0' || flag === 'false') return false;

  // Default: enable in dev
  return true;
}

// Usage
if (shouldEnableDevBehavior(app.isPackaged)) {
  // Dev-only code: seeding, debug logging, mock data, etc.
}
```

## Why `app.isPackaged`?

- **`app.isPackaged`** is the canonical Electron way to detect "is this a packaged production build?"
  - `true` in packaged apps (built with electron-builder, etc.)
  - `false` when running from source (npm run dev)

- **`process.env.NODE_ENV`** is a Node.js / bundler convention, NOT an Electron convention
  - Set by webpack, vite, etc. during build
  - **Undefined in packaged Electron apps** (no bundler sets it at runtime)
  - Only useful as a secondary override for testing

## Dependency injection for testability

Make dev-only gates **testable** by accepting `isPackaged` as a parameter rather than importing `app` directly inside the gate function.

**Good (testable):**
```ts
export function shouldSeed(isPackaged: boolean): boolean {
  if (isPackaged) return false;
  // ... other checks
  return true;
}

// Caller passes app.isPackaged
if (shouldSeed(app.isPackaged)) {
  seedDemoData();
}

// Test can pass either value
expect(shouldSeed(true)).toBe(false);  // packaged build
expect(shouldSeed(false)).toBe(true);  // dev build
```

**Bad (hard to test):**
```ts
import { app } from 'electron';

function shouldSeed(): boolean {
  if (app.isPackaged) return false;  // ← Can't test without mocking electron
  return true;
}
```

## Real-world example: dev-seed gate (trial.3.2 fix)

**Problem:** `shouldSeed()` only checked `NODE_ENV`, so packaged builds seeded demo data into every empty folder.

**Fix:** Check `app.isPackaged` first.

**Before:**
```ts
function shouldSeed(): boolean {
  if (process.env['NODE_ENV'] === 'production') return false;
  const flag = process.env['OT_SEED']?.trim().toLowerCase();
  if (flag === 'none' || flag === '0' || flag === 'false') return false;
  return true;
}
```

**After:**
```ts
export function shouldSeed(isPackaged: boolean): boolean {
  if (isPackaged) return false;  // ← NEW: packaged builds never seed
  if (process.env['NODE_ENV'] === 'production') return false;
  const flag = process.env['OT_SEED']?.trim().toLowerCase();
  if (flag === 'none' || flag === '0' || flag === 'false') return false;
  return true;
}
```

**Caller:**
```ts
if (events.length === 0 && shouldSeed(app.isPackaged)) {
  seedDemoData();
}
```

## Priority order for dev-only gates

1. **`isPackaged`** (highest priority) — packaged builds ALWAYS skip dev-only code
2. **`NODE_ENV === 'production'`** — explicit production flag (useful for testing packaged behavior in dev)
3. **Custom env vars** (e.g., `OT_SEED=none`) — fine-grained overrides for specific features

This order ensures:
- Packaged builds NEVER run dev-only code, even if env vars are set
- Dev builds can simulate production via `NODE_ENV=production`
- Individual features can be toggled via custom env vars

## Other Electron "is this dev?" patterns

**Conditional imports:**
```ts
if (!app.isPackaged) {
  const { default: installExtension, REACT_DEVTOOLS } = await import('electron-devtools-installer');
  await installExtension(REACT_DEVTOOLS);
}
```

**Dev-only logging:**
```ts
function log(...args: unknown[]): void {
  if (!app.isPackaged) {
    console.log('[dev]', ...args);
  }
}
```

**DevTools auto-open:**
```ts
if (!app.isPackaged) {
  mainWindow.webContents.openDevTools();
}
```

## References

- **Electron docs:** https://www.electronjs.org/docs/latest/api/app#appispackaged-readonly
- **Trial.3.2 fix:** PR #271, `.squad/decisions/inbox/morpheus-dev-seed-isPackaged-fix.md`
- **Origin:** Bug where packaged builds seeded demo data because `NODE_ENV` was undefined

## Checklist

When adding dev-only code to an Electron main process:

- [ ] Use `app.isPackaged` as the primary gate
- [ ] Check `NODE_ENV` only as a secondary override (if needed)
- [ ] Accept `isPackaged` as a parameter for testability (if the gate is complex)
- [ ] Write a test that verifies `isPackaged=true` suppresses the dev behavior
- [ ] Document why the code is dev-only (comment or JSDoc)
