// Tests for config:setDataDir IPC handler — P1-2 (#149) trial-readiness.
//
// Covers: happy path, schema validation, same-dir no-op, under-userData
// rejection, unwritable folder, dataset-mismatch detection. Mocks Electron's
// `app.relaunch` / `app.exit` via the deps factory so tests don't actually
// relaunch the process.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock Electron BEFORE importing anything that transitively pulls in
// `bootstrap.ts` (which `import { app } from 'electron'`). The handler under
// test never calls `app` directly — production wiring goes through the
// `buildProductionSetDataDirDeps` factory — but bootstrap.ts is loaded
// transitively because the handler module imports getAppConfig/setAppConfig
// from it for the production defaults.
vi.mock('electron', () => ({
  app: {
    getPath: () => '/should/not/be/used',
    relaunch: () => undefined,
    exit: () => undefined,
  },
}));

import { createConfigSetDataDirHandler } from './config.js';
import { saveAppConfig } from '../../config.js';
import type { AppConfig } from '../../../shared/ipc-contracts/config.js';

const CURRENT_DATASET_ID = '01HZZZZZZZZZZZZZZZZZZZZZZA';
const OTHER_DATASET_ID = '01HZZZZZZZZZZZZZZZZZZZZZZB';

async function writeDatasetJson(
  dir: string,
  data: { datasetId: string; createdAt?: string; schemaVersion?: number; appVersion?: string },
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    datasetId: data.datasetId,
    createdAt: data.createdAt ?? '2025-01-01T00:00:00.000Z',
    ...(data.schemaVersion !== undefined ? { schemaVersion: data.schemaVersion } : {}),
    ...(data.appVersion !== undefined ? { appVersion: data.appVersion } : {}),
  };
  await fs.writeFile(path.join(dir, 'dataset.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

function makeDeps(opts: {
  userDataDir: string;
  currentDataDir?: string | null;
  currentDatasetId?: string;
  saveConfigOverride?: (userDataDir: string, config: AppConfig) => Promise<void>;
}) {
  const relaunch = vi.fn();
  const exit = vi.fn();
  const updateCachedConfig = vi.fn();
  // Default currentDataDir to <userData>/dev-events if not provided (matches bootstrap default)
  const effectiveCurrentDataDir = opts.currentDataDir ?? path.join(opts.userDataDir, 'dev-events');
  const currentConfig: AppConfig = {
    version: 1,
    dataDir: opts.currentDataDir ?? null,
    previousDataDir: null,
    readOnly: false,
  };
  return {
    relaunch,
    exit,
    updateCachedConfig,
    currentConfig,
    deps: {
      userDataDir: () => opts.userDataDir,
      relaunch,
      exit,
      getCurrentConfig: () => currentConfig,
      getCurrentDataDir: () => effectiveCurrentDataDir,
      getCurrentDatasetId: () => opts.currentDatasetId ?? CURRENT_DATASET_ID,
      saveConfig: opts.saveConfigOverride ?? saveAppConfig,
      updateCachedConfig,
    },
  };
}

describe('config:setDataDir handler', () => {
  let userDataDir: string;
  let externalRoot: string;

  beforeEach(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    userDataDir = path.join(os.tmpdir(), `ot-userdata-${stamp}`);
    externalRoot = path.join(os.tmpdir(), `ot-external-${stamp}`);
    await fs.mkdir(userDataDir, { recursive: true });
    await fs.mkdir(externalRoot, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(externalRoot, { recursive: true, force: true }).catch(() => undefined);
    vi.useRealTimers();
  });

  it('happy path: persists new dataDir and schedules relaunch', async () => {
    const newDir = path.join(externalRoot, 'workspace-a');
    const { deps, relaunch, exit, updateCachedConfig } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    vi.useFakeTimers();
    const result = await handler({ newDir });
    expect(result).toEqual({ ok: true });

    // app-config.json was written with the new dataDir AND previousDataDir
    const written = JSON.parse(
      await fs.readFile(path.join(userDataDir, 'app-config.json'), 'utf-8'),
    );
    expect(written.dataDir).toBe(path.resolve(newDir));
    expect(written.previousDataDir).toBe(path.join(userDataDir, 'dev-events')); // default

    // In-memory cache updated via the injected hook
    expect(updateCachedConfig).toHaveBeenCalledTimes(1);
    expect(updateCachedConfig.mock.calls[0]?.[0]?.dataDir).toBe(path.resolve(newDir));
    expect(updateCachedConfig.mock.calls[0]?.[0]?.previousDataDir).toBe(
      path.join(userDataDir, 'dev-events'),
    );

    // Relaunch + exit scheduled via setImmediate (not yet fired)
    expect(relaunch).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(relaunch).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('rejects malformed request payload (SCHEMA_INVALID)', async () => {
    const { deps } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_INVALID');
    }
  });

  it('rejects empty newDir (SCHEMA_INVALID)', async () => {
    const { deps } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SCHEMA_INVALID');
  });

  it('rejects path under userData (INVALID_LOCATION)', async () => {
    const newDir = path.join(userDataDir, 'nested', 'data');
    const { deps, relaunch, exit } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_LOCATION');
    expect(relaunch).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();

    // app-config.json must not have been touched
    await expect(fs.access(path.join(userDataDir, 'app-config.json'))).rejects.toThrow();
  });

  it('rejects path identical to userData itself (INVALID_LOCATION)', async () => {
    const { deps } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir: userDataDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INVALID_LOCATION');
  });

  it('rejects same dir as currently active dataDir (SAME_DIR)', async () => {
    const current = path.join(externalRoot, 'current');
    await fs.mkdir(current, { recursive: true });
    const { deps } = makeDeps({ userDataDir, currentDataDir: current });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir: current });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('SAME_DIR');
  });

  it('refuses when target dataset.json declares a different dataset (DATASET_MISMATCH)', async () => {
    const newDir = path.join(externalRoot, 'foreign');
    await writeDatasetJson(newDir, { datasetId: OTHER_DATASET_ID });

    const { deps, relaunch } = makeDeps({
      userDataDir,
      currentDatasetId: CURRENT_DATASET_ID,
    });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATASET_MISMATCH');
      expect(result.error.details?.currentDatasetId).toBe(CURRENT_DATASET_ID);
      expect(result.error.details?.newDatasetId).toBe(OTHER_DATASET_ID);
    }
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('accepts target dataset.json when datasetId matches current', async () => {
    const newDir = path.join(externalRoot, 'matching');
    await writeDatasetJson(newDir, { datasetId: CURRENT_DATASET_ID });

    const { deps } = makeDeps({
      userDataDir,
      currentDatasetId: CURRENT_DATASET_ID,
    });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir });
    expect(result.ok).toBe(true);
  });

  it('treats empty events.ndjson as fresh (no mismatch)', async () => {
    const newDir = path.join(externalRoot, 'empty-log');
    await fs.mkdir(newDir, { recursive: true });
    await fs.writeFile(path.join(newDir, 'events.ndjson'), '', 'utf-8');

    const { deps } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir });
    expect(result.ok).toBe(true);
  });

  it('refuses when target has events.ndjson but no dataset.json (foreign — DATASET_MISMATCH, no details)', async () => {
    const newDir = path.join(externalRoot, 'legacy-no-dataset-json');
    await fs.mkdir(newDir, { recursive: true });
    // Old workspace: events.ndjson present, no dataset.json. We can't surface
    // a datasetId for the bypass dialog, so this is unbypassable.
    await fs.writeFile(
      path.join(newDir, 'events.ndjson'),
      JSON.stringify({
        type: 'AccountCreated',
        id: '01KQHEXAMPLE0000000000ABCD',
        name: 'Unicaja',
      }) + '\n',
      'utf-8',
    );

    const { deps } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATASET_MISMATCH');
      expect(result.error.details?.newDatasetId).toBeUndefined();
    }
  });

  it('confirmDatasetSwitch=true bypasses for a foreign dataset.json (Pedro repro)', async () => {
    const newDir = path.join(externalRoot, 'foreign-confirm');
    await writeDatasetJson(newDir, { datasetId: OTHER_DATASET_ID });
    // Also seed an events.ndjson whose first line is the flat AccountCreated
    // shape (no top-level datasetId) — exactly the layout that broke the old
    // events-sniffing detector.
    await fs.writeFile(
      path.join(newDir, 'events.ndjson'),
      JSON.stringify({
        type: 'AccountCreated',
        id: '01KQHEXAMPLE0000000000ABCD',
        name: 'Unicaja',
      }) + '\n',
      'utf-8',
    );

    const { deps } = makeDeps({ userDataDir, currentDatasetId: CURRENT_DATASET_ID });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir, confirmDatasetSwitch: true });
    expect(result.ok).toBe(true);
  });

  it('confirmDatasetSwitch=true still bypasses even when first events.ndjson line lacks datasetId (regression)', async () => {
    const newDir = path.join(externalRoot, 'flat-event-confirm');
    await writeDatasetJson(newDir, { datasetId: OTHER_DATASET_ID });
    // Pedro's exact first-line shape: flat Configuración event, no datasetId.
    await fs.writeFile(
      path.join(newDir, 'events.ndjson'),
      JSON.stringify({
        type: 'AccountCreated',
        id: '01KQ00000000000000000000PE',
        name: 'Unicaja',
      }) + '\n',
      'utf-8',
    );

    const { deps } = makeDeps({ userDataDir, currentDatasetId: CURRENT_DATASET_ID });
    const handler = createConfigSetDataDirHandler(deps);

    // Without confirm → DATASET_MISMATCH with details.newDatasetId set.
    const denied = await handler({ newDir });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error.code).toBe('DATASET_MISMATCH');
      expect(denied.error.details?.newDatasetId).toBe(OTHER_DATASET_ID);
    }

    // With confirm → bypass succeeds.
    const allowed = await handler({ newDir, confirmDatasetSwitch: true });
    expect(allowed.ok).toBe(true);
  });

  it('refuses with SCHEMA_TOO_NEW when folder dataset.json schemaVersion exceeds app (not bypassable)', async () => {
    const newDir = path.join(externalRoot, 'schema-too-new');
    await writeDatasetJson(newDir, { datasetId: OTHER_DATASET_ID, schemaVersion: 2 });

    const { deps } = makeDeps({ userDataDir, currentDatasetId: CURRENT_DATASET_ID });
    const handler = createConfigSetDataDirHandler(deps);

    // Even with confirm=true the switch must NOT be allowed.
    const result = await handler({ newDir, confirmDatasetSwitch: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_TOO_NEW');
      expect(result.error.details?.folderSchemaVersion).toBe(2);
      expect(result.error.details?.appSchemaVersion).toBe(1);
    }
  });

  it('refuses with DATASET_CORRUPT when dataset.json is unparseable', async () => {
    const newDir = path.join(externalRoot, 'corrupt-dataset-json');
    await fs.mkdir(newDir, { recursive: true });
    await fs.writeFile(path.join(newDir, 'dataset.json'), '{ not json', 'utf-8');

    const { deps } = makeDeps({ userDataDir, currentDatasetId: CURRENT_DATASET_ID });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir, confirmDatasetSwitch: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('DATASET_CORRUPT');
    }
  });

  it('refuses when target events.ndjson is corrupted JSON without dataset.json (foreign DATASET_MISMATCH)', async () => {
    const newDir = path.join(externalRoot, 'corrupted');
    await fs.mkdir(newDir, { recursive: true });
    await fs.writeFile(path.join(newDir, 'events.ndjson'), '{ not valid json\n', 'utf-8');

    const { deps } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('DATASET_MISMATCH');
  });

  it('returns NOT_WRITABLE when mkdir fails (path is an existing file)', async () => {
    const filePath = path.join(externalRoot, 'not-a-dir');
    await fs.writeFile(filePath, 'i am a file', 'utf-8');

    const { deps, relaunch } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir: filePath });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_WRITABLE');
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('returns WRITE_FAILED when persistence throws', async () => {
    const newDir = path.join(externalRoot, 'will-fail');
    const { deps, relaunch } = makeDeps({
      userDataDir,
      saveConfigOverride: async () => {
        throw new Error('disk full');
      },
    });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WRITE_FAILED');
      expect(result.error.message).toContain('disk full');
    }
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('cleans up its write-probe file', async () => {
    const newDir = path.join(externalRoot, 'probe-check');
    const { deps } = makeDeps({ userDataDir });
    const handler = createConfigSetDataDirHandler(deps);

    const result = await handler({ newDir });
    expect(result.ok).toBe(true);

    const entries = await fs.readdir(newDir);
    expect(entries.filter((e) => e.startsWith('.ot-write-probe-'))).toEqual([]);
  });
});
