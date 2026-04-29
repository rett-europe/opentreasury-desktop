// Profile schema + persistence (P0-2 trial-readiness).
//
// Manages the local user profile stored in userData/profile.json. This is the
// "single active user" approach for trial — one profile per Electron app
// instance, with actorUserId stamped on every DomainEvent. AAD integration
// (actorIdentitySource: 'aad') will arrive in M2 but the schema supports it now.
//
// Atomic writes (tmp → fsync → rename) ensure partial writes don't corrupt the
// profile during crashes. Missing/invalid profile.json yields null; the renderer
// ProfileSetupModal (P1-4) handles first-launch UX.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';
import { newUlid } from './ids.js';

// Zod schema — profile.json structure
export const profileSchema = z.object({
  userId: z.string().length(26), // ULID
  name: z.string().max(100), // Can be empty until ProfileSetupModal fills it (P1-4)
  role: z.string().max(50), // free-text (e.g., "Treasurer", "Viewer")
  ngoName: z.string().max(200),
  identitySource: z.enum(['local', 'aad']).default('local'),
  createdAt: z.string().datetime(), // ISO 8601 UTC
});

export type Profile = z.infer<typeof profileSchema>;

const PROFILE_FILENAME = 'profile.json';

/**
 * Load profile.json from the userData directory.
 * Returns null if the file doesn't exist or fails validation.
 * Throws only on unexpected I/O errors (e.g., permission denied).
 */
export async function loadProfile(userDataDir: string): Promise<Profile | null> {
  const filePath = path.join(userDataDir, PROFILE_FILENAME);

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Invalid JSON — treat as missing. Fresh-install modal will recreate it.
      // eslint-disable-next-line no-console
      console.warn(`[profile] Invalid JSON in profile.json (${filePath})`);
      return null;
    }

    const result = profileSchema.safeParse(parsed);

    if (!result.success) {
      // Invalid profile.json — treat as missing. Fresh-install modal will
      // recreate it. Don't throw; the app can proceed with profile === null.
      // eslint-disable-next-line no-console
      console.warn(`[profile] Invalid profile.json (${filePath}): ${result.error.message}`);
      return null;
    }

    return result.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist — first launch. Return null so bootstrap can proceed.
      return null;
    }
    // Unexpected I/O error (permission denied, disk full, etc.) — propagate.
    throw err;
  }
}

/**
 * Atomically write profile.json to disk.
 * Uses tmp file + fsync + rename for crash safety (ADR-001 C8).
 */
export async function saveProfile(userDataDir: string, profile: Profile): Promise<void> {
  // Validate before writing
  profileSchema.parse(profile);

  const filePath = path.join(userDataDir, PROFILE_FILENAME);
  const tmpPath = `${filePath}.tmp`;

  const content = JSON.stringify(profile, null, 2);

  // Write to .tmp, fsync, rename atomically
  await fs.writeFile(tmpPath, content, 'utf-8');
  const fh = await fs.open(tmpPath, 'r+');
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmpPath, filePath);

  // eslint-disable-next-line no-console
  console.log(`[profile] Saved profile for user ${profile.userId} (${profile.name})`);
}

/**
 * Create a default profile with a fresh ULID. Called when bootstrap finds no
 * profile.json. The renderer's ProfileSetupModal will prompt the user to fill
 * in name/role/ngoName, then call profile:save.
 */
export function createDefaultProfile(): Profile {
  return {
    userId: newUlid(),
    name: '',
    role: '',
    ngoName: '',
    identitySource: 'local',
    createdAt: new Date().toISOString(),
  };
}
