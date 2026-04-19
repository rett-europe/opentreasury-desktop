/// <reference types="vite/client" />

// Window augmentation — declares window.opentreasury typed surface exposed by preload.
// The single source of truth is `OpenTreasuryApi` in `../preload/index.ts`.
import type { OpenTreasuryApi } from '../preload/index.js';

declare global {
  interface Window {
    opentreasury: OpenTreasuryApi;
  }
}
