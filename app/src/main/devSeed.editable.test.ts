// Regression for the dev-seed `createdAt` seconds-overflow bug (Pedro's live
// "Invalid datetime" crash when editing a seeded transaction).
//
// Root cause: `txCreatedAt` used to encode a global per-row ordinal into the
// SECONDS field (`...T12:00:${ordinal}.000Z`). Once the merged dogfood seed
// grew past 60 rows the ordinal overflowed 59, producing invalid ISO strings
// like `2026-04-29T12:00:159.000Z`. The read model preserved that value
// (tx.created -> existing.createdAt), `updateTransaction` copied it into
// `payload.createdAt`, and the IPC response gate
// (`updateTransactionResponseSchema`, which validates createdAt with
// `z.string().datetime()`) rejected it -> the edit could never be saved.
//
// These tests fold the real dogfood seed through the real reducer and the real
// updateTransaction command, then validate against the exact Zod schemas the
// IPC layer uses — so the regression cannot silently return.

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { applyEvent, getReadModel, resetReadModel } from '../core/query/reducers';
import { updateTransaction } from '../core/commands/updateTransaction';
import type { DomainEvent } from '../core/events/schemas';
import { updateTransactionResponseSchema } from '../shared/ipc-contracts/transaction';
import { buildDevSeedEvents } from './devSeed';

const TEST_DEPS = {
  datasetId: '01TESTDATASETID'.padEnd(26, '0'),
  actorDeviceId: '01TESTDEVICEID'.padEnd(26, '0'),
  actorUserId: '01TESTUSERID'.padEnd(26, '0'),
} as const;

const iso = z.string().datetime();

function seedAndReplay(): void {
  resetReadModel();
  const events: readonly DomainEvent[] = buildDevSeedEvents(TEST_DEPS);
  for (const e of events) applyEvent(e);
}

describe('dev-seed transactions are editable (createdAt is valid ISO)', () => {
  beforeEach(() => {
    resetReadModel();
  });

  it('every seeded transaction has a valid ISO 8601 createdAt', () => {
    seedAndReplay();
    const model = getReadModel();
    expect(model.transactions.length).toBeGreaterThan(60); // overflow only bites past row 60

    for (const tx of model.transactions) {
      expect(
        iso.safeParse(tx.createdAt).success,
        `transaction ${tx.id} has invalid createdAt=${tx.createdAt}`,
      ).toBe(true);
    }
  });

  it('updating any seeded transaction yields a response that passes the IPC schema', () => {
    seedAndReplay();
    const model = getReadModel();

    // Exercise the edit path on the highest-ordinal rows — those are the ones
    // whose createdAt seconds field used to overflow past 59.
    const sample = model.transactions.slice(-5);
    expect(sample.length).toBeGreaterThan(0);

    let updateCounter = 0;
    for (const tx of sample) {
      const result = updateTransaction(
        {
          id: tx.id,
          date: tx.date,
          type: tx.type,
          amount: tx.amount,
          description: `${tx.description} (edited)`,
          categoryId: tx.categoryId,
          subcategoryId: tx.subcategoryId,
          tagIds: tx.tagIds,
          status: tx.status,
        },
        {
          now: () => new Date('2026-06-07T10:00:00.000Z'),
          newId: () => `01EDITEVENT${String(updateCounter++).padStart(15, '0')}`,
          readModel: model,
          datasetId: TEST_DEPS.datasetId,
          actorDeviceId: TEST_DEPS.actorDeviceId,
          actorUserId: TEST_DEPS.actorUserId,
          actorIdentitySource: 'local',
          dekVersion: 0,
        },
      );

      expect(result.ok, `update failed for ${tx.id}`).toBe(true);
      if (!result.ok) continue;

      // The preserved original createdAt must be valid ISO...
      expect(iso.safeParse(result.value.payload.createdAt).success).toBe(true);

      // ...and the response the IPC handler would return must pass the same
      // Zod gate that rejected the corrupt value in production. The handler
      // returns `{ ok: true, event: result.value }` verbatim.
      const response = { ok: true as const, event: result.value };
      expect(() => updateTransactionResponseSchema.parse(response)).not.toThrow();
    }
  });
});
