// WI-23 load-replay smoke check — guards against schema migration regressions.
//
// Motivation (from Neo's review on PR #26):
//   scripts/perf-seed.mjs was emitting legacy `account.created` envelopes
//   post-WI-23 unification. The boot-guard would have refused them with
//   LEGACY_EVENT_TYPE_REJECTED on first app launch — but the perf gate
//   only ran on main, not PR branches, so CI missed it.
//
// Strategy:
//   1. Generate a seed via `npm run perf:seed` (small N for speed).
//   2. Load the events.ndjson through JsonFileEventLog.load() (same path
//      the app takes at bootstrap).
//   3. If the boot-guard rejects any event, fail the test.
//   4. If load() succeeds but returned 0 events, fail (sanity check).
//
// Runs on every PR branch as part of `npm test` so future schema migrations
// fail the PR gate, not main.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { JsonFileEventLog, LEGACY_EVENT_TYPE_REJECTED } from './JsonFileEventLog.js';

describe('Event log load-replay smoke', () => {
  let tempDir: string;
  let eventsFile: string;

  beforeAll(async () => {
    // Create a temp dir for the seed output (don't use /tmp directly per instructions)
    tempDir = join(process.cwd(), '.test-seed-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });
    eventsFile = join(tempDir, 'events.ndjson');

    // Run perf:seed with a small count (100 tx events is plenty for boot-guard validation)
    execSync(`npm run perf:seed -- --count=100 --out="${eventsFile}"`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  });

  afterAll(async () => {
    // Clean up temp dir
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should load seeded events.ndjson without boot-guard rejection', async () => {
    const log = new JsonFileEventLog({ dir: tempDir });

    let events;
    try {
      events = await log.load();
    } catch (err: unknown) {
      // If the boot-guard rejected a legacy event type, fail with a clear message
      if (err instanceof Error && 'code' in err && err.code === LEGACY_EVENT_TYPE_REJECTED) {
        throw new Error(
          `Boot-guard rejected legacy event type: ${err.message}\n` +
            'This means scripts/perf-seed.mjs is emitting events that violate the WI-23 ' +
            'unified schema. Fix the seeder to emit AccountCreated / CategoryCreated / TagCreated ' +
            'with required sortOrder fields.',
        );
      }
      // Re-throw any other error
      throw err;
    }

    // Sanity check: seed should have produced events
    expect(events.length).toBeGreaterThan(0);

    // Expected minimum: 5 accounts + 8 categories + 24 subcategories + 6 tags + 100 tx = 143
    expect(events.length).toBeGreaterThanOrEqual(143);
  });

  it('should validate that all AccountCreated events have sortOrder', async () => {
    const log = new JsonFileEventLog({ dir: tempDir });
    const events = await log.load();

    const accountEvents = events.filter((e) => e.type === 'AccountCreated');
    expect(accountEvents.length).toBeGreaterThan(0);

    for (const evt of accountEvents) {
      expect(evt).toHaveProperty('sortOrder');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (evt as any).sortOrder).toBe('number');
    }
  });

  it('should validate that all CategoryCreated events have sortOrder', async () => {
    const log = new JsonFileEventLog({ dir: tempDir });
    const events = await log.load();

    const categoryEvents = events.filter((e) => e.type === 'CategoryCreated');
    expect(categoryEvents.length).toBeGreaterThan(0);

    for (const evt of categoryEvents) {
      expect(evt).toHaveProperty('sortOrder');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (evt as any).sortOrder).toBe('number');
    }
  });

  it('should validate that all TagCreated events have sortOrder', async () => {
    const log = new JsonFileEventLog({ dir: tempDir });
    const events = await log.load();

    const tagEvents = events.filter((e) => e.type === 'TagCreated');
    expect(tagEvents.length).toBeGreaterThan(0);

    for (const evt of tagEvents) {
      expect(evt).toHaveProperty('sortOrder');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (evt as any).sortOrder).toBe('number');
    }
  });

  it('should reject events with legacy type names', async () => {
    // Create a log with a legacy event and verify it's rejected
    const legacyDir = join(process.cwd(), '.test-legacy-' + Date.now());
    await fs.mkdir(legacyDir, { recursive: true });

    const legacyEventsFile = join(legacyDir, 'events.ndjson');
    const legacyEvent = {
      id: '01234567890123456789012345',
      type: 'account.created',
      datasetId: '01234567890123456789012345',
      actorDeviceId: '01234567890123456789012345',
      createdAt: new Date().toISOString(),
      dekVersion: 0,
      version: 1,
      payload: {
        id: '01234567890123456789012345',
        bankName: 'Test Bank',
        accountLabel: 'Test',
        sortOrder: 0,
      },
    };

    await fs.writeFile(legacyEventsFile, JSON.stringify(legacyEvent) + '\n', 'utf8');

    const log = new JsonFileEventLog({ dir: legacyDir });

    await expect(log.load()).rejects.toThrow(/account\.created/);

    // Clean up
    await fs.rm(legacyDir, { recursive: true, force: true });
  });

  it('should load and backfill pre-WI-23 legacy fixtures (events without sortOrder)', async () => {
    // This test guards against the regression Pedro hit: his on-disk event log
    // had events written before WI-23 added the sortOrder requirement. The
    // boot-guard rejected them with LEGACY_EVENT_TYPE_REJECTED-style failures.
    // Morpheus is adding a legacy backfill to JsonFileEventLog.load() to
    // populate missing sortOrder fields at load time. This test validates that
    // backfill works correctly.

    const legacyFixtureDir = join(process.cwd(), '.test-legacy-fixture-' + Date.now());
    await fs.mkdir(legacyFixtureDir, { recursive: true });

    const fixtureFile = join(legacyFixtureDir, 'events.ndjson');

    // Hand-crafted legacy events: pre-WI-23 shape WITHOUT sortOrder.
    // These represent the on-disk state before the WI-23 migration.
    // They match the configAccountCreatedEventSchema / configCategoryCreatedEventSchema /
    // configTagCreatedEventSchema flat shapes, but with sortOrder missing.
    const legacyEvents = [
      {
        type: 'AccountCreated',
        id: '01234567890123456789acc001',
        name: 'Legacy Bank A - Checking',
        bankName: 'Legacy Bank A',
        label: 'Checking',
        currency: 'EUR',
        openingBalance: 1000.0,
        createdAt: '2025-01-15T10:00:00.000Z',
        // NO sortOrder — pre-WI-23 shape
      },
      {
        type: 'AccountCreated',
        id: '01234567890123456789acc002',
        name: 'Legacy Bank B - Savings',
        bankName: 'Legacy Bank B',
        label: 'Savings',
        currency: 'EUR',
        openingBalance: 5000.0,
        createdAt: '2025-01-15T10:01:00.000Z',
        // NO sortOrder
      },
      {
        type: 'CategoryCreated',
        id: '01234567890123456789cat001',
        name: 'Legacy Income',
        kind: 'income',
        createdAt: '2025-01-15T10:02:00.000Z',
        // NO sortOrder
      },
      {
        type: 'TagCreated',
        id: '01234567890123456789tag001',
        name: 'Legacy Tag',
        createdAt: '2025-01-15T10:03:00.000Z',
        // NO sortOrder
      },
    ];

    // Write the legacy fixture to disk
    await fs.writeFile(
      fixtureFile,
      legacyEvents.map((e) => JSON.stringify(e)).join('\n') + '\n',
      'utf8',
    );

    const log = new JsonFileEventLog({ dir: legacyFixtureDir });

    let events;
    try {
      events = await log.load();
    } catch (err: unknown) {
      // Unexpected failure - the schema has sortOrder as optional, so validation
      // should pass. If we get here, something else is broken.
      throw new Error(
        `Unexpected error loading legacy fixture: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Validate that all events were loaded
    expect(events.length).toBe(4);

    // NOW: this is the critical assertion. On current main (before Morpheus's fix),
    // the events will NOT have sortOrder because there's no backfill logic yet.
    // Once Morpheus's backfill lands, sortOrder will be populated at load time.
    //
    // This test WILL FAIL on current main, proving the gap exists.

    const accountEvents = events.filter((e) => e.type === 'AccountCreated');
    expect(accountEvents.length).toBe(2);
    for (const evt of accountEvents) {
      expect(evt).toHaveProperty('sortOrder');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (evt as any).sortOrder).toBe('number');
    }

    const categoryEvents = events.filter((e) => e.type === 'CategoryCreated');
    expect(categoryEvents.length).toBe(1);
    for (const evt of categoryEvents) {
      expect(evt).toHaveProperty('sortOrder');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (evt as any).sortOrder).toBe('number');
    }

    const tagEvents = events.filter((e) => e.type === 'TagCreated');
    expect(tagEvents.length).toBe(1);
    for (const evt of tagEvents) {
      expect(evt).toHaveProperty('sortOrder');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(typeof (evt as any).sortOrder).toBe('number');
    }

    // Clean up
    await fs.rm(legacyFixtureDir, { recursive: true, force: true });
  });

  it('should reject old enveloped shape (nested payload) even with sortOrder', async () => {
    // This test validates that the OLD enveloped shape (e.g.,
    // { type: 'account.created', payload: { ... } }) is still rejected,
    // even if someone tries to sneak it back in with a sortOrder field.
    // The boot-guard contract is: legacy dotted type names are refused,
    // regardless of other fields.

    const envelopedDir = join(process.cwd(), '.test-enveloped-' + Date.now());
    await fs.mkdir(envelopedDir, { recursive: true });

    const envelopedFile = join(envelopedDir, 'events.ndjson');
    const envelopedEvent = {
      id: '01234567890123456789012399',
      type: 'account.created', // OLD dotted name
      datasetId: '01234567890123456789012345',
      actorDeviceId: '01234567890123456789012345',
      createdAt: new Date().toISOString(),
      dekVersion: 0,
      version: 1,
      sortOrder: 0, // Even WITH sortOrder...
      payload: {
        // ...nested payload should still be rejected
        id: '01234567890123456789acc999',
        bankName: 'Enveloped Bank',
        accountLabel: 'Checking',
      },
    };

    await fs.writeFile(envelopedFile, JSON.stringify(envelopedEvent) + '\n', 'utf8');

    const log = new JsonFileEventLog({ dir: envelopedDir });

    // Should reject because type is 'account.created', not 'AccountCreated'
    await expect(log.load()).rejects.toThrow(/account\.created/);

    // Clean up
    await fs.rm(envelopedDir, { recursive: true, force: true });
  });
});
