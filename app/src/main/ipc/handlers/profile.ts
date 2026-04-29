// profile:get / profile:save IPC handler — P0-2 trial-readiness.
//
// Exposes the loaded profile to the renderer and accepts profile updates from
// the ProfileSetupModal (P1-4). Writes are atomic (tmp → fsync → rename).

import { app } from 'electron';
import {
  profileGetRequestSchema,
  type ProfileGetResponse,
  profileSaveRequestSchema,
  type ProfileSaveResponse,
  type Profile,
} from '../../../shared/ipc-contracts/profile.js';
import { saveProfile } from '../../profile.js';
import { getProfile, setProfile } from '../../bootstrap.js';

export async function handleProfileGet(raw: unknown): Promise<ProfileGetResponse> {
  // Validate request (even though it's empty, belt-and-suspenders)
  profileGetRequestSchema.parse(raw);

  const profile = getProfile();
  return { ok: true, profile };
}

export async function handleProfileSave(raw: unknown): Promise<ProfileSaveResponse> {
  try {
    // Validate the incoming profile
    const parsed = profileSaveRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: 'SCHEMA_INVALID',
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      };
    }

    const profile: Profile = parsed.data;

    // Write to disk atomically
    const userDataDir = app.getPath('userData');
    await saveProfile(userDataDir, profile);

    // Update in-memory cache
    setProfile(profile);

    return { ok: true, profile };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'WRITE_FAILED',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
