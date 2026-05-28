import { useEffect, type RefObject } from 'react';

/**
 * Force-close a native `<dialog>` element when the host component unmounts.
 *
 * Why this exists — HTMLDialogElement top-layer footgun
 * ----------------------------------------------------
 * When a `<dialog>` is in `showModal()` state, Chromium promotes it to the
 * top layer and marks the rest of the document `inert` (no keyboard input,
 * no focus). The browser only releases that top-layer ownership on an
 * explicit `dialog.close()` (or `cancel` event). If the dialog DOM node is
 * **removed** from the document while still open — e.g. React unmounts the
 * component because a parent's conditional render flipped — the cleanup
 * never runs and the page stays inert. After a few such unmounts the entire
 * app can no longer accept keyboard input until reload.
 *
 * Symptom we hit (trial.3.12): editing ~3 transactions in a row froze every
 * input box in the app — clicks still focused inputs but no characters
 * appeared. Root cause was MovementsScreen unmounting the detail modal
 * mid-save, when `loadAll()` flipped `state.kind` to `'loading'`.
 *
 * Two-layer fix:
 *   1. (this hook) Every modal that calls `dialog.showModal()` adds an
 *      on-unmount cleanup that closes the dialog if it's still open.
 *      Belt-and-braces: even if a parent unmounts us unexpectedly, the
 *      top layer is released.
 *   2. Lift modals out of `state.kind`-gated fragments so they aren't
 *      unmounted by routine read-model refreshes in the first place.
 *
 * Usage:
 *   const dialogRef = useRef<HTMLDialogElement>(null);
 *   useCloseDialogOnUnmount(dialogRef);
 *   // ... existing showModal/close effect ...
 */
export function useCloseDialogOnUnmount(ref: RefObject<HTMLDialogElement | null>): void {
  useEffect(() => {
    // Capture the ref into a local — by the time the cleanup runs React may
    // have already re-pointed `ref.current` (e.g. component remount). We
    // need the dialog node we actually mounted on, not whichever node the
    // ref happens to point at later. This also satisfies the
    // react-hooks/exhaustive-deps lint rule about reading mutable refs in
    // cleanup functions.
    const dialog = ref.current;
    return () => {
      // Guard for `typeof dialog.close === 'function'`: in jsdom tests
      // HTMLDialogElement methods may be unstubbed by an outer `finally`
      // block before React's passive-effect cleanup runs. Real browsers
      // always provide `close`, so this guard is purely test-defensive.
      if (dialog?.open && typeof dialog.close === 'function') {
        dialog.close();
      }
    };
    // Intentionally empty deps — cleanup must run only on unmount, not on
    // every re-render. The ref object identity is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
