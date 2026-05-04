// App IPC handlers — application-level queries.
// Thin wrapper exposing Electron app metadata to the renderer.

import type {
  AppGetVersionRequest,
  AppGetVersionResponse,
} from '../../../shared/ipc-contracts/app.js';

/**
 * Handler for app:get-version. Returns the application version from
 * Electron's app.getVersion() (which reads package.json version field).
 *
 * Deps are injected for testability (mocking Electron's app module).
 */
export interface AppGetVersionDeps {
  /** Returns the app version string. Defaults to Electron's app.getVersion(). */
  getVersion(): string;
}

export function createAppGetVersionHandler(deps: AppGetVersionDeps) {
  return async function handleAppGetVersion(
    _request: AppGetVersionRequest,
  ): Promise<AppGetVersionResponse> {
    return { version: deps.getVersion() };
  };
}

/**
 * Production deps factory. Imports Electron's `app` lazily so unit tests that
 * import this module without Electron available don't blow up at import time.
 */
export async function buildProductionAppGetVersionDeps(): Promise<AppGetVersionDeps> {
  const { app } = await import('electron');
  return {
    getVersion: () => app.getVersion(),
  };
}
