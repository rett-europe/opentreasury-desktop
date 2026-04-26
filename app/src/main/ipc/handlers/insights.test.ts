import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleInsightsLandingSummary } from './insights.js';
import type { ReadModel } from '../../../core/query/types.js';
import * as reducers from '../../../core/query/reducers.js';

vi.mock('../../../core/query/reducers.js', () => ({
  getReadModel: vi.fn(),
}));

const mockGetReadModel = vi.mocked(reducers.getReadModel);

describe('handleInsightsLandingSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockModel = (overrides?: Partial<ReadModel>): ReadModel => ({
    transactions: [],
    configAccounts: [
      {
        id: 'acc-1',
        name: 'Main Account',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    configCategories: [
      {
        id: 'cat-1',
        name: 'Donations',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
        subcategories: [],
      },
      {
        id: 'cat-2',
        name: 'Events',
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00Z',
        subcategories: [],
      },
    ],
    configTags: [
      {
        id: 'tag-1',
        name: 'Campaign A',
        color: '#ff0000',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'tag-2',
        name: 'Campaign B',
        sortOrder: 1,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ],
    importMappings: [],
    rowHashes: new Set(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: new Map(),
    splitParentIds: new Set(),
    ...overrides,
  });

  describe('Date window handling', () => {
    it('defaults to current year when no window provided', async () => {
      mockGetReadModel.mockReturnValue(createMockModel());

      const result = await handleInsightsLandingSummary({});

      expect(result.windowStart).toMatch(/^\d{4}-01-01$/);
      expect(result.windowEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const currentYear = new Date().getUTCFullYear();
      expect(result.windowStart).toBe(`${currentYear}-01-01`);
    });

    it('respects custom date window', async () => {
      mockGetReadModel.mockReturnValue(createMockModel());

      const result = await handleInsightsLandingSummary({
        dateWindow: {
          startISO: '2025-06-01',
          endISO: '2025-12-31',
        },
      });

      expect(result.windowStart).toBe('2025-06-01');
      expect(result.windowEnd).toBe('2025-12-31');
    });
  });

  describe('Top-N aggregation', () => {
    it('returns top 8 tags by magnitude', async () => {
      const transactions = Array.from({ length: 10 }, (_, i) => ({
        id: `tx-${i}`,
        date: '2026-01-15',
        type: 'income' as const,
        amount: (i + 1) * 100, // tag-0: 100, tag-1: 200, ..., tag-9: 1000
        currency: 'EUR' as const,
        description: `Transaction ${i}`,
        accountId: 'acc-1',
        categoryId: 'cat-1',
        subcategoryId: null,
        tagIds: [`tag-${i}`],
        status: 'approved' as const,
        createdAt: '2026-01-15T00:00:00Z',
        reference: null,
        details: null,
      }));

      const tags = Array.from({ length: 10 }, (_, i) => ({
        id: `tag-${i}`,
        name: `Tag ${i}`,
        sortOrder: i,
        createdAt: '2026-01-01T00:00:00Z',
      }));

      mockGetReadModel.mockReturnValue(
        createMockModel({
          transactions,
          configTags: tags,
        }),
      );

      const result = await handleInsightsLandingSummary({});

      expect(result.tags).toHaveLength(8);
      // Top 8 should be tag-9 (1000), tag-8 (900), ..., tag-2 (300)
      expect(result.tags[0]?.tagId).toBe('tag-9');
      expect(result.tags[0]?.ingresosCents).toBe(100000);
      expect(result.tags[7]?.tagId).toBe('tag-2');
    });

    it('aggregates tail into Otras bucket', async () => {
      const transactions = Array.from({ length: 10 }, (_, i) => ({
        id: `tx-${i}`,
        date: '2026-01-15',
        type: 'income' as const,
        amount: (i + 1) * 100,
        currency: 'EUR' as const,
        description: `Transaction ${i}`,
        accountId: 'acc-1',
        categoryId: 'cat-1',
        subcategoryId: null,
        tagIds: [`tag-${i}`],
        status: 'approved' as const,
        createdAt: '2026-01-15T00:00:00Z',
        reference: null,
        details: null,
      }));

      const tags = Array.from({ length: 10 }, (_, i) => ({
        id: `tag-${i}`,
        name: `Tag ${i}`,
        sortOrder: i,
        createdAt: '2026-01-01T00:00:00Z',
      }));

      mockGetReadModel.mockReturnValue(
        createMockModel({
          transactions,
          configTags: tags,
        }),
      );

      const result = await handleInsightsLandingSummary({});

      expect(result.otrasBucket).not.toBeNull();
      expect(result.otrasBucket?.tagId).toBe('__otras__');
      expect(result.otrasBucket?.name).toBe('Otras');
      // Tail = tag-1 (200) + tag-0 (100) = 300
      expect(result.otrasBucket?.ingresosCents).toBe(30000);
    });

    it('returns null Otras bucket when ≤8 tags', async () => {
      const transactions = [
        {
          id: 'tx-1',
          date: '2026-01-15',
          type: 'income' as const,
          amount: 100,
          currency: 'EUR' as const,
          description: 'Test',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          subcategoryId: null,
          tagIds: ['tag-1'],
          status: 'approved' as const,
          createdAt: '2026-01-15T00:00:00Z',
          reference: null,
          details: null,
        },
      ];

      mockGetReadModel.mockReturnValue(createMockModel({ transactions }));

      const result = await handleInsightsLandingSummary({});

      expect(result.otrasBucket).toBeNull();
    });
  });

  describe('Empty data handling', () => {
    it('returns empty tags array when no transactions', async () => {
      mockGetReadModel.mockReturnValue(createMockModel());

      const result = await handleInsightsLandingSummary({});

      expect(result.tags).toEqual([]);
      expect(result.otrasBucket).toBeNull();
      expect(result.kpis.etiquetasActivasCount).toBe(0);
    });

    it('excludes tags with no transactions in window', async () => {
      const transactions = [
        {
          id: 'tx-1',
          date: '2025-01-15', // Outside window
          type: 'income' as const,
          amount: 100,
          currency: 'EUR' as const,
          description: 'Test',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          subcategoryId: null,
          tagIds: ['tag-1'],
          status: 'approved' as const,
          createdAt: '2025-01-15T00:00:00Z',
          reference: null,
          details: null,
        },
      ];

      mockGetReadModel.mockReturnValue(createMockModel({ transactions }));

      const result = await handleInsightsLandingSummary({
        dateWindow: {
          startISO: '2026-01-01',
          endISO: '2026-12-31',
        },
      });

      expect(result.tags).toEqual([]);
    });
  });

  describe('KPI calculation', () => {
    it('calculates global KPIs correctly', async () => {
      const transactions = [
        {
          id: 'tx-1',
          date: '2026-01-15',
          type: 'income' as const,
          amount: 100,
          currency: 'EUR' as const,
          description: 'Test',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          subcategoryId: null,
          tagIds: ['tag-1'],
          status: 'approved' as const,
          createdAt: '2026-01-15T00:00:00Z',
          reference: null,
          details: null,
        },
        {
          id: 'tx-2',
          date: '2026-01-20',
          type: 'expense' as const,
          amount: 50,
          currency: 'EUR' as const,
          description: 'Test',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          subcategoryId: null,
          tagIds: ['tag-2'],
          status: 'approved' as const,
          createdAt: '2026-01-20T00:00:00Z',
          reference: null,
          details: null,
        },
      ];

      mockGetReadModel.mockReturnValue(createMockModel({ transactions }));

      const result = await handleInsightsLandingSummary({
        dateWindow: { startISO: '2026-01-01', endISO: '2026-12-31' },
      });

      expect(result.kpis.etiquetasActivasCount).toBe(2);
      expect(result.kpis.etiquetasTotalesCount).toBe(2);
      expect(result.kpis.ingresosEtiquetadosCents).toBe(10000);
      expect(result.kpis.gastosEtiquetadosCents).toBe(5000);
    });

    it('excludes untagged transactions from KPIs', async () => {
      const transactions = [
        {
          id: 'tx-1',
          date: '2026-01-15',
          type: 'income' as const,
          amount: 100,
          currency: 'EUR' as const,
          description: 'Tagged',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          subcategoryId: null,
          tagIds: ['tag-1'],
          status: 'approved' as const,
          createdAt: '2026-01-15T00:00:00Z',
          reference: null,
          details: null,
        },
        {
          id: 'tx-2',
          date: '2026-01-20',
          type: 'income' as const,
          amount: 200,
          currency: 'EUR' as const,
          description: 'Untagged',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          subcategoryId: null,
          tagIds: [], // No tags
          status: 'approved' as const,
          createdAt: '2026-01-20T00:00:00Z',
          reference: null,
          details: null,
        },
      ];

      mockGetReadModel.mockReturnValue(createMockModel({ transactions }));

      const result = await handleInsightsLandingSummary({
        dateWindow: { startISO: '2026-01-01', endISO: '2026-12-31' },
      });

      expect(result.kpis.ingresosEtiquetadosCents).toBe(10000); // Only tx-1
    });
  });

  describe('Archived tags', () => {
    it('excludes archived tags from landing', async () => {
      const transactions = [
        {
          id: 'tx-1',
          date: '2026-01-15',
          type: 'income' as const,
          amount: 100,
          currency: 'EUR' as const,
          description: 'Test',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          subcategoryId: null,
          tagIds: ['tag-archived'],
          status: 'approved' as const,
          createdAt: '2026-01-15T00:00:00Z',
          reference: null,
          details: null,
        },
      ];

      const tags = [
        {
          id: 'tag-archived',
          name: 'Archived Tag',
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00Z',
          archivedAt: '2026-02-01T00:00:00Z',
        },
      ];

      mockGetReadModel.mockReturnValue(
        createMockModel({
          transactions,
          configTags: tags,
        }),
      );

      const result = await handleInsightsLandingSummary({
        dateWindow: { startISO: '2026-01-01', endISO: '2026-12-31' },
      });

      expect(result.tags).toEqual([]);
      expect(result.kpis.etiquetasTotalesCount).toBe(0);
    });
  });

  describe('Top categorías', () => {
    it('returns top 2 categories by volume for each tag', async () => {
      const transactions = [
        {
          id: 'tx-1',
          date: '2026-01-15',
          type: 'income' as const,
          amount: 100,
          currency: 'EUR' as const,
          description: 'Test',
          accountId: 'acc-1',
          categoryId: 'cat-1',
          subcategoryId: null,
          tagIds: ['tag-1'],
          status: 'approved' as const,
          createdAt: '2026-01-15T00:00:00Z',
          reference: null,
          details: null,
        },
        {
          id: 'tx-2',
          date: '2026-01-20',
          type: 'income' as const,
          amount: 200,
          currency: 'EUR' as const,
          description: 'Test',
          accountId: 'acc-1',
          categoryId: 'cat-2',
          subcategoryId: null,
          tagIds: ['tag-1'],
          status: 'approved' as const,
          createdAt: '2026-01-20T00:00:00Z',
          reference: null,
          details: null,
        },
      ];

      mockGetReadModel.mockReturnValue(createMockModel({ transactions }));

      const result = await handleInsightsLandingSummary({
        dateWindow: { startISO: '2026-01-01', endISO: '2026-12-31' },
      });

      expect(result.tags[0]?.topCategorias).toHaveLength(2);
      expect(result.tags[0]?.topCategorias[0]?.name).toBe('Events'); // Higher volume
      expect(result.tags[0]?.topCategorias[1]?.name).toBe('Donations');
    });
  });
});
