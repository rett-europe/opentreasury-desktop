// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { stageFile, dryRun, commit, getLastMapping } from './importApi.js';
import type {
  StageFileResponse,
  DryRunResponse,
  CommitImportResponse,
  LastMappingResponse,
} from '../../shared/ipc-contracts/import.js';

function stub(api: {
  stageFile?: ReturnType<typeof vi.fn>;
  dryRun?: ReturnType<typeof vi.fn>;
  commit?: ReturnType<typeof vi.fn>;
  getLastMapping?: ReturnType<typeof vi.fn>;
}): void {
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    import: api,
  };
}

describe('importApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('stageFile forwards request and returns response', async () => {
    const payload: StageFileResponse = {
      ok: true,
      fileId: 'file-123',
      sheets: [
        {
          name: 'Sheet1',
          columnHeaders: ['Date', 'Amount', 'Description'],
          rowCount: 42,
        },
      ],
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ stageFile: fn });

    const result = await stageFile({ filePath: '/test.xlsx' });

    expect(fn).toHaveBeenCalledWith({ filePath: '/test.xlsx' });
    expect(result).toEqual(payload);
  });

  it('stageFile passes errors through', async () => {
    const error: StageFileResponse = {
      ok: false,
      error: { code: 'FILE_UNREADABLE', detail: 'Corrupted file' },
    };
    const fn = vi.fn().mockResolvedValue(error);
    stub({ stageFile: fn });

    const result = await stageFile({ filePath: '/bad.csv' });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('FILE_UNREADABLE');
  });

  it('dryRun forwards request and returns success', async () => {
    const payload: DryRunResponse = {
      ok: true,
      summary: { totalRows: 10, validRows: 10, duplicateCount: 0, errorCount: 0 },
      samples: [],
      duplicates: [],
      errors: [],
      inferredDateFormat: 'DD/MM/YYYY',
      dateFormatAmbiguous: false,
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ dryRun: fn });

    const request = {
      fileId: 'file-123',
      accountId: '01JAB',
      columnMapping: { date: 'A', amount: 'B', description: 'C' },
      importDuplicates: false,
    };
    const result = await dryRun(request);

    expect(fn).toHaveBeenCalledWith(request);
    expect(result).toEqual(payload);
  });

  it('commit forwards request and returns success', async () => {
    const payload: CommitImportResponse = {
      ok: true,
      importBatchId: '01JAB123',
      importedCount: 10,
      skippedCount: 0,
      warnings: [],
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ commit: fn });

    const request = {
      fileId: 'file-123',
      accountId: '01JAB',
      columnMapping: { date: 'A', amount: 'B', description: 'C' },
      importDuplicates: false,
      confirmed: true as const,
    };
    const result = await commit(request);

    expect(fn).toHaveBeenCalledWith(request);
    expect(result).toEqual(payload);
  });

  it('getLastMapping returns null when no prior import', async () => {
    const payload: LastMappingResponse = {
      mapping: null,
      updatedAt: null,
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ getLastMapping: fn });

    const result = await getLastMapping({ accountId: '01JAB' });

    expect(fn).toHaveBeenCalledWith({ accountId: '01JAB' });
    expect(result.mapping).toBeNull();
  });

  it('getLastMapping returns stored mapping when available', async () => {
    const payload: LastMappingResponse = {
      mapping: { date: 'Fecha', amount: 'Importe', description: 'Descripción' },
      updatedAt: '2026-04-20T10:00:00.000Z',
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ getLastMapping: fn });

    const result = await getLastMapping({ accountId: '01JAB' });

    expect(result.mapping).toEqual(payload.mapping);
  });

  it('all methods reject on transport errors', async () => {
    const err = new Error('network failure');
    stub({
      stageFile: vi.fn().mockRejectedValue(err),
      dryRun: vi.fn().mockRejectedValue(err),
      commit: vi.fn().mockRejectedValue(err),
      getLastMapping: vi.fn().mockRejectedValue(err),
    });

    await expect(stageFile({ filePath: '/x' })).rejects.toThrow('network failure');
    await expect(
      dryRun({
        fileId: 'file-x',
        accountId: 'a',
        columnMapping: { date: 'A', amount: 'B', description: 'C' },
        importDuplicates: false,
      }),
    ).rejects.toThrow('network failure');
    await expect(
      commit({
        fileId: 'file-x',
        accountId: 'a',
        columnMapping: { date: 'A', amount: 'B', description: 'C' },
        importDuplicates: false,
        confirmed: true,
      }),
    ).rejects.toThrow('network failure');
    await expect(getLastMapping({ accountId: 'a' })).rejects.toThrow('network failure');
  });

  it('stageFile returns fileId that flows to subsequent operations', async () => {
    const stageResponse: StageFileResponse = {
      ok: true,
      fileId: 'file-abc-123',
      sheets: [
        {
          name: 'Sheet1',
          columnHeaders: ['Date', 'Amount', 'Description'],
          rowCount: 10,
        },
      ],
    };
    const stageFn = vi.fn().mockResolvedValue(stageResponse);
    stub({ stageFile: stageFn });

    const result = await stageFile({ filePath: '/test.xlsx' });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.fileId).toBe('file-abc-123');
    // Wizard state should store this fileId and pass it to dryRun/commit
  });
});
