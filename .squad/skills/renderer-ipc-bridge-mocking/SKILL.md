# Skill: Mocking the renderer's `window.opentreasury` IPC bridge in tests

**Domain:** Frontend / renderer / vitest jsdom
**Discovered:** 2026-05-07 (PR #296, Trinity, fixing 3 failing ImportWizard tests after PR #290)
**Reusable in:** any renderer component test that triggers an IPC call (file dialogs,
`accounts.list`, `import.stageFile`, `transaction.note.add`, etc).

## Problem

The renderer talks to the main process exclusively through the typed bridge exposed by
`preload.ts`, which lands on `window.opentreasury` (NOT `window.electron.invoke(channel)`
— that's the lower-level Electron primitive, not what our renderer calls).

```ts
// renderer code
const result = await window.opentreasury.dialog.pickImportFile();
const accounts = await window.opentreasury.accounts.list();
```

In jsdom tests the bridge is `undefined` unless we install a fake. Two failure modes:

1. **Top-level access throws.** `window.opentreasury.dialog` → `TypeError: Cannot read
   properties of undefined (reading 'dialog')`.
2. **Stale-mock drift.** When a renderer feature moves from one bridge slot to another
   (e.g. PR #290 moved file picking from a hidden `<input type="file">` to
   `dialog.pickImportFile`), tests that mocked the old surface keep "passing setup" but
   crash on the new call site. The classic symptom is
   `TypeError: Object.defineProperty called on non-object` because the test was poking at
   a DOM input that no longer renders.

## Pattern: a `mountBridge()` helper per test file

### 1. Centralize the fake bridge in one helper

```ts
function mountBridge(overrides: {
  stageFile?: ReturnType<typeof vi.fn>;
  dryRun?: ReturnType<typeof vi.fn>;
  pickImportFile?: ReturnType<typeof vi.fn>;
} = {}) {
  const stageFile = overrides.stageFile ?? vi.fn().mockResolvedValue(stageResponse);
  const dryRun    = overrides.dryRun    ?? vi.fn().mockResolvedValue(dryRunResponse);
  const pickImportFile =
    overrides.pickImportFile ??
    vi.fn().mockResolvedValue({ ok: true, cancelled: false, path: '/tmp/sample.csv' });

  (window as unknown as { opentreasury: unknown }).opentreasury = {
    accounts: { list: vi.fn().mockResolvedValue(accountsResponse) },
    dialog:   { pickImportFile },
    import:   { stageFile, dryRun, /* ...other slots */ },
  };

  // Return the spies the test wants to assert on.
  return { stageFile, dryRun, pickImportFile };
}
```

Key rules:
- **Reset between tests.** `beforeEach(() => { delete (window as any).opentreasury; })` so
  one test's mock can't leak into the next.
- **Group by namespace.** Mirror the real bridge shape (`accounts`, `dialog`, `import`,
  `transaction`, `notes`, ...). Don't flatten — components that destructure
  `window.opentreasury.dialog` will break otherwise.
- **Return the spies.** Tests that need to assert call args or count must reach the same
  `vi.fn()` instance the component invoked.

### 2. Drive the UI through the same affordance the user uses

After PR #290 the file picker is a `<button class="ot-import-wizard__dropzone">`, not
an `<input type="file">`. Tests must click the button:

```ts
const dropzone = document.querySelector('.ot-import-wizard__dropzone') as HTMLButtonElement;
fireEvent.click(dropzone);
// component calls window.opentreasury.dialog.pickImportFile() → resolves to fake path
// → component calls importApi.stageFile({ filePath }) → resolves to stageResponse
```

Avoid `Object.defineProperty(input, 'files', ...)` patterns — they only worked when the
component owned a real `<input type="file">`.

### 3. Mock the response shape exactly

`pickImportFile` returns `{ ok, cancelled, path }`. If you forget `ok: true` the
component takes the error branch silently and the test sees "stuck on uploadFile step"
with no clue why. Trace the consumer's branching once and write the happy-path mock to
match.

## When to use this skill

- Renderer component tests that mount a component which calls `window.opentreasury.*`.
- Refactors of the preload bridge — every consumer test needs to be updated in lockstep,
  or it falls back to fixture-drift failures with cryptic messages.

## Anti-patterns

- ❌ Mocking `window.electron.invoke('channel:name')`. That's the Electron primitive.
  The renderer always calls the typed bridge, so your mock must match the bridge shape.
- ❌ Defining the bridge once at file top-level instead of inside `beforeEach` /
  `mountBridge()`. Tests then share state and order matters.
- ❌ Mocking only the slots the test thinks the component touches. Components often call
  `accounts.list()` on mount; missing that yields "stuck on selectAccount step" failures.
- ❌ Writing assertions against the old DOM affordance after a component refactor. If the
  user-facing flow changed (button vs input vs dialog), mirror that in the test.

## See also

- `app/src/renderer/components/ImportWizard/ImportWizard.test.tsx` — `mountBridge` +
  `advanceToMapColumns` after the PR #290 IPC migration.
- `app/src/renderer/screens/PreferencesScreen/PreferencesScreen.test.tsx` — partial bridge
  mock pattern with `@ts-expect-error` for the smaller surface a screen needs.
- `app/src/renderer/components/TransactionDetailModal/TransactionDetailModal.test.tsx` —
  `mountBridge()` shape for the `transaction.note.*` bridge slot.
