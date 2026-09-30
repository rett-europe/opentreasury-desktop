import { describe, expect, it } from 'vitest';
import { timingSafeEqual } from 'node:crypto';
import {
  listTransactions,
  listCategories,
  classifyTransactions,
  updateTransactions,
  setTransactionType,
  deleteTransactions,
} from './tools.js';
import { mcpSettingsSchema } from './settings.js';
import type { ReadModel } from '../../core/query/types.js';

function model(): ReadModel {
  return {
    transactions: [
      {
        id: 'a',
        date: '2026-09-01',
        type: 'expense',
        amount: 10,
        currency: 'EUR',
        description: 'Coffee',
        accountId: 'acc1',
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'pending',
        createdAt: '2026-09-01T00:00:00Z',
        reference: null,
        details: null,
      },
      {
        id: 'b',
        date: '2026-09-02',
        type: 'income',
        amount: 20,
        currency: 'EUR',
        description: 'Grant',
        accountId: 'acc2',
        categoryId: 'cat1',
        subcategoryId: 'sub1',
        tagIds: ['tag1'],
        status: 'approved',
        createdAt: '2026-09-02T00:00:00Z',
        reference: null,
        details: null,
      },
    ],
    configAccounts: [],
    configCategories: [
      {
        id: 'cat1',
        name: 'Ops',
        color: '#fff',
        kind: 'expense',
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00Z',
        subcategories: [
          {
            id: 'sub1',
            parentCategoryId: 'cat1',
            name: 'Supplies',
            createdAt: '2026-01-01T00:00:00Z',
          },
        ],
      },
    ],
    configTags: [],
    importMappings: [],
    rowHashes: new Set(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: new Map(),
    splitParentIds: new Set(),
  };
}
function body(result: { content: readonly [{ text: string }] }) {
  return JSON.parse(result.content[0].text);
}
function deps(readModel = model()) {
  const appended: unknown[] = [];
  return {
    deps: {
      eventLog: {
        append: async (e: unknown) => void appended.push(e),
        appendBatch: async (events: readonly unknown[]) => void appended.push(...events),
        load: async () => appended as never[],
      },
      readModel,
      now: () => new Date('2026-09-29T10:00:00.000Z'),
      newId: (() => {
        let n = 0;
        return () => `01HMCPTST${String(n++).padStart(17, '0')}`;
      })(),
      datasetId: '01DATASET0000000000000000',
      actorDeviceId: '01DEVICE0000000000000000',
      actorUserId: '01USER000000000000000000',
      dekVersion: 0,
    },
    appended,
  };
}

describe('mcp read tools', () => {
  it('filters and paginates transactions', () => {
    const first = body(listTransactions(model(), { limit: 1, uncategorized: false }));
    expect(first.transactions).toHaveLength(1);
    expect(first.transactions[0].id).toBe('b');
    expect(first.nextCursor).toBeNull();
  });

  describe('mcp write tools', () => {
    it('forces status pending and writes a shared correlation id', async () => {
      const m = model();
      const { deps: d, appended } = deps(m);
      const res = body(await setTransactionType(d, { ids: ['a'], type: 'income' }));
      expect(res.updatedCount).toBe(1);
      expect(appended[0]).toMatchObject({
        actorIdentitySource: 'mcp',
        payload: { id: 'a', type: 'income', status: 'pending', correlationId: res.correlationId },
      });
    });

    it('rejects approved transactions without appending', async () => {
      const { deps: d, appended } = deps();
      const res = await classifyTransactions(d, { items: [{ id: 'b', categoryId: 'cat1' }] });
      expect(res.isError).toBe(true);
      expect(body(res).failures[0].code).toBe('TX_LOCKED');
      expect(appended).toHaveLength(0);
    });

    it('validates references before applying all-or-nothing', async () => {
      const { deps: d, appended } = deps();
      const res = await classifyTransactions(d, {
        items: [
          { id: 'a', categoryId: 'cat1', subcategoryId: 'missing' },
          { id: 'missing-tx', categoryId: 'cat1' },
        ],
      });
      expect(res.isError).toBe(true);
      expect(body(res).failures.map((f: { code: string }) => f.code)).toEqual(
        expect.arrayContaining(['INVALID_REFERENCE', 'TX_NOT_FOUND']),
      );
      expect(appended).toHaveLength(0);
    });

    it('updates details and reference, preserving other fields', async () => {
      const { deps: d, appended } = deps();
      const res = body(
        await updateTransactions(d, {
          items: [{ id: 'a', details: 'Invoice 42 — hotel Madrid', reference: 'INV-42' }],
        }),
      );
      expect(res.updatedCount).toBe(1);
      expect(appended[0]).toMatchObject({
        payload: {
          details: 'Invoice 42 — hotel Madrid',
          reference: 'INV-42',
          amount: 10,
          status: 'pending',
        },
      });
    });

    it('rejects over-sized batches', async () => {
      const { deps: d } = deps();
      await expect(
        updateTransactions(d, {
          items: Array.from({ length: 501 }, (_, i) => ({ id: `tx-${i}`, amount: 1 })),
        }),
      ).rejects.toThrow();
    });

    it('deletes only pending transactions', async () => {
      const { deps: d, appended } = deps();
      const rejected = await deleteTransactions(d, { ids: ['b'] });
      expect(rejected.isError).toBe(true);
      expect(body(rejected).failures[0].code).toBe('TX_LOCKED');
      const ok = body(await deleteTransactions(d, { ids: ['a'] }));
      expect(ok.updatedCount).toBe(1);
      expect(appended[0]).toMatchObject({
        type: 'tx.deleted',
        txId: 'a',
        actorIdentitySource: 'mcp',
      });
    });
  });
  it('validates limits', () => {
    expect(() => listTransactions(model(), { limit: 501 })).toThrow();
  });
  it('lists categories with subcategories', () => {
    expect(body(listCategories(model())).categories[0].subcategories[0].id).toBe('sub1');
  });
});

describe('mcp settings/auth primitives', () => {
  it('defaults disabled', () => {
    expect(mcpSettingsSchema.parse({}).enabled).toBe(false);
  });
  it('supports constant-time token equality inputs', () => {
    const a = Buffer.from('a'.repeat(64));
    const b = Buffer.from('a'.repeat(64));
    expect(a.length === b.length && timingSafeEqual(a, b)).toBe(true);
  });
});
