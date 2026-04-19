// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createCategory, listCategories } from './categoriesApi.js';
import type {
  CategoriesListResponse,
  CategoryRecord,
  CreateCategoryRequest,
  CreateCategoryResponse,
} from '../../shared/ipc-contracts/categories.js';

function stub(api: { list?: ReturnType<typeof vi.fn>; create?: ReturnType<typeof vi.fn> }): void {
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    categories: api,
  };
}

const SAMPLE: CategoryRecord = {
  id: '01JABCDEF0123456789ABCDEFG',
  name: 'Donaciones',
  color: '#6d4d8c',
  createdAt: '2026-04-19T10:00:00.000Z',
};

describe('categoriesApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('listCategories returns the payload unchanged', async () => {
    const payload: CategoriesListResponse = { categories: [SAMPLE] };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ list: fn });

    expect(await listCategories()).toEqual(payload);
  });

  it('createCategory forwards the request', async () => {
    const req: CreateCategoryRequest = { name: 'Nóminas' };
    const ok: CreateCategoryResponse = {
      ok: true,
      event: { type: 'CategoryCreated', ...SAMPLE },
    };
    const fn = vi.fn().mockResolvedValue(ok);
    stub({ create: fn });

    const result = await createCategory(req);

    expect(fn).toHaveBeenCalledWith(req);
    expect(result).toEqual(ok);
  });

  it('createCategory surfaces validation failures', async () => {
    const fail: CreateCategoryResponse = {
      ok: false,
      error: { code: 'NAME_DUPLICATE', message: 'already exists', field: 'name' },
    };
    stub({ create: vi.fn().mockResolvedValue(fail) });

    const result = await createCategory({ name: 'X' });

    if (result.ok) throw new Error('expected failure');
    expect(result.error.code).toBe('NAME_DUPLICATE');
  });

  it('createCategory forwards the color when provided', async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      event: { type: 'CategoryCreated', ...SAMPLE },
    });
    stub({ create: fn });

    await createCategory({ name: 'X', color: '#dc2626' });

    expect(fn).toHaveBeenCalledWith({ name: 'X', color: '#dc2626' });
  });
});
