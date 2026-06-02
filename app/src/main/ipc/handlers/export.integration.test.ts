// SPEC-027 — Export IPC handler integration test (Cypher).
//
// Drives prepare→run end-to-end with injected deps over a temp filesystem and a
// real in-memory FileAuditLog: happy path (CSV + xlsx written), mandatory-filter
// gate, encrypted-workspace hard-block, token replay/wrong-window, audit-first
// ordering, and rate-limit/lockout. Electron is mocked — the handler's
// path/dialog/audit seams are all injected.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  dialog: { showSaveDialog: vi.fn() },
  shell: { showItemInFolder: vi.fn() },
  BrowserWindow: { fromWebContents: () => null },
}));

import { createExportHandlers, type ExportHandlerDeps } from './export.js';
import { _resetPendingExports } from '../../services/exportGate.js';
import { FileAuditLog, type AuditBlobStore } from '../../../core/audit/AuditLog.js';
import { randomBytes } from '../../../core/crypto/primitives.js';
import type { ActiveWorkspace } from '../../workspace-session.js';
import type {
  ConfigAccount,
  ConfigCategory,
  ConfigTag,
  ReadModel,
  Transaction,
} from '../../../core/query/types.js';
import type { ExportFilters } from '../../../shared/ipc-contracts/export.js';

const ACC = '01HZZZZZZZZZZZZZZZZZZZZZZA';
const CAT = '01HZZZZZZZZZZZZZZZZZZZZZZB';
const TAG = '01HZZZZZZZZZZZZZZZZZZZZZZC';
const DATASET = '01HZZZZZZZZZZZZZZZZZZZZZZD';

function fakeEvent(senderId: number): {
  sender: { id: number; isDestroyed: () => boolean; send: () => void };
} {
  return { sender: { id: senderId, isDestroyed: () => false, send: () => undefined } };
}

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: '01HTX00000000000000000001A',
    date: '2025-02-10',
    type: 'expense',
    amount: 123.45,
    currency: 'EUR',
    description: 'Compra mensual',
    accountId: ACC,
    categoryId: CAT,
    subcategoryId: null,
    tagIds: [TAG],
    status: 'approved',
    createdAt: '2025-02-10T10:00:00.000Z',
    reference: null,
    details: null,
    ...over,
  };
}

function readModel(transactions: Transaction[]): ReadModel {
  const accounts: ConfigAccount[] = [
    {
      id: ACC,
      name: 'Caja',
      currency: 'EUR',
      openingBalance: 0,
      sortOrder: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
    },
  ];
  const categories: ConfigCategory[] = [
    {
      id: CAT,
      name: 'Alimentación',
      sortOrder: 0,
      createdAt: '2025-01-01T00:00:00.000Z',
      subcategories: [],
    },
  ];
  const tags: ConfigTag[] = [
    { id: TAG, name: 'Comida', sortOrder: 0, createdAt: '2025-01-01T00:00:00.000Z' },
  ];
  return {
    transactions,
    configAccounts: accounts,
    configCategories: categories,
    configTags: tags,
    importMappings: [],
    rowHashes: new Set(),
    notes: new Map(),
    transactionsByReference: new Map(),
    splits: new Map(),
    splitParentIds: new Set(),
  };
}

function memStore(): AuditBlobStore {
  const dump = new Map<string, Uint8Array>();
  return {
    async read(name) {
      return dump.get(name) ?? null;
    },
    async write(name, data) {
      dump.set(name, Uint8Array.from(data));
    },
  };
}

const FILTERS: ExportFilters = { dateFrom: '2025-01-01', dateTo: '2025-12-31', accountIds: [ACC] };

let workspaceDir: string;
let outDir: string;
let ws: ActiveWorkspace;
let auditStores: Map<string, AuditBlobStore>;
let clock: number;
let ulidCounter: number;

function makeDeps(over: Partial<ExportHandlerDeps> = {}): ExportHandlerDeps {
  return {
    getActiveWorkspace: () => ws,
    getReadModel: () => readModel([tx()]),
    getDatasetId: () => DATASET,
    getActorUserIdentity: () => 'treasurer@example.org',
    newUlid: () => `01HEXPORT${String(ulidCounter++).padStart(17, '0')}`,
    now: () => clock,
    documentsDir: () => outDir,
    showSaveDialog: async (_w, defaultPath) => ({ canceled: false, filePath: defaultPath }),
    createAuditLog: (w, datasetId, actor) => {
      const key = `${w.folderPath}`;
      let store = auditStores.get(key);
      if (!store) {
        store = memStore();
        auditStores.set(key, store);
      }
      return new FileAuditLog({
        store,
        mk: w.mk,
        datasetId,
        deviceId: w.deviceId,
        actorUserIdentity: actor,
        now: () => new Date(clock),
      });
    },
    ...over,
  };
}

beforeEach(async () => {
  _resetPendingExports();
  clock = 1_700_000_000_000;
  ulidCounter = 0;
  auditStores = new Map();
  const root = await fs.mkdtemp(path.join(os.homedir(), 'ot-export-handler-'));
  workspaceDir = path.join(root, 'workspace');
  outDir = path.join(root, 'Documents');
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  ws = { folderPath: workspaceDir, deviceId: 'device-1', mk: randomBytes(32) };
});

afterEach(async () => {
  await fs.rm(path.dirname(workspaceDir), { recursive: true, force: true });
});

describe('export:prepare', () => {
  it('returns a token + count for a valid filtered request', async () => {
    const handlers = createExportHandlers(makeDeps());
    const res = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: FILTERS,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.confirmationToken.length).toBeGreaterThan(0);
      expect(res.estimatedRowCount).toBe(1);
      expect(res.basename.endsWith('.csv')).toBe(true);
    }
  });

  it('blocks an unfiltered (date-only) request with EXPORT_MIN_FILTERS', async () => {
    const handlers = createExportHandlers(makeDeps());
    const res = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: { dateFrom: '2025-01-01', dateTo: '2025-12-31' },
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    expect(res).toEqual({ ok: false, code: 'EXPORT_MIN_FILTERS' });
  });

  it('hard-blocks a destination inside the workspace (FR14)', async () => {
    const handlers = createExportHandlers(
      makeDeps({
        showSaveDialog: async () => ({
          canceled: false,
          filePath: path.join(workspaceDir, 'leak.csv'),
        }),
      }),
    );
    const res = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: FILTERS,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    expect(res).toEqual({ ok: false, code: 'EXPORT_DEST_INSIDE_WORKSPACE' });
  });

  it('reports USER_CANCELLED_DIALOG when the save dialog is cancelled', async () => {
    const handlers = createExportHandlers(
      makeDeps({ showSaveDialog: async () => ({ canceled: true }) }),
    );
    const res = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: FILTERS,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    expect(res).toEqual({ ok: false, code: 'USER_CANCELLED_DIALOG' });
  });

  it('returns EXPORT_NO_WORKSPACE when locked', async () => {
    const handlers = createExportHandlers(makeDeps({ getActiveWorkspace: () => null }));
    const res = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: FILTERS,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    expect(res).toEqual({ ok: false, code: 'EXPORT_NO_WORKSPACE' });
  });
});

describe('export:run', () => {
  it('writes a CSV file (BOM + `;` separator) and audits start+success', async () => {
    const deps = makeDeps();
    const handlers = createExportHandlers(deps);
    const prep = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: FILTERS,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    if (!prep.ok) throw new Error('prepare failed: ' + JSON.stringify(prep));

    const run = await handlers.run(fakeEvent(1) as never, {
      confirmationToken: prep.confirmationToken,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.rowCount).toBe(1);

    const written = await fs.readFile(path.join(outDir, run.basename), 'utf8');
    expect(written.startsWith('\ufeff')).toBe(true); // UTF-8 BOM
    expect(written).toContain(';'); // delimiter
    expect(written).toContain('Caja');
    expect(written).toContain('-123,45'); // signed expense amount with EU decimal preference

    const audit = auditStores.get(workspaceDir)!;
    const log = new FileAuditLog({
      store: audit,
      mk: ws.mk,
      datasetId: DATASET,
      deviceId: ws.deviceId,
      actorUserIdentity: 'treasurer@example.org',
      now: () => new Date(clock),
    });
    const entries = await log.readAll();
    expect(entries.map((e) => e.result)).toEqual(['started', 'succeeded']);
    expect(entries[0]!.action).toBe('export.csv');
  });

  it('writes an xlsx file', async () => {
    const handlers = createExportHandlers(makeDeps());
    const prep = await handlers.prepare(fakeEvent(1) as never, {
      format: 'xlsx',
      filters: FILTERS,
      locale: 'en',
      dateFormat: 'ISO',
      numberFormat: 'us',
    });
    if (!prep.ok) throw new Error('prepare failed');
    const run = await handlers.run(fakeEvent(1) as never, {
      confirmationToken: prep.confirmationToken,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    const stat = await fs.stat(path.join(outDir, run.basename));
    expect(stat.size).toBeGreaterThan(0);
    expect(run.basename.endsWith('.xlsx')).toBe(true);
  });

  it('rejects an unknown / already-consumed token (one-shot replay)', async () => {
    const handlers = createExportHandlers(makeDeps());
    const prep = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: FILTERS,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    if (!prep.ok) throw new Error('prepare failed');

    const first = await handlers.run(fakeEvent(1) as never, {
      confirmationToken: prep.confirmationToken,
    });
    expect(first.ok).toBe(true);
    const replay = await handlers.run(fakeEvent(1) as never, {
      confirmationToken: prep.confirmationToken,
    });
    expect(replay).toEqual({ ok: false, code: 'EXPORT_TOKEN_INVALID' });
  });

  it('rejects a token used from a different window', async () => {
    const handlers = createExportHandlers(makeDeps());
    const prep = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: FILTERS,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    if (!prep.ok) throw new Error('prepare failed');
    const res = await handlers.run(fakeEvent(2) as never, {
      confirmationToken: prep.confirmationToken,
    });
    expect(res).toEqual({ ok: false, code: 'EXPORT_TOKEN_INVALID' });
  });

  it('enforces the 3-per-15-min rate limit across runs', async () => {
    const handlers = createExportHandlers(makeDeps());
    for (let i = 0; i < 3; i++) {
      const prep = await handlers.prepare(fakeEvent(1) as never, {
        format: 'csv',
        filters: FILTERS,
        locale: 'es',
        dateFormat: 'DMY',
        numberFormat: 'eu',
      });
      if (!prep.ok) throw new Error(`prepare ${i} failed`);
      const run = await handlers.run(fakeEvent(1) as never, {
        confirmationToken: prep.confirmationToken,
      });
      expect(run.ok).toBe(true);
    }
    // 4th prepare is pre-checked against the persisted gate state.
    const blocked = await handlers.prepare(fakeEvent(1) as never, {
      format: 'csv',
      filters: FILTERS,
      locale: 'es',
      dateFormat: 'DMY',
      numberFormat: 'eu',
    });
    expect(blocked).toEqual({ ok: false, code: 'EXPORT_RATE_LIMITED' });
  });
});
