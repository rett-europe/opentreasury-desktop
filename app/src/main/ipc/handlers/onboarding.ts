// app:needsOnboarding IPC handler — first-run wizard gate (#196).
//
// Returns whether the renderer should show the first-run onboarding wizard.
// The flag is true when no `dataDir` has been deliberately persisted in
// app-config.json. Once the wizard runs successfully, `dataDir` is set and
// every subsequent boot returns `needsOnboarding: false`.
//
// Also exposes the suggested default folder (`<Documents>/OpenTreasury`) so
// the renderer's "Use default location" button can hand a path to setDataDir
// without round-tripping through Electron APIs from the renderer. Documents
// is used (not userData/AppData) because that location survives app uninstall
// and is OneDrive-friendly on Windows.

import * as path from 'node:path';
import {
  appNeedsOnboardingRequestSchema,
  type AppNeedsOnboardingResponse,
} from '../../../shared/ipc-contracts/onboarding.js';
import { isOnboardingPending } from '../../bootstrap.js';

export interface NeedsOnboardingDeps {
  documentsDir(): string;
}

export function createAppNeedsOnboardingHandler(deps: NeedsOnboardingDeps) {
  return async function handleAppNeedsOnboarding(
    raw: unknown,
  ): Promise<AppNeedsOnboardingResponse> {
    appNeedsOnboardingRequestSchema.parse(raw);
    const defaultDataDir = path.join(deps.documentsDir(), 'OpenTreasury');
    return {
      ok: true,
      // Source of truth is bootstrap's onboarding flag — it is set when
      // `appConfig.dataDir === null` AND the event log was deferred. Reading
      // it here keeps the wizard predicate aligned with what bootstrap
      // actually did (no event log, no hydration), instead of re-deriving
      // from the loaded config.
      needsOnboarding: isOnboardingPending(),
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
  return { documentsDir: () => app.getPath('documents') };
}
