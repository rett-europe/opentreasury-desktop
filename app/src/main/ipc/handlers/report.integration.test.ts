// SPEC-030 WI-2 — Report IPC handler integration test (Switch + Neo).
//
// Drives report:build → report:generate end-to-end with injected deps over a
// temp filesystem and a real in-memory FileAuditLog. Covers: the build→generate
// round-trip (PDF written), confirmation-token single-use + param binding,
// AUDIT-FIRST ordering (a signed `report.generate` entry exists BEFORE any file
// byte), the encrypted-but-locked workspace guard, the dest-inside-workspace
// hard block, and the no-path / no-plaintext boundary guarantee. Electron is
// mocked — every path/dialog/audit/render/write seam is injected.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  dialog: { showSaveDialog: vi.fn() },
  BrowserWindow: { fromWebContents: () => null },
}));

import { createReportHandlers, type ReportHandlerDeps, type OrgContext } from './report.js';
import { _resetPendingReports } from '../../services/reportGate.js';
import { FileAuditLog, type AuditBlobStore } from '../../../core/audit/AuditLog.js';
import type { AuditLog, AuditEntry } from '../../../core/audit/types.js';
import { randomBytes } from '../../../core/crypto/primitives.js';
import type { ActiveWorkspace } from '../../workspace-session.js';
import type { CategoryBreakdown, RangeReconciliation } from '../../../core/query/queries.js';
import type { OrgProfileViewModel } from '../../../shared/ipc-contracts/org-profile.js';

const DATASET = '01HZZZZZZZZZZZZZZZZZZZZZZD';

function fakeEvent(senderId: number): { sender: { id: number } } {
  return { sender: { id: senderId } };
}

const breakdown: CategoryBreakdown = {
  income: [
    { categoryId: '01HCAT0000000000000000001A', label: 'Cuotas', total: 7000 },
    { categoryId: '01HCAT0000000000000000002A', label: 'Donaciones', total: 2506.21 },
  ],
  expense: [
    { categoryId: '01HCAT0000000000000000003A', label: 'Alquiler', total: 6000 },
    { categoryId: '01HCAT0000000000000000004A', label: 'Suministros', total: 2647.5 },
  ],
};

const reconciliation: RangeReconciliation = {
  opening: 32162.93,
  credits: 9506.21,
  debits: 8647.5,
  internalTransfersIn: 0,
  internalTransfersOut: 0,
  internalTransfersNet: 0,
  closing: 33021.64,
};

const org: OrgProfileViewModel = {
  orgName: 'Asociación Ejemplo',
  legalRegistrationLine: 'Reg. Nº 12345',
  address: 'Calle Mayor 1',
  contactEmail: 'tesoreria@ejemplo.org',
  treasurer: { name: 'Ana Tesorera', role: 'Tesorera', place: 'Madrid' },
  auditor: { name: 'Beto Auditor', role: 'Auditor externo', place: 'Sevilla' },
  logo: null,
};

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

const validBuild = {
  periodKind: 'calendar-year' as const,
  periodStart: '2024-01-01',
  periodEnd: '2024-12-31',
  grouping: 'category' as const,
  locale: 'es' as const,
};

let workspaceDir: string;
let outDir: string;
let ws: ActiveWorkspace;
let auditStores: Map<string, AuditBlobStore>;
let clock: number;
let ulidCounter: number;
let order: string[];
let lastRenderedHtml: string | null;
let reconCalls: number;

function makeDeps(over: Partial<ReportHandlerDeps> = {}): ReportHandlerDeps {
  return {
    getActiveWorkspace: () => ws,
    getDatasetId: () => DATASET,
    getActorUserIdentity: () => 'treasurer@example.org',
    newUlid: () => `01HREPORT${String(ulidCounter++).padStart(17, '0')}`,
    now: () => clock,
    today: () => '2025-01-15',
    getCategoryBreakdown: () => breakdown,
    getReconciliation: () => {
      reconCalls += 1;
      return reconciliation;
    },
    getAccountName: () => 'Cuenta Corriente',
    loadOrgContext: (): Promise<OrgContext> =>
      Promise.resolve({ org, logoDataUrl: 'data:image/png;base64,AAAA' }),
    renderPdf: async (html: string) => {
      order.push('render');
      lastRenderedHtml = html;
      return Buffer.from('%PDF-1.4 fake-report');
    },
    writePdf: async (buffer: Buffer, destPath: string) => {
      order.push('write');
      await fs.writeFile(destPath, buffer);
    },
    showSaveDialog: async (_w, defaultPath) => ({ canceled: false, filePath: defaultPath }),
    documentsDir: () => outDir,
    createAuditLog: (w, datasetId, actor): AuditLog => {
      const key = `${w.folderPath}`;
      let store = auditStores.get(key);
      if (!store) {
        store = memStore();
        auditStores.set(key, store);
      }
      const real = new FileAuditLog({
        store,
        mk: w.mk,
        datasetId,
        deviceId: w.deviceId,
        actorUserIdentity: actor,
        now: () => new Date(clock),
      });
      // Wrap append to record ordering relative to render/write.
      return {
        append: async (input) => {
          order.push(`audit:${input.result}`);
          return real.append(input);
        },
        appendAnchor: (input) => real.appendAnchor(input),
        appendTimestamp: (input) => real.appendTimestamp(input),
        verifyChain: (opts) => real.verifyChain(opts),
        readAll: () => real.readAll(),
      };
    },
    ...over,
  };
}

function auditEntries(): Promise<readonly AuditEntry[]> {
  const store = auditStores.get(workspaceDir)!;
  const log = new FileAuditLog({
    store,
    mk: ws.mk,
    datasetId: DATASET,
    deviceId: ws.deviceId,
    actorUserIdentity: 'treasurer@example.org',
    now: () => new Date(clock),
  });
  return log.readAll();
}

beforeEach(async () => {
  _resetPendingReports();
  clock = 1_700_000_000_000;
  ulidCounter = 0;
  auditStores = new Map();
  order = [];
  lastRenderedHtml = null;
  reconCalls = 0;
  const root = await fs.mkdtemp(path.join(os.homedir(), 'ot-report-handler-'));
  workspaceDir = path.join(root, 'workspace');
  outDir = path.join(root, 'Documents');
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  ws = { folderPath: workspaceDir, deviceId: 'device-1', mk: randomBytes(32) };
});

afterEach(async () => {
  await fs.rm(path.dirname(workspaceDir), { recursive: true, force: true });
});

describe('report:build', () => {
  it('returns an aggregate-only model + token, with no path or plaintext rows', async () => {
    const handlers = createReportHandlers(makeDeps());
    const res = await handlers.build(fakeEvent(1) as never, validBuild);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.confirmationToken.length).toBeGreaterThan(0);
    // Aggregates tie to the WI-1 query outputs.
    expect(res.model.credits.total).toBe(9506.21);
    expect(res.model.debits.total).toBe(8647.5);
    expect(res.model.reconciliation.closing).toBe(33021.64);
    // No path string and no transaction-level plaintext anywhere in the payload.
    const serialized = JSON.stringify(res);
    expect(serialized).not.toContain(outDir);
    expect(serialized).not.toContain(workspaceDir);
    expect(serialized.toLowerCase()).not.toContain('.pdf');
  });

  it('returns REPORT_NO_WORKSPACE when locked', async () => {
    const handlers = createReportHandlers(makeDeps({ getActiveWorkspace: () => null }));
    const res = await handlers.build(fakeEvent(1) as never, validBuild);
    expect(res).toEqual({ ok: false, code: 'REPORT_NO_WORKSPACE' });
  });

  it('refuses a reconciliation that does not tie out (FR20)', async () => {
    const handlers = createReportHandlers(
      makeDeps({
        getReconciliation: () => ({
          opening: 100,
          credits: 50,
          debits: 10,
          internalTransfersIn: 0,
          internalTransfersOut: 0,
          internalTransfersNet: 0,
          closing: 999,
        }),
      }),
    );
    const res = await handlers.build(fakeEvent(1) as never, validBuild);
    expect(res).toEqual({ ok: false, code: 'REPORT_RECONCILE_MISMATCH' });
  });
});

describe('report:generate', () => {
  async function buildToken(handlers: ReturnType<typeof createReportHandlers>): Promise<string> {
    const res = await handlers.build(fakeEvent(1) as never, validBuild);
    if (!res.ok) throw new Error('build failed: ' + JSON.stringify(res));
    return res.confirmationToken;
  }

  it('writes the PDF and audits start+success with action report.generate / target report', async () => {
    const handlers = createReportHandlers(makeDeps());
    const token = await buildToken(handlers);
    const res = await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });

    expect(res.outcome).toBe('saved');
    if (res.outcome !== 'saved') return;
    expect(res.basename.endsWith('.pdf')).toBe(true);
    // Never a path string.
    expect(JSON.stringify(res)).not.toContain(outDir);

    const written = await fs.readFile(path.join(outDir, res.basename));
    expect(written.length).toBeGreaterThan(0);

    const entries = await auditEntries();
    expect(entries.map((e) => e.result)).toEqual(['started', 'succeeded']);
    expect(entries[0]!.action).toBe('report.generate');
    expect(entries[0]!.target_ref.type).toBe('report');
  });

  it('writes the signed `started` audit entry BEFORE any file byte (AC10)', async () => {
    const handlers = createReportHandlers(makeDeps());
    const token = await buildToken(handlers);
    await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });

    const startedIdx = order.indexOf('audit:started');
    const writeIdx = order.indexOf('write');
    expect(startedIdx).toBeGreaterThanOrEqual(0);
    expect(writeIdx).toBeGreaterThan(startedIdx);
    // render also happens after the audit-first entry.
    expect(order.indexOf('render')).toBeGreaterThan(startedIdx);
  });

  it('re-runs the WI-1 queries at generate time (token bound to params)', async () => {
    const handlers = createReportHandlers(makeDeps());
    const token = await buildToken(handlers);
    const callsAfterBuild = reconCalls;
    await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });
    expect(reconCalls).toBeGreaterThan(callsAfterBuild);
    // The rendered HTML reflects the bound build params (year + scope).
    expect(lastRenderedHtml).toContain('Informe financiero 2024');
    expect(lastRenderedHtml).toContain('Cuenta Corriente');
  });

  it('rejects a replayed (already-consumed) token — single use', async () => {
    const handlers = createReportHandlers(makeDeps());
    const token = await buildToken(handlers);
    const first = await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });
    expect(first.outcome).toBe('saved');
    const replay = await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });
    expect(replay).toEqual({ outcome: 'error', code: 'REPORT_TOKEN_INVALID' });
  });

  it('rejects an expired token (TTL)', async () => {
    const handlers = createReportHandlers(makeDeps());
    const token = await buildToken(handlers);
    clock += 60_001;
    const res = await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });
    expect(res).toEqual({ outcome: 'error', code: 'REPORT_TOKEN_INVALID' });
  });

  it('rejects a token used from a different window', async () => {
    const handlers = createReportHandlers(makeDeps());
    const token = await buildToken(handlers);
    const res = await handlers.generate(fakeEvent(2) as never, { confirmationToken: token });
    expect(res).toEqual({ outcome: 'error', code: 'REPORT_TOKEN_INVALID' });
  });

  it('invalidates an earlier token when a new build is prepared (rebind)', async () => {
    const handlers = createReportHandlers(makeDeps());
    const first = await handlers.build(fakeEvent(1) as never, validBuild);
    if (!first.ok) throw new Error('build failed');
    const second = await handlers.build(fakeEvent(1) as never, {
      ...validBuild,
      grouping: 'category-subcategory',
    });
    if (!second.ok) throw new Error('build failed');
    const stale = await handlers.generate(fakeEvent(1) as never, {
      confirmationToken: first.confirmationToken,
    });
    expect(stale).toEqual({ outcome: 'error', code: 'REPORT_TOKEN_INVALID' });
  });

  it('refuses generation on an encrypted-but-locked workspace (no audit, no file)', async () => {
    // Build while unlocked, then the workspace locks before generate.
    let active: ActiveWorkspace | null = ws;
    const handlers = createReportHandlers(makeDeps({ getActiveWorkspace: () => active }));
    const token = await buildToken(handlers);
    active = null; // workspace locked → master key gone
    const res = await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });
    expect(res).toEqual({ outcome: 'error', code: 'REPORT_NO_WORKSPACE' });
    expect(order).not.toContain('write');
    expect(auditStores.size).toBe(0);
  });

  it('hard-blocks a destination inside the workspace (FR14)', async () => {
    const handlers = createReportHandlers(
      makeDeps({
        showSaveDialog: async () => ({
          canceled: false,
          filePath: path.join(workspaceDir, 'leak.pdf'),
        }),
      }),
    );
    const token = await buildToken(handlers);
    const res = await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });
    expect(res).toEqual({ outcome: 'error', code: 'REPORT_DEST_INSIDE_WORKSPACE' });
    expect(order).not.toContain('write');
  });

  it('returns a canceled outcome (no audit, no file) when the save dialog is dismissed', async () => {
    const handlers = createReportHandlers(
      makeDeps({ showSaveDialog: async () => ({ canceled: true }) }),
    );
    const token = await buildToken(handlers);
    const res = await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });
    expect(res).toEqual({ outcome: 'canceled' });
    expect(order).not.toContain('write');
    expect(auditStores.size).toBe(0);
  });

  it('records a `failed` audit entry when the write fails', async () => {
    const handlers = createReportHandlers(
      makeDeps({
        writePdf: async () => {
          order.push('write');
          throw new Error('disk full');
        },
      }),
    );
    const token = await buildToken(handlers);
    const res = await handlers.generate(fakeEvent(1) as never, { confirmationToken: token });
    expect(res).toEqual({ outcome: 'error', code: 'REPORT_WRITE_FAILED' });
    const entries = await auditEntries();
    expect(entries.map((e) => e.result)).toEqual(['started', 'failed']);
  });
});
