// Preload — the ONLY bridge between main and renderer (ADR-001 C6, C13 / ADR-002 §4.1).
// Exposes a narrow, typed API via contextBridge. No main imports. No crypto imports. No fs.
//
// Scaffold: exposes a stub `window.opentreasury` surface so the renderer can compile
// against it. Real handlers land with feature work.
import { contextBridge, ipcRenderer } from 'electron';

// Typed surface the renderer sees on `window.opentreasury`.
// Keep this as narrow as possible — every method is an audited IPC boundary (C13).
const api = {
  ping: async (): Promise<{ ok: true; ts: number }> => {
    return ipcRenderer.invoke('app:ping', {});
  },
  // TODO: add methods as features ship. Each MUST map 1:1 to a channel in
  //   app/src/main/ipc/schemas.ts. No dynamic dispatch, no generic invoke.
} as const;

export type OpenTreasuryApi = typeof api;

contextBridge.exposeInMainWorld('opentreasury', api);
