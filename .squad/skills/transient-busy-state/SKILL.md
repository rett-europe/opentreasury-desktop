# Skill: Transient busy state for native/external triggers

**Owner:** Trinity
**Origin:** PR #284 regression → PR #289 fix (ImportWizard "Opening file picker..." spinner stuck on packaged Windows)
**Last updated:** 2026-05-06

## When to use

You have a UI affordance (button, dropzone, etc.) that triggers something whose completion is **not directly awaitable from the renderer**:

- HTML `<input type=file>` opening a native OS dialog
- An IPC call that may or may not resolve (handler can crash, cancel paths can be silent)
- An external process (`shell.openExternal`, OS share sheet, browser auth window)
- Any async work where the "done" signal is implicit (focus return, event, side-effect)

You want to show a busy state ("Opening...", spinner, disabled control) while the external action is in flight, and you MUST guarantee the busy state always clears.

## Rules

1. **Never rely on a single clearer for transient external state.** Especially not `window.focus`. On packaged Electron on Windows the renderer often does not blur/refocus around a native dialog parented to the BrowserWindow.
2. **Always add a hard safety timeout** (e.g. 30s). It's the last-resort guarantee that the UI is recoverable. Log a warning when it fires — that's a signal something else is broken, but the user can still retry.
3. **If your busy state disables interaction (`pointer-events: none`, `disabled`), the timeout is non-negotiable.** Otherwise a single missed clear = stuck UI requiring app restart.
4. **Centralize the clear logic** in a single `clearBusy()` helper. Every clearer calls it. The helper is idempotent — removes all listeners, cancels all timers, sets state to false.
5. **Wrap awaitable work in `try/finally`.** When you DO have a promise, put `setBusy(false)` in `finally`. Combine this with the multi-listener approach when the promise itself can hang.
6. **Clean up on unmount.** A `useEffect(() => () => clearBusy(), [clearBusy])` ensures stray timers/listeners don't leak or fire after the component is gone.

## Pattern (React + Electron renderer)

```tsx
const SAFETY_MS = 30_000;
const [busy, setBusy] = useState(false);
const focusHandlerRef = useRef<(() => void) | null>(null);
const pointerHandlerRef = useRef<(() => void) | null>(null);
const visibilityHandlerRef = useRef<(() => void) | null>(null);
const safetyTimerRef = useRef<number | null>(null);
const attachTimerRef = useRef<number | null>(null);

const clearBusy = useCallback(() => {
  setBusy(false);
  if (focusHandlerRef.current) {
    window.removeEventListener('focus', focusHandlerRef.current);
    focusHandlerRef.current = null;
  }
  if (pointerHandlerRef.current) {
    document.removeEventListener('pointerdown', pointerHandlerRef.current);
    pointerHandlerRef.current = null;
  }
  if (visibilityHandlerRef.current) {
    document.removeEventListener('visibilitychange', visibilityHandlerRef.current);
    visibilityHandlerRef.current = null;
  }
  if (safetyTimerRef.current !== null) {
    window.clearTimeout(safetyTimerRef.current);
    safetyTimerRef.current = null;
  }
  if (attachTimerRef.current !== null) {
    window.clearTimeout(attachTimerRef.current);
    attachTimerRef.current = null;
  }
}, []);

useEffect(() => () => clearBusy(), [clearBusy]);

const trigger = () => {
  if (busy) return;
  setBusy(true);

  const onFocus = () => clearBusy();
  const onPointer = () => clearBusy();
  const onVis = () => { if (document.visibilityState === 'visible') clearBusy(); };
  focusHandlerRef.current = onFocus;
  pointerHandlerRef.current = onPointer;
  visibilityHandlerRef.current = onVis;

  // Delay listener attach so the same gesture that opened the dialog
  // doesn't immediately re-trigger the clearers.
  attachTimerRef.current = window.setTimeout(() => {
    attachTimerRef.current = null;
    window.addEventListener('focus', onFocus);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('visibilitychange', onVis);
  }, 300);

  safetyTimerRef.current = window.setTimeout(() => {
    console.warn('[Component] busy state exceeded safety timeout — clearing.');
    clearBusy();
  }, SAFETY_MS);

  // ...invoke the external action (input.click(), ipc.invoke(...), etc.)
};

// For a happy-path completion (e.g. file picked, ipc resolved):
const onCompleted = (result) => {
  clearBusy();
  // ...handle result
};
```

## Anti-patterns to avoid

- ❌ Single `window.focus` listener as the only clearer for native dialog state.
- ❌ `setTimeout` to attach a listener with no matching cleanup on unmount.
- ❌ Busy state with `pointer-events: none` and no safety timeout.
- ❌ Awaiting an IPC promise without `finally { setBusy(false) }`.
- ❌ Conditionally rendering the trigger element while busy in a way that destroys the input ref before the native dialog opens.

## Cross-platform notes

- **Windows packaged Electron:** parent BrowserWindow often retains focus during a native modal dialog; `window.focus`/`blur` may not fire. ← This is why PR #284 broke.
- **macOS:** native file dialog blurs the parent window reliably; focus listener works there (which is why this wasn't caught in dev on macOS).
- **Linux:** depends on window manager; treat as Windows-class (unreliable).

## Related

- PR #289 — fix(import): clear file-picker busy state via multiple safety nets
- PR #284 — original feature (left in place; this skill formalizes the robust pattern)
- `app/src/renderer/components/ImportWizard/ImportWizard.tsx` — reference implementation
