// App config schema + persistence (P0-3 trial-readiness).
//
// Manages the application configuration stored in userData/app-config.json.
// This includes dataDir (absolute path to event-log directory) and readOnly
// (blocks domain event writes when true).
//
// Atomic writes (tmp → fsync → rename) ensure partial writes don't corrupt the
// config during crashes. Missing/invalid app-config.json yields defaults;
// the app continues with default behavior.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { z } from 'zod';

// Zod schema — app-config.json structure
export const appConfigSchema = z.object({
  version: z.number().int().positive().default(1), // for future migrations
  dataDir: z.string().nullable().default(null), // null = use default <userData>/dev-events
  previousDataDir: z.string().nullable().default(null), // fallback on bootstrap failure
  readOnly: z.boolean().default(false), // blocks domain event writes (not config/profile writes)
});

export type AppConfig = z.infer<typeof appConfigSchema>;

const CONFIG_FILENAME = 'app-config.json';

/**
 * Load app-config.json from the userData directory.
 * Returns default config if the file doesn't exist or fails validation.
 * Logs a warning on parse errors but does NOT crash the app.
 */
export async function loadAppConfig(userDataDir: string): Promise<AppConfig> {
  const filePath = path.join(userDataDir, CONFIG_FILENAME);

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Invalid JSON — treat as missing. Fall back to defaults.
      // eslint-disable-next-line no-console
      console.warn(`[config] Invalid JSON in app-config.json (${filePath}), using defaults`);
      return appConfigSchema.parse({});
    }

    const result = appConfigSchema.safeParse(parsed);

    if (!result.success) {
      // Invalid app-config.json — treat as missing. Fall back to defaults.
      // eslint-disable-next-line no-console
      console.warn(
        `[config] Invalid app-config.json (${filePath}): ${result.error.message}, using defaults`,
      );
      return appConfigSchema.parse({});
    }

    return result.data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // File doesn't exist — first launch or never configured. Return defaults.
      return appConfigSchema.parse({});
    }
    // Unexpected I/O error (permission denied, disk full, etc.) — propagate.
    throw err;
  }
}

/**
 * Atomically write app-config.json to disk.
 * Uses tmp file + fsync + rename for crash safety (ADR-001 C8).
 */
export async function saveAppConfig(userDataDir: string, config: AppConfig): Promise<void> {
  // Validate before writing
  appConfigSchema.parse(config);

  const filePath = path.join(userDataDir, CONFIG_FILENAME);
  const tmpPath = `${filePath}.tmp`;

  const content = JSON.stringify(config, null, 2);

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
  console.log(
    `[config] Saved app config (dataDir: ${config.dataDir ?? 'default'}, readOnly: ${config.readOnly})`,
  );
}

/**
 * Create a default app config. All fields use their schema defaults.
 */
export function createDefaultAppConfig(): AppConfig {
  return appConfigSchema.parse({});
}
