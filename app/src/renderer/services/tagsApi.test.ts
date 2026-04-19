// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createTag, listTags } from './tagsApi.js';
import type {
  CreateTagRequest,
  CreateTagResponse,
  TagRecord,
  TagsListResponse,
} from '../../shared/ipc-contracts/tags.js';

function stub(api: { list?: ReturnType<typeof vi.fn>; create?: ReturnType<typeof vi.fn> }): void {
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    tags: api,
  };
}

const SAMPLE: TagRecord = {
  id: '01JABCDEF0123456789ABCDEFG',
  name: 'COVID-19',
  createdAt: '2026-04-19T10:00:00.000Z',
};

describe('tagsApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('listTags returns the payload unchanged', async () => {
    const payload: TagsListResponse = { tags: [SAMPLE] };
    stub({ list: vi.fn().mockResolvedValue(payload) });

    expect(await listTags()).toEqual(payload);
  });

  it('createTag forwards the request', async () => {
    const req: CreateTagRequest = { name: 'Beca' };
    const ok: CreateTagResponse = {
      ok: true,
      event: { type: 'TagCreated', ...SAMPLE },
    };
    const fn = vi.fn().mockResolvedValue(ok);
    stub({ create: fn });

    const result = await createTag(req);

    expect(fn).toHaveBeenCalledWith(req);
    expect(result).toEqual(ok);
  });

  it('createTag surfaces validation failures', async () => {
    const fail: CreateTagResponse = {
      ok: false,
      error: { code: 'NAME_EMPTY', message: 'required', field: 'name' },
    };
    stub({ create: vi.fn().mockResolvedValue(fail) });

    const result = await createTag({ name: '' });

    if (result.ok) throw new Error('expected failure');
    expect(result.error.field).toBe('name');
  });

  it('createTag rejects only on transport errors', async () => {
    stub({ create: vi.fn().mockRejectedValue(new Error('nope')) });

    await expect(createTag({ name: 'X' })).rejects.toThrow('nope');
  });
});
