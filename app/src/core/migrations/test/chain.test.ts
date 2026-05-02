// Migration chain test — validates sequential walk and error handling.
//
// Tests the migration orchestrator with mock migrations to ensure:
// - Empty registry is a no-op
// - Single-hop migrations work (v1→v2)
// - Multi-hop chains work (v1→v3 walks v1→v2→v3)
// - Missing links are rejected (SCHEMA_TOO_OLD_NO_MIGRATION)
// - Pre-flight validation (`canRun()`) gates execution
//
// @see docs/specs/dataset-compatibility-validation.md § Migration Framework
// @see docs/specs/dataset-compatibility-validation.md § Backward Compatibility Testing

import { describe, it, expect, beforeEach } from 'vitest';
import { runMigrations, hasMigrationPath } from '../index.js';
import type { Migration, MigrationRegistry } from '../types.js';
import type { DomainEvent } from '../../events/schemas.js';

// Test helper: Create a minimal old-schema dataset (stub events).
// Real migrations will transform actual DomainEvent payloads; for framework
// tests we just use stub objects with a schemaVersion marker.
function makeOldSchemaEvents(schemaVersion: number, count: number): DomainEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${i.toString().padStart(26, '0')}`,
    type: 'tx.created' as const,
    version: 1,
    datasetId: 'dataset-test00000000000000',
    actorDeviceId: 'device-test000000000000000',
    actorUserId: 'user-test0000000000000000',
    actorIdentitySource: 'local' as const,
    createdAt: new Date().toISOString(),
    dekVersion: 1,
    // Marker to track which schema version this event was created with
    payload: { schemaVersion },
  })) as DomainEvent[];
}

// Test helper: Mock migration that increments the schemaVersion marker.
function makeMockMigration(from: number, to: number, shouldFail = false): Migration {
  return {
    sourceVersion: from,
    targetVersion: to,
    name: `v${from} to v${to}: Test migration`,

    async canRun(events: readonly DomainEvent[]) {
      if (shouldFail) {
        return { ok: false, reason: 'Mock failure' };
      }
      // Check that all events have the expected schema marker
      const allMatch = events.every(
        (e) => (e.payload as { schemaVersion?: number }).schemaVersion === from,
      );
      if (!allMatch) {
        return { ok: false, reason: `Not all events are schema v${from}` };
      }
      return { ok: true };
    },

    async run(events: readonly DomainEvent[]) {
      if (shouldFail) {
        throw new Error('Mock migration run failure');
      }
      // Transform events: increment schemaVersion marker while preserving other payload fields
      return events.map((e) => ({
        ...e,
        payload: { ...(e.payload as object), schemaVersion: to },
      })) as DomainEvent[];
    },
  };
}

describe('Migration orchestrator', () => {
  let registry: MigrationRegistry;

  beforeEach(() => {
    registry = new Map();
  });

  describe('Empty registry (M1 baseline)', () => {
    it('returns no-op when currentVersion === targetVersion', async () => {
      const events = makeOldSchemaEvents(1, 10);
      const result = await runMigrations(events, 1, 1, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.migrationsRun).toEqual([]);
        expect(result.eventsTransformed).toBe(0);
      }
    });

    it('rejects when currentVersion < targetVersion and no migration exists', async () => {
      const events = makeOldSchemaEvents(1, 10);
      const result = await runMigrations(events, 1, 2, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('No migration available from v1 to v2');
      }
    });

    it('hasMigrationPath returns false when registry is empty', () => {
      expect(hasMigrationPath(1, 2, registry)).toBe(false);
      expect(hasMigrationPath(1, 3, registry)).toBe(false);
    });

    it('hasMigrationPath returns true when currentVersion >= targetVersion', () => {
      expect(hasMigrationPath(2, 2, registry)).toBe(true);
      expect(hasMigrationPath(3, 2, registry)).toBe(true);
    });
  });

  describe('Single-hop migration (v1→v2)', () => {
    beforeEach(() => {
      registry.set('1->2', makeMockMigration(1, 2));
    });

    it('runs single migration successfully', async () => {
      const events = makeOldSchemaEvents(1, 5);
      const result = await runMigrations(events, 1, 2, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.migrationsRun).toEqual(['v1 to v2: Test migration']);
        expect(result.eventsTransformed).toBe(5);
      }
    });

    it('hasMigrationPath returns true for v1→v2', () => {
      expect(hasMigrationPath(1, 2, registry)).toBe(true);
    });

    it('hasMigrationPath returns false for v1→v3 (missing v2→v3)', () => {
      expect(hasMigrationPath(1, 3, registry)).toBe(false);
    });
  });

  describe('Multi-hop chain (v1→v3 walks v1→v2→v3)', () => {
    beforeEach(() => {
      registry.set('1->2', makeMockMigration(1, 2));
      registry.set('2->3', makeMockMigration(2, 3));
    });

    it('runs migration chain sequentially', async () => {
      const events = makeOldSchemaEvents(1, 3);
      const result = await runMigrations(events, 1, 3, registry);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.migrationsRun).toEqual([
          'v1 to v2: Test migration',
          'v2 to v3: Test migration',
        ]);
        expect(result.eventsTransformed).toBe(3);
      }
    });

    it('hasMigrationPath returns true for v1→v3', () => {
      expect(hasMigrationPath(1, 3, registry)).toBe(true);
    });

    it('rejects if intermediate link is missing (v1→v4 missing v3→v4)', async () => {
      const events = makeOldSchemaEvents(1, 3);
      const result = await runMigrations(events, 1, 4, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('No migration available from v3 to v4');
      }
    });
  });

  describe('Pre-flight validation (canRun)', () => {
    beforeEach(() => {
      registry.set('1->2', makeMockMigration(1, 2, true)); // shouldFail = true
    });

    it('rejects migration if canRun returns { ok: false }', async () => {
      const events = makeOldSchemaEvents(1, 3);
      const result = await runMigrations(events, 1, 2, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('cannot run: Mock failure');
      }
    });
  });

  describe('Migration run failure', () => {
    it('returns error if migration throws during run()', async () => {
      const failingMigration = makeMockMigration(1, 2, true);
      registry.set('1->2', failingMigration);

      const events = makeOldSchemaEvents(1, 3);
      // Override canRun to succeed but run() will throw
      failingMigration.canRun = async () => ({ ok: true });

      const result = await runMigrations(events, 1, 2, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('failed: Mock migration run failure');
      }
    });
  });

  describe('Schema too new', () => {
    it('rejects when currentVersion > targetVersion', async () => {
      const events = makeOldSchemaEvents(3, 5);
      const result = await runMigrations(events, 3, 1, registry);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('newer than target');
      }
    });
  });

  describe('Test matrix template scenarios', () => {
    // These tests document the scenarios that will be relevant when actual
    // migrations exist (v1→v2, v2→v3, etc.). For M1 they all use mock migrations.

    describe('Old app + new schema (backward compat)', () => {
      it('older app rejects folder with schemaVersion > app.CURRENT', async () => {
        // Simulate: folder has v3 schema, app supports only v1
        const events = makeOldSchemaEvents(3, 5);
        const result = await runMigrations(events, 3, 1, registry);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toContain('newer than target');
        }
      });
    });

    describe('New app + old schema (forward compat)', () => {
      beforeEach(() => {
        registry.set('1->2', makeMockMigration(1, 2));
        registry.set('2->3', makeMockMigration(2, 3));
      });

      it('newer app can migrate folder from v1 to v3', async () => {
        const events = makeOldSchemaEvents(1, 5);
        const result = await runMigrations(events, 1, 3, registry);

        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.migrationsRun).toHaveLength(2);
        }
      });

      it('newer app detects migration path availability', () => {
        expect(hasMigrationPath(1, 3, registry)).toBe(true);
      });
    });

    describe('Migration correctness (event transformation)', () => {
      beforeEach(() => {
        registry.set('1->2', makeMockMigration(1, 2));
      });

      it('transforms events correctly (schemaVersion marker updated)', async () => {
        const events = makeOldSchemaEvents(1, 3);
        const result = await runMigrations(events, 1, 2, registry);

        expect(result.ok).toBe(true);
        if (result.ok) {
          // Note: In real migrations, we'd validate actual payload transformations.
          // This test just checks the framework plumbing.
          expect(result.eventsTransformed).toBe(3);
        }
      });
    });
  });
});
