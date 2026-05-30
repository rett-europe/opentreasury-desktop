// @vitest-environment jsdom
// WI-21-followup — service-level tests for the hard-delete wrappers in
// configMutationsApi.ts. We exercise the discriminated-union unwrap +
// ConfigMutationError mapping (including the new transactionCount field),
// which is the contract the renderer relies on to branch its UI.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConfigMutationError,
  deleteAccount,
  deleteCategory,
  deleteSubcategory,
  deleteTag,
  listAccountsUsage,
  listSubcategoriesUsage,
  listTagsUsage,
} from './configMutationsApi.js';

// Helper — install a minimal `window.opentreasury` surface with just the
// methods we want to assert against. We rebuild it per-test to avoid bleed.
function installSurface(surface: Record<string, unknown>): void {
  (window as unknown as { opentreasury: unknown }).opentreasury = surface;
}

beforeEach(() => {
  installSurface({});
});

afterEach(() => {
  delete (window as unknown as { opentreasury?: unknown }).opentreasury;
});

describe('configMutationsApi — hard-delete wrappers', () => {
  it('deleteAccount resolves on ok:true', async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      event: { type: 'AccountDeleted', id: 'evt', accountId: 'A1', deletedAt: 'now' },
    });
    installSurface({ accounts: { delete: fn } });
    await expect(deleteAccount('A1')).resolves.toBeUndefined();
    expect(fn).toHaveBeenCalledWith({ id: 'A1' });
  });

  it('deleteAccount throws ConfigMutationError carrying transactionCount on HAS_REFERENCES', async () => {
    installSurface({
      accounts: {
        delete: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'HAS_REFERENCES', message: 'nope', transactionCount: 7 },
        }),
      },
    });
    try {
      await deleteAccount('A1');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigMutationError);
      const e = err as ConfigMutationError;
      expect(e.code).toBe('HAS_REFERENCES');
      expect(e.transactionCount).toBe(7);
    }
  });

  it('deleteCategory passes only { id } to the bridge', async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      event: { type: 'CategoryDeleted', id: 'evt', categoryId: 'C1', deletedAt: 'now' },
    });
    installSurface({ categories: { delete: fn } });
    await deleteCategory('C1');
    expect(fn).toHaveBeenCalledWith({ id: 'C1' });
  });

  it('deleteSubcategory rewrites parentId → parentCategoryId for the wire shape', async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      event: {
        type: 'SubcategoryDeleted',
        id: 'evt',
        subcategoryId: 'S1',
        parentCategoryId: 'C1',
        deletedAt: 'now',
      },
    });
    installSurface({ categories: { subcategory: { delete: fn } } });
    await deleteSubcategory({ id: 'S1', parentId: 'C1' });
    expect(fn).toHaveBeenCalledWith({ id: 'S1', parentCategoryId: 'C1' });
  });

  it('deleteTag throws when error code != HAS_REFERENCES (and transactionCount is undefined)', async () => {
    installSurface({
      tags: {
        delete: vi.fn().mockResolvedValue({
          ok: false,
          error: { code: 'NOT_FOUND', message: 'missing' },
        }),
      },
    });
    try {
      await deleteTag('T1');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigMutationError);
      const e = err as ConfigMutationError;
      expect(e.code).toBe('NOT_FOUND');
      expect(e.transactionCount).toBeUndefined();
    }
  });

  it('throws a helpful error when a preload method is missing from the surface', async () => {
    installSurface({}); // no accounts at all
    await expect(deleteAccount('A1')).rejects.toThrow(/accounts\.delete.*not exposed/);
  });
});

describe('configMutationsApi — usage list wrappers', () => {
  it('listAccountsUsage returns the bridge payload as-is', async () => {
    const payload = { usage: [{ accountId: 'A1', transactionCount: 3 }] };
    installSurface({ accounts: { usage: vi.fn().mockResolvedValue(payload) } });
    await expect(listAccountsUsage()).resolves.toEqual(payload);
  });

  it('listSubcategoriesUsage returns the bridge payload as-is', async () => {
    const payload = { usage: [{ subcategoryId: 'S1', transactionCount: 1 }] };
    installSurface({
      categories: { subcategory: { usage: vi.fn().mockResolvedValue(payload) } },
    });
    await expect(listSubcategoriesUsage()).resolves.toEqual(payload);
  });

  it('listTagsUsage returns the bridge payload as-is', async () => {
    const payload = { usage: [{ tagId: 'G1', transactionCount: 2 }] };
    installSurface({ tags: { usage: vi.fn().mockResolvedValue(payload) } });
    await expect(listTagsUsage()).resolves.toEqual(payload);
  });

  it('each usage helper throws a helpful error when missing on the bridge', async () => {
    installSurface({});
    await expect(listAccountsUsage()).rejects.toThrow(/accounts\.usage.*not exposed/);
    await expect(listSubcategoriesUsage()).rejects.toThrow(/subcategory\.usage.*not exposed/);
    await expect(listTagsUsage()).rejects.toThrow(/tags\.usage.*not exposed/);
  });
});
