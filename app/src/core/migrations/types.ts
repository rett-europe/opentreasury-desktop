// Migration framework types — scaffolding for schema version transitions.
//
// This file defines the contract for migrations between schema versions. No
// migrations are actually executed in M1 (CURRENT_SCHEMA_VERSION = 1), but this
// infrastructure enables future schema evolution (v1→v2→v3) per the sequential
// walk decision in #206.
//
// @see docs/specs/dataset-compatibility-validation.md § Migration Framework

import type { DomainEvent } from '../events/schemas.js';

/**
 * A single migration step from one schema version to the next.
 *
 * Each migration is responsible for transforming events from `sourceVersion` to
 * `targetVersion`. Migrations are composable: to migrate v1→v3, the orchestrator
 * runs v1→v2, then v2→v3 sequentially (per #206 binding decision).
 *
 * @see docs/specs/dataset-compatibility-validation.md § Migration Orchestrator Interface
 */
export interface Migration {
  /**
   * Source schema version (e.g., 1).
   */
  sourceVersion: number;

  /**
   * Target schema version (e.g., 2).
   */
  targetVersion: number;

  /**
   * Human-readable description of what this migration does.
   * Example: "v1 to v2: Add sortOrder to config events"
   */
  name: string;

  /**
   * Test whether this migration can be run safely on the given events.
   * Returns `{ ok: true }` if safe, or `{ ok: false; reason: string }` with an
   * actionable error message if pre-conditions are not met.
   *
   * This is called before `run()` to detect incompatible data early (e.g.,
   * missing required fields, unexpected event types) without modifying anything.
   */
  canRun(events: readonly DomainEvent[]): Promise<{ ok: boolean; reason?: string }>;

  /**
   * Perform the migration. Returns the transformed events.
   * May throw on unrecoverable error (e.g., I/O failure, assertion violation).
   *
   * The orchestrator will back up the original events.ndjson before calling this,
   * and will restore from backup on failure.
   */
  run(events: readonly DomainEvent[]): Promise<DomainEvent[]>;
}

/**
 * Result of running a migration chain (one or more migrations).
 *
 * On success: returns the backup path and a list of migration names that were
 * applied. On failure: returns an error message and optional backup path if
 * backup succeeded before the migration failure.
 *
 * @see docs/specs/dataset-compatibility-validation.md § Migration Orchestrator Interface
 */
export type MigrationResult =
  | {
      ok: true;
      /** Path to the backup file (events.ndjson.backup-{timestamp}). */
      backupPath: string;
      /** Names of migrations that were applied (e.g., ["v1 to v2", "v2 to v3"]). */
      migrationsRun: string[];
      /** Number of events transformed. */
      eventsTransformed: number;
    }
  | {
      ok: false;
      /** Actionable error message. */
      error: string;
      /** Backup path if backup succeeded before failure. */
      backupPath?: string;
    };

/**
 * Registry of migrations keyed by "sourceVersion -> targetVersion".
 * Example key: "1->2" for a v1→v2 migration.
 *
 * The orchestrator uses this to walk the migration chain sequentially.
 */
export type MigrationRegistry = Map<string, Migration>;
