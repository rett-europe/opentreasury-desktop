/// <reference types="vite/client" />

// Window augmentation — declares window.opentreasury typed surface exposed by preload
import type { OpenTreasuryApi } from '../preload/index.js';

declare global {
  interface Window {
    opentreasury: OpenTreasuryApi;
  }
}
