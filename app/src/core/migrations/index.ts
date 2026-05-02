// Migration orchestrator — walks migration chain sequentially from old→new schema.
//
// For M1 (CURRENT_SCHEMA_VERSION = 1), the registry is empty and no migrations
// are run. Future schema bumps (v2, v3, ...) will register migrations here and
// the orchestrator will chain them: v1→v3 walks v1→v2→v3 per #206 binding decision.
//
// @see docs/specs/dataset-compatibility-validation.md § Migration Framework

import type { DomainEvent } from '../events/schemas.js';
import type { Migration, MigrationRegistry, MigrationResult } from './types.js';

/**
 * Global migration registry.
 * For M1 this is empty. Future schema bumps will register migrations here.
 */
export const migrationRegistry: MigrationRegistry = new Map();

/**
 * Run a chain of migrations from `currentVersion` to `targetVersion`.
 *
 * Walks the migration chain sequentially: if migrating v1→v3, this will run
 * v1→v2 followed by v2→v3 (per #206 binding decision). Each step is validated
 * via `canRun()` before applying.
 *
 * On failure at any step, returns `{ ok: false }` without modifying events.
 * The caller (e.g., dataset-mismatch handler) is responsible for backing up
 * events.ndjson before calling this function.
 *
 * @param events - Events loaded from events.ndjson (read-only).
 * @param currentVersion - Schema version of the events (from dataset.json).
 * @param targetVersion - Desired schema version (typically CURRENT_SCHEMA_VERSION).
 * @param registry - Migration registry (defaults to global registry).
 * @returns MigrationResult with transformed events or error.
 *
 * @throws Never throws — all errors are returned as `{ ok: false }`.
 *
 * @see docs/specs/dataset-compatibility-validation.md § Migration Orchestrator Interface
 * @see docs/specs/error-codes.md § SCHEMA_TOO_OLD_NO_MIGRATION
 */
export async function runMigrations(
  events: readonly DomainEvent[],
  currentVersion: number,
  targetVersion: number,
  registry: MigrationRegistry = migrationRegistry,
): Promise<MigrationResult> {
  if (currentVersion === targetVersion) {
    // No migration needed — same version
    return {
      ok: true,
      backupPath: '',
      migrationsRun: [],
      eventsTransformed: 0,
    };
  }

  if (currentVersion > targetVersion) {
    // Schema too new — caller should have rejected earlier
    return {
      ok: false,
      error: `Schema version ${currentVersion} is newer than target ${targetVersion}. Update the app.`,
    };
  }

  // Build the migration chain: currentVersion → currentVersion+1 → ... → targetVersion
  const chain: Migration[] = [];
  for (let v = currentVersion; v < targetVersion; v++) {
    const key = `${v}->${v + 1}`;
    const migration = registry.get(key);
    if (!migration) {
      // Missing link in chain — cannot migrate
      return {
        ok: false,
        error: `No migration available from v${v} to v${v + 1}. Contact support or update the app.`,
      };
    }
    chain.push(migration);
  }

  // Apply migrations sequentially, validating and transforming one step at a time
  let transformedEvents: DomainEvent[] = [...events];
  const migrationsRun: string[] = [];

  for (const migration of chain) {
    // Validate this migration can run on the current (possibly transformed) events
    const canRunResult = await migration.canRun(transformedEvents);
    if (!canRunResult.ok) {
      return {
        ok: false,
        error: `Migration "${migration.name}" cannot run: ${canRunResult.reason ?? 'unknown reason'}`,
      };
    }

    // Run the migration
    try {
      transformedEvents = await migration.run(transformedEvents);
      migrationsRun.push(migration.name);
    } catch (err) {
      return {
        ok: false,
        error: `Migration "${migration.name}" failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    ok: true,
    backupPath: '', // Caller is responsible for backup path; we just transform events
    migrationsRun,
    eventsTransformed: transformedEvents.length,
  };
}

/**
 * Check if a migration path exists from `currentVersion` to `targetVersion`.
 * Used by dataset-mismatch detection to decide whether to surface
 * SCHEMA_MIGRATION_AVAILABLE vs. SCHEMA_TOO_OLD_NO_MIGRATION.
 *
 * @param currentVersion - Schema version of the folder.
 * @param targetVersion - Desired schema version (typically CURRENT_SCHEMA_VERSION).
 * @param registry - Migration registry (defaults to global registry).
 * @returns `true` if all required migrations are registered, `false` otherwise.
 */
export function hasMigrationPath(
  currentVersion: number,
  targetVersion: number,
  registry: MigrationRegistry = migrationRegistry,
): boolean {
  if (currentVersion >= targetVersion) {
    return true; // No migration needed
  }

  for (let v = currentVersion; v < targetVersion; v++) {
    const key = `${v}->${v + 1}`;
    if (!registry.get(key)) {
      return false; // Missing link
    }
  }

  return true; // All links present
}
