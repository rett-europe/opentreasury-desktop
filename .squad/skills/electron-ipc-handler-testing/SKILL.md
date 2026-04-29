# Skill: Testing Electron IPC handlers without Electron

**Domain:** Backend / IPC / testing
**Discovered:** 2026-04-29 (PR #166, Morpheus, P1-2 #149)
**Reusable in:** any IPC handler that calls `app.relaunch`, `app.exit`,
`app.getPath`, `dialog.*`, `shell.*`, etc.

## Problem

Vitest runs in a node environment. Importing a module that does
`import { app } from 'electron'` at the top level either:

- crashes the test ("Cannot find module 'electron'" or similar), OR
- pulls in real Electron and hangs / exits the test process when calls like
  `app.exit(0)` actually fire.

We want the handler to be unit-testable end-to-end (validation + persistence
+ relaunch scheduling) without spinning up Electron.

## Pattern: deps-injection factory + lazy electron import

### 1. Build the handler via a factory that takes a `deps` object

```ts
export interface SetDataDirDeps {
  userDataDir(): string;
  relaunch(): void;
  exit(code: number): void;
  // ...optional test-only overrides
}

export function createConfigSetDataDirHandler(deps: SetDataDirDeps) {
  return async function handle(raw: unknown) {
    // ...uses deps.userDataDir(), deps.relaunch(), deps.exit()
  };
}
```

The handler **never** imports `app` directly. Every Electron-touching call
goes through `deps`.

### 2. Production wiring lazy-imports Electron

```ts
export async function buildProductionSetDataDirDeps(): Promise<SetDataDirDeps> {
  const { app } = await import('electron');
  return {
    userDataDir: () => app.getPath('userData'),
    relaunch: () => app.relaunch(),
    exit: (code) => app.exit(code),
  };
}
```

The handler module itself doesn't import 'electron' at the top, so
`vitest` can load it freely.

### 3. IPC registration resolves deps once, lazily

```ts
let setDataDirHandler: ReturnType<typeof createConfigSetDataDirHandler> | null = null;
ipcMain.handle(IPC_CONFIG_SET_DATA_DIR, async (_event, raw) => {
  if (setDataDirHandler === null) {
    setDataDirHandler = createConfigSetDataDirHandler(
      await buildProductionSetDataDirDeps(),
    );
  }
  return responseSchema.parse(await setDataDirHandler(raw));
});
```

### 4. Tests inject `vi.fn()` stubs

```ts
import { describe, it, expect, vi } from 'vitest';

// MUST be at the very top, before any import that transitively pulls a
// module that imports 'electron'. vitest hoists vi.mock automatically.
vi.mock('electron', () => ({
  app: {
    getPath: () => '/should/not/be/used',
    relaunch: () => undefined,
    exit: () => undefined,
  },
}));

import { createConfigSetDataDirHandler } from './config.js';

it('schedules relaunch+exit via setImmediate', async () => {
  const relaunch = vi.fn();
  const exit = vi.fn();

  const handler = createConfigSetDataDirHandler({
    userDataDir: () => '/tmp/userdata',
    relaunch,
    exit,
    // ...other test-only overrides
  });

  vi.useFakeTimers();
  const result = await handler({ newDir: '/tmp/external/ws' });
  expect(result).toEqual({ ok: true });

  // Critical: relaunch is NOT called synchronously — it's scheduled.
  expect(relaunch).not.toHaveBeenCalled();
  await vi.runAllTimersAsync(); // drain setImmediate queue
  expect(relaunch).toHaveBeenCalledTimes(1);
  expect(exit).toHaveBeenCalledWith(0);
});
```

## Why both the `vi.mock('electron', ...)` AND the factory?

- The `vi.mock` is needed because **other modules** in the import graph
  (e.g. `bootstrap.ts`) still do `import { app } from 'electron'` at the
  top level. Without the mock, the test file fails to load.
- The factory is needed because the **handler-under-test** must be able to
  capture per-test stubs and verify they were called. `vi.mock` gives a
  shared module-level mock; the factory gives a per-test injection point.

## When to use this skill

Apply this pattern whenever a main-process module needs to call any of:

- `app.*` (relaunch, exit, getPath, quit, focus, ...)
- `dialog.*` (showOpenDialog, showSaveDialog, showMessageBox)
- `shell.*` (openPath, openExternal, trashItem)
- `BrowserWindow` static methods
- `Menu`, `Tray`, `nativeTheme`, `powerMonitor`, ...

If the module only touches `ipcMain` (registering handlers), the
factory pattern is unnecessary — `ipcMain` is normally invoked by the
test indirectly.

## Anti-patterns

- ❌ Calling `app.exit(0)` synchronously in the handler. Always defer
  through `setImmediate` so the IPC reply flushes first.
- ❌ Importing `app` at the top of the handler module. Even if you
  `vi.mock('electron')`, you lose per-test verifiability of which calls
  fired.
- ❌ Using `vi.spyOn(app, 'relaunch')` on the mocked module. The mock
  replaces the entire module; the spy targets a frozen object. Use deps
  injection instead.

## See also

- `app/src/main/ipc/handlers/config.ts` — reference implementation
- `app/src/main/ipc/handlers/config.test.ts` — 13 test cases including
  fake-timer assertions on relaunch+exit
- `.squad/decisions/inbox/morpheus-set-data-dir-ipc.md` — design rationale
