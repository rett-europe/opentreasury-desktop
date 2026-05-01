// Onboarding IPC contract — first-run wizard (#196).
//
// Exposes `app:needsOnboarding` so the renderer can decide whether to show the
// first-run wizard before booting into the main app. The flag is true when
// the user has never deliberately picked a data folder (i.e.,
// app-config.json's `dataDir` is null or the file doesn't exist yet).
//
// The handler also returns the suggested default folder path so the wizard
// can offer a one-click "Use default location" affordance without having to
// query Electron's `app.getPath('userData')` separately.

import { z } from 'zod';

export const IPC_APP_NEEDS_ONBOARDING = 'app:needsOnboarding';

export const appNeedsOnboardingRequestSchema = z.undefined().or(z.null()).or(z.object({}));

export const appNeedsOnboardingResponseSchema = z.object({
  ok: z.literal(true),
  needsOnboarding: z.boolean(),
  /** Suggested default `<userData>/my-data` for the "Use default" button. */
  defaultDataDir: z.string(),
});

export type AppNeedsOnboardingResponse = z.infer<typeof appNeedsOnboardingResponseSchema>;
