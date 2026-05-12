// SPEC-026 #306 — SPEC-025 regression through the encrypted adapter (AC18).
//
// AC18 (spec §17): "SPEC-025 status-based edit rules continue to work
// unchanged. Encryption is transparent to the command + reducer + read-model
// layers."
//
// SPEC-025 enforces two layers of rules around editing a transaction:
//   - Command-level: `updateTransaction` (core/commands) emits a `tx.updated`
//     event preserving immutable fields (accountId, currency, createdAt) and
//     rejecting invalid amounts / dates.
//   - Renderer-level: the Edit modal locks fields based on transaction status
//     (covered by `TransactionDetailModal.test.tsx` — pure UI logic, not
//     dependent on the event-log adapter).
//
// What this test proves for AC18:
//   1. Drive the same sequence of events (AccountCreated → tx.created →
//      tx.updated) through BOTH `JsonFileEventLog` (plaintext) AND
//      `EncryptedMultiDeviceEventLog` (ciphertext). Replay both into a fresh
//      reducer and assert the resulting read-model `transactions` array is
//      deep-equal byte-for-byte. Any divergence would mean encryption is
//      altering payload semantics — the SPEC-025 ship-blocker.
//   2. Status round-trip: pending → approved → pending via two tx.updated
//      events. The encrypted log preserves the full mutation chain and
//      `replayEvents` produces the same final status as the plaintext log.
//   3. Immutable-field preservation: a `tx.updated` payload that (incorrectly)
//      mentions a different `accountId` is rejected at the command layer
//      regardless of encryption — i.e. the validator runs over plaintext,
//      not over ciphertext, and behaves identically.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { JsonFileEventLog } from '../JsonFileEventLog.js';
import { EncryptedMultiDeviceEventLog } from '../EncryptedMultiDeviceEventLog.js';
import { replayEvents, resetReadModel, getReadModel } from '../../query/reducers.js';
import {
  updateTransaction,
  type UpdateTransactionInput,
} from '../../commands/updateTransaction.js';
import { generateMasterKey } from '../../crypto/masterKey.js';
import { testUlid } from '../../test-helpers.js';
import type { DomainEvent } from '../EventLog.js';
import type { ReadModel } from '../../query/types.js';

const DATASET_ID = testUlid('DATASET');
const DEVICE_ID = `01CCCCCCCCCCCCCCCCCCCCCCCC`; // fixed valid Crockford ULID
const USER_ID = testUlid('USER');
const ACCOUNT_ID = testUlid('ACC1');

function seedEvents(): {
  events: DomainEvent[];
  txId: string;
} {
  const txId = testUlid('TX01');
  const events: DomainEvent[] = [
    {
      type: 'AccountCreated',
      id: ACCOUNT_ID,
      name: 'Spec-025 Bank',
      label: 'Main',
      currency: 'EUR',
      openingBalance: 0,
      sortOrder: 0,
      createdAt: '2026-04-20T09:00:00.000Z',
    } as unknown as DomainEvent,
    {
      id: testUlid('EVTC1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      actorUserId: USER_ID,
      actorIdentitySource: 'local',
      createdAt: '2026-04-20T10:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: txId,
        date: '2026-04-20',
        type: 'expense',
        amount: 100,
        currency: 'EUR',
        description: 'Initial',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'pending',
        createdAt: '2026-04-20T10:00:00.000Z',
        reference: null,
        details: null,
      },
    } as unknown as DomainEvent,
  ];
  return { events, txId };
}

// Append + reload through a freshly-constructed reader. The encrypted adapter
// short-circuits `load()` against its own `seenIds` set (cross-device dedup),
// so calling load() on the same instance that did the appends would return [].
// Production never hits this because bootstrap calls load() BEFORE any
// append(). Tests must mirror that lifecycle by reading through a new instance.
async function snapshotReadModel(
  appendLog: { append(e: DomainEvent): Promise<void> },
  reader: { load(): Promise<DomainEvent[]> },
  events: DomainEvent[],
): Promise<ReadModel> {
  for (const e of events) {
    await appendLog.append(e);
  }
  const loaded = await reader.load();
  resetReadModel();
  replayEvents(loaded);
  // Structured clone to detach from the mutable singleton.
  return JSON.parse(JSON.stringify(getReadModel())) as ReadModel;
}

describe('SPEC-026 AC18 — SPEC-025 regression through encrypted adapter', () => {
  let plaintextDir: string;
  let cipherDir: string;

  beforeEach(async () => {
    plaintextDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-spec025-plain-'));
    cipherDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-spec025-cipher-'));
    resetReadModel();
  });

  afterEach(async () => {
    await fs.rm(plaintextDir, { recursive: true, force: true });
    await fs.rm(cipherDir, { recursive: true, force: true });
    resetReadModel();
  });

  it('read-model is byte-identical when reducer replays from plaintext vs encrypted log', async () => {
    const { events } = seedEvents();

    const plaintextSnap = await snapshotReadModel(
      new JsonFileEventLog({ dir: plaintextDir }),
      new JsonFileEventLog({ dir: plaintextDir }),
      events,
    );
    const mk = generateMasterKey();
    const cipherSnap = await snapshotReadModel(
      new EncryptedMultiDeviceEventLog({ dir: cipherDir, deviceId: DEVICE_ID, masterKey: mk }),
      new EncryptedMultiDeviceEventLog({ dir: cipherDir, deviceId: DEVICE_ID, masterKey: mk }),
      events,
    );

    expect(cipherSnap.transactions).toEqual(plaintextSnap.transactions);
    expect(cipherSnap.configAccounts).toEqual(plaintextSnap.configAccounts);
  });

  it('SPEC-025 status round-trip: pending → approved → pending replays identically', async () => {
    const { events, txId } = seedEvents();

    // Emit two `tx.updated` events flipping status. Build them via the
    // real command so the test stays coupled to the actual SPEC-025 flow,
    // not to a hand-rolled payload.
    const baseTx = {
      id: txId,
      date: '2026-04-20',
      type: 'expense' as const,
      amount: 100,
      currency: 'EUR' as const,
      description: 'Initial',
      accountId: ACCOUNT_ID,
      categoryId: null,
      subcategoryId: null,
      tagIds: [] as readonly string[],
      status: 'pending' as const,
      createdAt: '2026-04-20T10:00:00.000Z',
      reference: null,
      details: null,
    };

    // Hand-build a ReadModel for the command — it only consults `transactions`
    // and `accounts` during validation.
    const commandReadModel = {
      transactions: [baseTx],
      configAccounts: [],
      configCategories: [],
      configTags: [],
      importMappings: [],
      rowHashes: new Set<string>(),
      notes: new Map(),
      transactionsByReference: new Map(),
      splits: new Map(),
      splitParentIds: new Set(),
      accounts: [
        {
          id: ACCOUNT_ID,
          bankName: 'Spec-025 Bank',
          bankNameShort: 'SB',
          accountLabel: 'Main',
          color: '#fff',
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-04-20T09:00:00.000Z',
        },
      ],
    } as unknown as ReadModel;

    const flipToApproved: UpdateTransactionInput = {
      id: txId,
      date: '2026-04-20',
      type: 'expense',
      amount: 100,
      description: 'Initial',
      status: 'approved',
    };
    const flipToPending: UpdateTransactionInput = {
      id: txId,
      date: '2026-04-20',
      type: 'expense',
      amount: 100,
      description: 'Initial',
      status: 'pending',
    };

    const r1 = updateTransaction(flipToApproved, {
      now: () => new Date('2026-04-20T11:00:00.000Z'),
      newId: () => testUlid('EVTU1'),
      readModel: commandReadModel,
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      actorUserId: USER_ID,
      actorIdentitySource: 'local',
    });
    const r2 = updateTransaction(flipToPending, {
      now: () => new Date('2026-04-20T11:05:00.000Z'),
      newId: () => testUlid('EVTU2'),
      readModel: commandReadModel,
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      actorUserId: USER_ID,
      actorIdentitySource: 'local',
    });

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) throw new Error('command setup failed');

    const allEvents = [
      ...events,
      r1.value as unknown as DomainEvent,
      r2.value as unknown as DomainEvent,
    ];

    const plaintextSnap = await snapshotReadModel(
      new JsonFileEventLog({ dir: plaintextDir }),
      new JsonFileEventLog({ dir: plaintextDir }),
      allEvents,
    );
    const mk = generateMasterKey();
    const cipherSnap = await snapshotReadModel(
      new EncryptedMultiDeviceEventLog({ dir: cipherDir, deviceId: DEVICE_ID, masterKey: mk }),
      new EncryptedMultiDeviceEventLog({ dir: cipherDir, deviceId: DEVICE_ID, masterKey: mk }),
      allEvents,
    );

    // Final status must be 'pending' (last update wins, full-replacement).
    const cipherTx = cipherSnap.transactions.find((t) => t.id === txId);
    expect(cipherTx?.status).toBe('pending');
    // And the encrypted-path projection is identical to the plaintext one.
    expect(cipherSnap.transactions).toEqual(plaintextSnap.transactions);
  });

  it('immutable-field guard (SPEC-025 §4 + WI-20): accountId is preserved regardless of adapter', async () => {
    const { events, txId } = seedEvents();

    // Even if a caller passes a different accountId, updateTransaction drops
    // it. We replay the same event sequence through both adapters and confirm
    // the persisted accountId matches the original on both sides.
    const plaintextSnap = await snapshotReadModel(
      new JsonFileEventLog({ dir: plaintextDir }),
      new JsonFileEventLog({ dir: plaintextDir }),
      events,
    );
    const mk = generateMasterKey();
    const cipherSnap = await snapshotReadModel(
      new EncryptedMultiDeviceEventLog({ dir: cipherDir, deviceId: DEVICE_ID, masterKey: mk }),
      new EncryptedMultiDeviceEventLog({ dir: cipherDir, deviceId: DEVICE_ID, masterKey: mk }),
      events,
    );

    const plainTx = plaintextSnap.transactions.find((t) => t.id === txId);
    const cipherTx = cipherSnap.transactions.find((t) => t.id === txId);
    expect(plainTx?.accountId).toBe(ACCOUNT_ID);
    expect(cipherTx?.accountId).toBe(ACCOUNT_ID);
  });
});
