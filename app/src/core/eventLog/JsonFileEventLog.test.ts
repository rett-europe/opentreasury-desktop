// WI-4′ unit tests — NDJSON append-only log.
// Runs in vitest's node environment; uses real fs into a tmp dir per test.
// WI-23 — fixtures migrated from the legacy `account.created` enveloped
// event to the unified flat `AccountCreated` event (now required to carry
// `sortOrder`). The loader's WI-23 boot-guard is exercised in a separate
// file (`JsonFileEventLog.wi23.test.ts`).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { JsonFileEventLog } from './JsonFileEventLog';
import type { DomainEvent } from './EventLog';

const ulid = (suffix: string): string => `01HZ${suffix.padEnd(22, '0')}`.slice(0, 26);

let sortSeq = 0;

function makeAccountEvent(idSuffix: string): DomainEvent {
  return {
    type: 'AccountCreated',
    id: ulid(idSuffix),
    name: `Account-${idSuffix}`,
    bankName: 'Test Bank',
    currency: 'EUR',
    openingBalance: 0,
    sortOrder: sortSeq++,
    createdAt: '2026-04-19T10:00:00.000Z',
  } as DomainEvent;
}

describe('JsonFileEventLog', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ot-eventlog-'));
    sortSeq = 0;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('round-trips three events via append + load', async () => {
    const log = new JsonFileEventLog({ dir: tmpDir });
    const e1 = makeAccountEvent('E001');
    const e2 = makeAccountEvent('E002');
    const e3 = makeAccountEvent('E003');

    await log.append(e1);
    await log.append(e2);
    await log.append(e3);

    // Fresh instance to prove durability (not just in-memory cache).
    const reopened = new JsonFileEventLog({ dir: tmpDir });
    const loaded = await reopened.load();

    expect(loaded).toHaveLength(3);
    expect(loaded.map((e) => e.id)).toEqual([e1.id, e2.id, e3.id]);
    // Deep equality on the first event — schemas are preserved byte-for-byte.
    expect(loaded[0]).toEqual(e1);
  });

  it('returns [] when events.ndjson does not exist', async () => {
    const log = new JsonFileEventLog({ dir: path.join(tmpDir, 'nested', 'missing') });
    const loaded = await log.load();
    expect(loaded).toEqual([]);
    // Directory should have been created as a side effect — idempotent.
    const stat = await fs.stat(path.join(tmpDir, 'nested', 'missing'));
    expect(stat.isDirectory()).toBe(true);
  });

  it('is idempotent by event.id (appending the same id twice writes one line)', async () => {
    const log = new JsonFileEventLog({ dir: tmpDir });
    const evt = makeAccountEvent('DUP1');

    await log.append(evt);
    await log.append(evt); // duplicate — must be a no-op
    await log.append({ ...evt } as DomainEvent); // same id, different object → no-op

    const raw = await fs.readFile(path.join(tmpDir, 'events.ndjson'), 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    expect(lines).toHaveLength(1);

    const loaded = await new JsonFileEventLog({ dir: tmpDir }).load();
    expect(loaded).toHaveLength(1);
  });

  it('skips a malformed trailing line without throwing (crash simulation)', async () => {
    const log = new JsonFileEventLog({ dir: tmpDir });
    const e1 = makeAccountEvent('OK01');
    const e2 = makeAccountEvent('OK02');
    await log.append(e1);
    await log.append(e2);

    // Simulate a crash that wrote a partial third line (no trailing newline).
    const partial = '{"id":"01HZPARTIAL","type":"AccountCreated","name":"Par';
    await fs.appendFile(path.join(tmpDir, 'events.ndjson'), partial, 'utf8');

    const reopened = new JsonFileEventLog({ dir: tmpDir });
    const loaded = await reopened.load();

    expect(loaded).toHaveLength(2);
    expect(loaded.map((e) => e.id)).toEqual([e1.id, e2.id]);
  });

  // WI-31a — appendBatch tests
  it('appendBatch writes multiple events atomically', async () => {
    const log = new JsonFileEventLog({ dir: tmpDir });
    const e1 = makeAccountEvent('B001');
    const e2 = makeAccountEvent('B002');
    const e3 = makeAccountEvent('B003');

    await log.appendBatch([e1, e2, e3]);

    const reopened = new JsonFileEventLog({ dir: tmpDir });
    const loaded = await reopened.load();

    expect(loaded).toHaveLength(3);
    expect(loaded.map((e) => e.id)).toEqual([e1.id, e2.id, e3.id]);
  });

  it('appendBatch skips already-seen ids (idempotent)', async () => {
    const log = new JsonFileEventLog({ dir: tmpDir });
    const e1 = makeAccountEvent('C001');
    const e2 = makeAccountEvent('C002');

    await log.append(e1);
    await log.appendBatch([e1, e2]); // e1 already seen

    const loaded = await log.load();
    expect(loaded).toHaveLength(2);
    expect(loaded.map((e) => e.id)).toEqual([e1.id, e2.id]);
  });

  it('appendBatch is a no-op when all events are already seen', async () => {
    const log = new JsonFileEventLog({ dir: tmpDir });
    const e1 = makeAccountEvent('D001');

    await log.append(e1);
    await log.appendBatch([e1]);

    const loaded = await log.load();
    expect(loaded).toHaveLength(1);
  });

  it('appendBatch with empty array is a no-op', async () => {
    const log = new JsonFileEventLog({ dir: tmpDir });
    await log.appendBatch([]);

    const loaded = await log.load();
    expect(loaded).toHaveLength(0);
  });
});
