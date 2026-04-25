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
});
