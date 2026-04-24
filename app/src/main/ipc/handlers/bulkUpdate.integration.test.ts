// WI-31c — Integration coverage for bulk classify.
//
// Exercises the full main-process loop end-to-end: a real `JsonFileEventLog`
// over an `os.tmpdir()` directory, seeded through `applyEvent`, driving the
// real `transaction:bulkUpdate` IPC handler, then asserting:
//
//   1. Event-log file growth (exactly N new `tx.updated` lines for N ids).
//   2. Correlation-id grouping (all emitted events share one ULID).
//   3. Read-model re-built from disk (fresh reducer hydrated from a brand-new
//      log instance) reflects the new labels on the updated rows only.
//   4. Panel queries (`getAccountBalances` / `queryRecentTransactions`) return
//      the new category/subcategory on the updated rows.
//   5. Negative path: any unknown id ⇒ zero new events persisted and
//      `{ ok: false, failures: [...] }` — all-or-nothing semantics end-to-end.
//
// Determinism / hygiene (WI-31c):
//   - Temp paths live under `os.tmpdir()` and are removed in `afterEach`.
//   - No test writes to `%APPDATA%` or the repo working tree.
//   - All ULIDs come from a deterministic `newId` seam (no crypto).
//
// This complements the existing in-memory unit tests in `transaction.test.ts`
// (WI-31a) — those prove command-level correctness; this file proves the
// behaviours neither unit suite can prove on its own (I/O, rehydration,
// cross-layer invariants).

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { JsonFileEventLog } from '../../../core/eventLog/JsonFileEventLog';
import type { DomainEvent } from '../../../core/eventLog/EventLog';
import {
  applyEvent,
  getReadModel,
  replayEvents,
  resetReadModel,
} from '../../../core/query/reducers';
import { getAccountBalances, queryRecentTransactions } from '../../../core/query/queries';
import { createTransactionBulkUpdateHandler } from './transaction';

// ---------------------------------------------------------------------------
// Deterministic id helpers — a 26-char Crockford-base32 string. The shared
// `ulid()` helper in `transaction.test.ts` is file-local, so we inline the
// same primitive here to keep the integration test self-contained.
// ---------------------------------------------------------------------------
const ULID_LEN = 26;
function ulid(suffix: string): string {
  // Uppercase + pad with '0' (valid Crockford digit) to reach the 26-char
  // length required by the event-envelope schema.
  const upper = suffix.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, '0');
  return (upper + '0'.repeat(ULID_LEN)).slice(0, ULID_LEN);
}

const DATASET_ID = ulid('DATA');
const DEVICE_ID = ulid('DEV1');

const ACCOUNT_ID = ulid('ACC1');
const CAT1_ID = ulid('CAT1'); // target category for the bulk update
const CAT2_ID = ulid('CAT2'); // untouched, exists for realism
const SUB1_ID = ulid('SUB1'); // target subcategory for the bulk update
const SUB2_ID = ulid('SUB2');

const TX_IDS = [
  ulid('TX01'),
  ulid('TX02'),
  ulid('TX03'),
  ulid('TX04'),
  ulid('TX05'),
] as const;

// ---------------------------------------------------------------------------
// Seed — 1 account + 2 categories + 2 subcategories + 5 transactions.
// All events are appended to the real `JsonFileEventLog` so they survive a
// round-trip through disk; `applyEvent` is then used to hydrate the reducer
// (same contract the main-process bootstrap uses).
// ---------------------------------------------------------------------------
function buildSeedEvents(): DomainEvent[] {
  const events: DomainEvent[] = [];

  events.push({
    id: ulid('EVACC'),
    type: 'account.created',
    datasetId: DATASET_ID,
    actorDeviceId: DEVICE_ID,
    createdAt: '2026-04-20T09:00:00.000Z',
    dekVersion: 0,
    version: 1,
    payload: {
      id: ACCOUNT_ID,
      bankName: 'Integration Bank',
      bankNameShort: 'IB',
      accountLabel: 'Main',
      color: null,
      sortOrder: 0,
      isActive: true,
      createdAt: '2026-04-20T09:00:00.000Z',
    },
  } as DomainEvent);

  // Config categories use the WI-15-lite flat envelope (see `devSeed.ts`).
  events.push({
    type: 'CategoryCreated',
    id: CAT1_ID,
    name: 'Payroll',
    kind: 'expense',
    createdAt: '2026-04-20T09:05:00.000Z',
  } as DomainEvent);
  events.push({
    type: 'CategoryCreated',
    id: CAT2_ID,
    name: 'Donations',
    kind: 'income',
    createdAt: '2026-04-20T09:06:00.000Z',
  } as DomainEvent);
  events.push({
    type: 'SubcategoryCreated',
    id: SUB1_ID,
    parentCategoryId: CAT1_ID,
    name: 'Salary',
    createdAt: '2026-04-20T09:07:00.000Z',
  } as DomainEvent);
  events.push({
    type: 'SubcategoryCreated',
    id: SUB2_ID,
    parentCategoryId: CAT1_ID,
    name: 'Bonus',
    createdAt: '2026-04-20T09:08:00.000Z',
  } as DomainEvent);

  TX_IDS.forEach((txId, i) => {
    events.push({
      id: ulid(`EVTX${i}`),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: `2026-04-20T10:0${i}:00.000Z`,
      dekVersion: 0,
      version: 1,
      payload: {
        id: txId,
        date: `2026-04-2${i}`,
        type: i % 2 === 0 ? 'expense' : 'income',
        amount: 100 + i * 10,
        currency: 'EUR',
        description: `Transaction ${i + 1}`,
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: `2026-04-20T10:0${i}:00.000Z`,
        reference: null,
        details: null,
      },
    } as DomainEvent);
  });

  return events;
}

// ---------------------------------------------------------------------------
// tmp-dir per test — everything lives under `os.tmpdir()`, removed in
// `afterEach`. Never touches `%APPDATA%` or the repo working tree.
// ---------------------------------------------------------------------------
let tmpDir = '';

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'ot-bulk-integration-'));
}

beforeEach(async () => {
  tmpDir = await makeTmpDir();
  resetReadModel();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function seedToDisk(): Promise<JsonFileEventLog> {
  const log = new JsonFileEventLog({ dir: tmpDir });
  const events = buildSeedEvents();
  for (const event of events) {
    await log.append(event);
  }
  // Hydrate the reducer from the freshly-written events, same as bootstrap.
  const loaded = await log.load();
  replayEvents(loaded);
  return log;
}

/** Deterministic newId factory for the handler — stable across runs. */
function makeIdFactory(): () => string {
  let i = 0;
  return () => ulid(`BKEVT${i++}`);
}

// ---------------------------------------------------------------------------
// Happy path — 3 of 5 ids updated, event-log grows by exactly 3, correlation
// id is uniform, read-model re-built from disk reflects the change, and Panel
// queries return the new labels.
// ---------------------------------------------------------------------------
describe('transaction:bulkUpdate — integration (real JsonFileEventLog)', () => {
  it('appends exactly N tx.updated events sharing one correlationId, reducer rehydrates from disk with new labels on the targeted rows only', async () => {
    const eventLog = await seedToDisk();

    const seedCount = (await eventLog.load()).length;
    expect(seedCount).toBeGreaterThan(0);

    const correlationId = ulid('COR1');
    const targetIds = [TX_IDS[0], TX_IDS[2], TX_IDS[4]] as const;
    const untouchedIds = [TX_IDS[1], TX_IDS[3]] as const;

    const handle = createTransactionBulkUpdateHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-24T12:00:00.000Z'),
      newId: makeIdFactory(),
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      applyEvent,
    });

    const response = await handle({
      ids: [...targetIds],
      categoryId: CAT1_ID,
      subcategoryId: SUB1_ID,
      correlationId,
    });

    // (1) Happy response shape.
    expect(response.ok).toBe(true);
    if (!response.ok) return; // narrow for TS
    expect(response.updatedCount).toBe(targetIds.length);
    expect(response.events).toHaveLength(targetIds.length);

    // (2) Event-log file grew by exactly 3 entries — asserted against the
    // seed baseline so we would catch either an accidental no-op or an
    // accidental duplicate append.
    const afterCount = (await eventLog.load()).length;
    expect(afterCount - seedCount).toBe(targetIds.length);

    // (3) All emitted envelopes carry the same correlationId and target the
    // requested ids (order-insensitive — we just assert set equality).
    const emittedCorrelationIds = new Set(response.events.map((e) => e.payload.correlationId));
    expect(emittedCorrelationIds).toEqual(new Set([correlationId]));
    expect(new Set(response.events.map((e) => e.payload.id))).toEqual(new Set(targetIds));

    // (4) Re-build the read model from disk using a **fresh** log instance
    // and a **fresh** reducer — this proves the events were actually
    // durable (not just held in memory) and that replay over the NDJSON
    // file produces the same projection.
    resetReadModel();
    const freshLog = new JsonFileEventLog({ dir: tmpDir });
    const replayed = await freshLog.load();
    expect(replayed.length).toBe(afterCount);
    replayEvents(replayed);

    const txs = getReadModel().transactions;
    for (const id of targetIds) {
      const tx = txs.find((t) => t.id === id);
      expect(tx).toBeDefined();
      expect(tx!.categoryId).toBe(CAT1_ID);
      expect(tx!.subcategoryId).toBe(SUB1_ID);
    }
    for (const id of untouchedIds) {
      const tx = txs.find((t) => t.id === id);
      expect(tx).toBeDefined();
      expect(tx!.categoryId).toBeNull();
      expect(tx!.subcategoryId).toBeNull();
    }

    // (5) Panel queries reflect the new labels — proves reducers + queries
    // observe the update after replay, not just the main-process projection.
    const recent = queryRecentTransactions(10);
    const recentById = new Map(recent.map((t) => [t.id, t]));
    for (const id of targetIds) {
      expect(recentById.get(id)?.categoryId).toBe(CAT1_ID);
      expect(recentById.get(id)?.subcategoryId).toBe(SUB1_ID);
    }
    for (const id of untouchedIds) {
      expect(recentById.get(id)?.categoryId).toBeNull();
    }

    // `getAccountBalances` must still account for every row (amounts are
    // preserved by the command; only labels change). The totals for the
    // single seeded account should therefore equal the sum of all 5 rows.
    const balances = getAccountBalances();
    expect(balances).toHaveLength(1);
    expect(balances[0]!.accountId).toBe(ACCOUNT_ID);
    // The seed builds 5 rows with amounts 100, 110, 120, 130, 140 where
    // even indices (0,2,4) are expense and odd (1,3) are income.
    expect(balances[0]!.income).toBeCloseTo(110 + 130, 2);
    expect(balances[0]!.expense).toBeCloseTo(100 + 120 + 140, 2);
  });

  it('all-or-nothing: one unknown id ⇒ zero new events persisted and { ok: false, failures }', async () => {
    const eventLog = await seedToDisk();
    const seedCount = (await eventLog.load()).length;

    const handle = createTransactionBulkUpdateHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-24T12:00:00.000Z'),
      newId: makeIdFactory(),
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      applyEvent,
    });

    const unknownId = ulid('TXZZ');
    const response = await handle({
      ids: [TX_IDS[0], unknownId, TX_IDS[2]],
      categoryId: CAT1_ID,
      correlationId: ulid('COR2'),
    });

    expect(response.ok).toBe(false);
    if (response.ok) return; // narrow for TS
    expect(response.failures).toBeDefined();
    expect(response.failures.length).toBeGreaterThan(0);
    const fail = response.failures.find((f) => f.id === unknownId);
    expect(fail).toBeDefined();
    expect(fail!.code).toBe('TX_NOT_FOUND');

    // Log must not have grown — all-or-nothing semantics end-to-end.
    const afterCount = (await eventLog.load()).length;
    expect(afterCount).toBe(seedCount);

    // Re-build the read model from disk — the targeted rows remain
    // unlabelled, proving no partial apply sneaked past the validation.
    resetReadModel();
    const freshLog = new JsonFileEventLog({ dir: tmpDir });
    replayEvents(await freshLog.load());

    const txs = getReadModel().transactions;
    for (const id of [TX_IDS[0], TX_IDS[2]]) {
      const tx = txs.find((t) => t.id === id);
      expect(tx).toBeDefined();
      expect(tx!.categoryId).toBeNull();
      expect(tx!.subcategoryId).toBeNull();
    }
  });
});
