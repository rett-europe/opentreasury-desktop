// WI-23 boot-guard tests — enforce Switch C2 (MUST).
//
// Two classes of refusal:
//   I3 — Legacy event types (`account.created` / `category.created` /
//        `tag.created`) must be rejected on load with code
//        `LEGACY_EVENT_TYPE_REJECTED`.
//   I4 — Unified event types (`AccountCreated` / `CategoryCreated` /
//        `TagCreated`) missing the now-required `sortOrder` field must be
//        rejected on load with code `UNIFIED_EVENT_SCHEMA_INVALID`.
//
// These tests exist to protect the precedent recorded in
// docs/security/security-requirements-v0.1.md §"Schema migration policy".
// If this file is deleted, Switch's C2 review condition is violated.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JsonFileEventLog, LEGACY_EVENT_TYPE_REJECTED } from './JsonFileEventLog';

const ulid = (suffix: string): string => `01HZ${suffix.padEnd(22, '0')}`.slice(0, 26);

async function writeLog(dir: string, lines: readonly unknown[]): Promise<void> {
  const raw = lines.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'events.ndjson'), raw, 'utf8');
}

function errCode(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code)
    : undefined;
}

describe('JsonFileEventLog WI-23 boot-guard — I3 legacy event types refused', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-eventlog-wi23-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('refuses logs containing account.created with LEGACY_EVENT_TYPE_REJECTED', async () => {
    await writeLog(tmpDir, [
      {
        id: ulid('LEGACC'),
        type: 'account.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-01-01T00:00:00.000Z',
        dekVersion: 0,
        version: 1,
        payload: {
          id: ulid('ACC1'),
          bankName: 'X',
          bankNameShort: null,
          accountLabel: 'A',
          color: null,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);
    const log = new JsonFileEventLog({ dir: tmpDir });
    await expect(log.load()).rejects.toSatisfy((e: unknown) => {
      return errCode(e) === LEGACY_EVENT_TYPE_REJECTED && String(e).includes('account.created');
    });
  });

  it('refuses logs containing category.created with LEGACY_EVENT_TYPE_REJECTED', async () => {
    await writeLog(tmpDir, [
      {
        id: ulid('LEGCAT'),
        type: 'category.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-01-01T00:00:00.000Z',
        dekVersion: 0,
        version: 1,
        payload: {
          id: ulid('CAT1'),
          name: 'X',
          description: null,
          categoryType: 'expense',
          sortOrder: 0,
          isActive: true,
          subcategories: [],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);
    const log = new JsonFileEventLog({ dir: tmpDir });
    await expect(log.load()).rejects.toSatisfy((e: unknown) => {
      return errCode(e) === LEGACY_EVENT_TYPE_REJECTED && String(e).includes('category.created');
    });
  });

  it('refuses logs containing tag.created with LEGACY_EVENT_TYPE_REJECTED', async () => {
    await writeLog(tmpDir, [
      {
        id: ulid('LEGTAG'),
        type: 'tag.created',
        datasetId: ulid('DATA'),
        actorDeviceId: ulid('DEV1'),
        createdAt: '2026-01-01T00:00:00.000Z',
        dekVersion: 0,
        version: 1,
        payload: {
          id: ulid('TAG1'),
          name: 'X',
          color: null,
          sortOrder: 0,
          isActive: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
    ]);
    const log = new JsonFileEventLog({ dir: tmpDir });
    await expect(log.load()).rejects.toSatisfy((e: unknown) => {
      return errCode(e) === LEGACY_EVENT_TYPE_REJECTED && String(e).includes('tag.created');
    });
  });
});

describe('JsonFileEventLog WI-23 boot-guard — I4 missing sortOrder refused', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-eventlog-wi23-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('refuses AccountCreated without sortOrder with UNIFIED_EVENT_SCHEMA_INVALID', async () => {
    await writeLog(tmpDir, [
      {
        type: 'AccountCreated',
        id: ulid('ACCN1'),
        name: 'No-sort account',
        currency: 'EUR',
        openingBalance: 0,
        createdAt: '2026-04-23T00:00:00.000Z',
        // sortOrder intentionally absent
      },
    ]);
    const log = new JsonFileEventLog({ dir: tmpDir });
    await expect(log.load()).rejects.toSatisfy((e: unknown) => {
      return errCode(e) === 'UNIFIED_EVENT_SCHEMA_INVALID' && String(e).includes('AccountCreated');
    });
  });

  it('refuses CategoryCreated without sortOrder with UNIFIED_EVENT_SCHEMA_INVALID', async () => {
    await writeLog(tmpDir, [
      {
        type: 'CategoryCreated',
        id: ulid('CATN1'),
        name: 'No-sort category',
        createdAt: '2026-04-23T00:00:00.000Z',
        // sortOrder intentionally absent
      },
    ]);
    const log = new JsonFileEventLog({ dir: tmpDir });
    await expect(log.load()).rejects.toSatisfy((e: unknown) => {
      return errCode(e) === 'UNIFIED_EVENT_SCHEMA_INVALID' && String(e).includes('CategoryCreated');
    });
  });

  it('refuses TagCreated without sortOrder with UNIFIED_EVENT_SCHEMA_INVALID', async () => {
    await writeLog(tmpDir, [
      {
        type: 'TagCreated',
        id: ulid('TAGN1'),
        name: 'No-sort tag',
        createdAt: '2026-04-23T00:00:00.000Z',
        // sortOrder intentionally absent
      },
    ]);
    const log = new JsonFileEventLog({ dir: tmpDir });
    await expect(log.load()).rejects.toSatisfy((e: unknown) => {
      return errCode(e) === 'UNIFIED_EVENT_SCHEMA_INVALID' && String(e).includes('TagCreated');
    });
  });

  it('accepts AccountCreated with sortOrder (positive control)', async () => {
    await writeLog(tmpDir, [
      {
        type: 'AccountCreated',
        id: ulid('ACCOK'),
        name: 'Well-formed',
        currency: 'EUR',
        openingBalance: 0,
        sortOrder: 0,
        createdAt: '2026-04-23T00:00:00.000Z',
      },
    ]);
    const log = new JsonFileEventLog({ dir: tmpDir });
    const loaded = await log.load();
    expect(loaded).toHaveLength(1);
  });
});
