// app:needsOnboarding IPC handler — first-run wizard gate (#196).
//
// Returns whether the renderer should show the first-run onboarding wizard.
// The flag is true when no `dataDir` has been deliberately persisted in
// app-config.json. Once the wizard runs successfully, `dataDir` is set and
// every subsequent boot returns `needsOnboarding: false`.
//
// Also exposes the suggested default folder (`<userData>/my-data`) so the
// renderer's "Use default location" button can hand a path to setDataDir
// without round-tripping through Electron APIs from the renderer.

import * as path from 'node:path';
import {
  appNeedsOnboardingRequestSchema,
  type AppNeedsOnboardingResponse,
} from '../../../shared/ipc-contracts/onboarding.js';
import { getAppConfig } from '../../bootstrap.js';

export interface NeedsOnboardingDeps {
  userDataDir(): string;
}

export function createAppNeedsOnboardingHandler(deps: NeedsOnboardingDeps) {
  return async function handleAppNeedsOnboarding(
    raw: unknown,
  ): Promise<AppNeedsOnboardingResponse> {
    appNeedsOnboardingRequestSchema.parse(raw);
    const config = getAppConfig();
    const defaultDataDir = path.join(deps.userDataDir(), 'my-data');
    return {
      ok: true,
      needsOnboarding: config.dataDir === null,
      defaultDataDir,
    };
  };
}

/**
 * Production deps factory. Imports Electron lazily so unit tests that load
 * this module without Electron available don't blow up at import time.
 */
export async function buildProductionNeedsOnboardingDeps(): Promise<NeedsOnboardingDeps> {
  const { app } = await import('electron');
  return { userDataDir: () => app.getPath('userData') };
}
