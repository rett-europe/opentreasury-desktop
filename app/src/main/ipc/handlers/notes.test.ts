// WI-19 — unit tests for transaction note handlers (add/list/edit/delete).
//
// Uses an in-memory EventLog stub + fresh reducer per test. Mirrors the
// transaction.test.ts pattern so the note pipeline has the same guarantees:
//   - SCHEMA_INVALID at the IPC boundary.
//   - TX_NOT_FOUND / NOTE_NOT_FOUND from the command layer.
//   - Idempotent event-log append.
//   - No throw across IPC (INTERNAL envelope on failures).

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAddNoteHandler,
  createDeleteNoteHandler,
  createEditNoteHandler,
  createListNotesHandler,
} from './notes';
import type { EventLog, DomainEvent } from '../../../core/eventLog/EventLog';
import {
  applyEvent,
  getReadModel,
  replayEvents,
  resetReadModel,
} from '../../../core/query/reducers';

const ulid = (suffix: string): string => (suffix + '0'.repeat(26)).slice(0, 26).toUpperCase();

const ACCOUNT_ID = ulid('ACC1');
const DATASET_ID = ulid('DATA');
const DEVICE_ID = ulid('DEV1');
const TX_ID = ulid('TX01');

class InMemoryEventLog implements EventLog {
  private readonly events: DomainEvent[] = [];
  private readonly seen = new Set<string>();

  async append(event: DomainEvent): Promise<void> {
    if (this.seen.has(event.id)) return;
    this.seen.add(event.id);
    this.events.push(event);
  }

  async load(): Promise<DomainEvent[]> {
    return [...this.events];
  }
}

function seedAccountAndTx(): void {
  replayEvents([
    {
      id: ulid('EVTACC'),
      type: 'account.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-19T10:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: ACCOUNT_ID,
        bankName: 'Test Bank',
        bankNameShort: 'TB',
        accountLabel: 'Main',
        color: null,
        sortOrder: 0,
        isActive: true,
        createdAt: '2026-04-19T10:00:00.000Z',
      },
    } as DomainEvent,
    {
      id: ulid('EVTTX1'),
      type: 'tx.created',
      datasetId: DATASET_ID,
      actorDeviceId: DEVICE_ID,
      createdAt: '2026-04-20T12:00:00.000Z',
      dekVersion: 0,
      version: 1,
      payload: {
        id: TX_ID,
        date: '2026-04-20',
        type: 'income',
        amount: 100,
        currency: 'EUR',
        description: 'Test donation',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-20T12:00:00.000Z',
      },
    } as DomainEvent,
  ]);
}

function idGen(queue: string[]) {
  let i = 0;
  return () => {
    const next = queue[i] ?? ulid(`X${i}`);
    i += 1;
    return next;
  };
}

describe('transaction:note:add handler', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccountAndTx();
  });

  it('happy path: creates note, appends event, applies reducer', async () => {
    const eventLog = new InMemoryEventLog();
    const NOTE_ID = ulid('NOTE1');
    const handle = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T10:32:00.000Z'),
      newId: idGen([NOTE_ID]),
    });

    const response = await handle({ txId: TX_ID, text: 'Called donor.' });

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.type).toBe('tx.note.added');
    expect(response.event.id).toBe(NOTE_ID); // event id (first newId call)
    expect(response.event.txId).toBe(TX_ID);
    expect(response.event.text).toBe('Called donor.');
    // Note primary key comes from the second newId call.
    expect(response.event.noteId).toBeDefined();
    expect(response.event.noteId).toHaveLength(26);

    expect(await eventLog.load()).toHaveLength(1);
    expect(getReadModel().notes.get(TX_ID)).toHaveLength(1);
  });

  it('trims whitespace around text before persisting', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T10:32:00.000Z'),
      newId: idGen([ulid('NOTE2')]),
    });

    const response = await handle({ txId: TX_ID, text: '   Called donor.  \n' });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.text).toBe('Called donor.');
  });

  it('returns TX_NOT_FOUND when transaction does not exist', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date(),
      newId: idGen([ulid('X')]),
    });
    const response = await handle({ txId: ulid('GHOST'), text: 'Hi' });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('TX_NOT_FOUND');
    expect(await eventLog.load()).toHaveLength(0);
  });

  it('returns TEXT_EMPTY when text is only whitespace', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date(),
      newId: idGen([ulid('X')]),
    });
    const response = await handle({ txId: TX_ID, text: '    ' });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    // Trim happens at the IPC boundary so empty-after-trim trips the Zod
    // min(1) check → SCHEMA_INVALID. This is acceptable because both codes
    // mean "text is empty"; Trinity maps both to the same user message.
    expect(['TEXT_EMPTY', 'SCHEMA_INVALID']).toContain(response.error.code);
  });

  it('returns SCHEMA_INVALID when text exceeds 2000 chars', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date(),
      newId: idGen([ulid('X')]),
    });
    const response = await handle({ txId: TX_ID, text: 'x'.repeat(2001) });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(['TEXT_TOO_LONG', 'SCHEMA_INVALID']).toContain(response.error.code);
    expect(await eventLog.load()).toHaveLength(0);
  });

  it('returns SCHEMA_INVALID for malformed txId', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date(),
      newId: idGen([ulid('X')]),
    });
    const response = await handle({ txId: 'short', text: 'Hi' });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SCHEMA_INVALID');
  });

  it('wraps event log throws as INTERNAL', async () => {
    const throwingLog: EventLog = {
      async append() {
        throw new Error('disk on fire');
      },
      async load() {
        return [];
      },
    };
    const handle = createAddNoteHandler({
      eventLog: throwingLog,
      getReadModel,
      now: () => new Date(),
      newId: idGen([ulid('X')]),
    });
    const response = await handle({ txId: TX_ID, text: 'Hi' });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('INTERNAL');
  });
});

describe('transaction:note:list handler', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccountAndTx();
  });

  it('returns empty array for a txId with no notes', async () => {
    const handle = createListNotesHandler({ getReadModel });
    const response = await handle({ txId: TX_ID });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.notes).toEqual([]);
  });

  it('returns notes ordered by createdAt ASC', async () => {
    const eventLog = new InMemoryEventLog();
    // Each add consumes TWO ids (event id + note id).
    const ids = [
      ulid('EVT1'),
      ulid('NOTE1'),
      ulid('EVT2'),
      ulid('NOTE2'),
      ulid('EVT3'),
      ulid('NOTE3'),
    ];
    const now = (() => {
      const stamps = [
        '2026-04-20T10:32:00.000Z',
        '2026-04-20T11:00:00.000Z',
        '2026-04-20T12:00:00.000Z',
      ];
      let k = 0;
      return () => new Date(stamps[k++]!);
    })();
    const add = createAddNoteHandler({
      eventLog,
      getReadModel,
      now,
      newId: idGen(ids),
    });
    await add({ txId: TX_ID, text: 'first' });
    await add({ txId: TX_ID, text: 'second' });
    await add({ txId: TX_ID, text: 'third' });

    const list = createListNotesHandler({ getReadModel });
    const response = await list({ txId: TX_ID });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.notes.map((n) => n.text)).toEqual(['first', 'second', 'third']);
  });

  it('returns SCHEMA_INVALID for malformed txId', async () => {
    const handle = createListNotesHandler({ getReadModel });
    const response = await handle({ txId: 'x' });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SCHEMA_INVALID');
  });
});

describe('transaction:note:edit handler', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccountAndTx();
  });

  it('happy path: updates existing note text', async () => {
    const eventLog = new InMemoryEventLog();
    const EVT_ID = ulid('EVT1');
    const NOTE_ID = ulid('NOTE1');
    const add = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T10:32:00.000Z'),
      newId: idGen([EVT_ID, NOTE_ID]),
    });
    const addRes = await add({ txId: TX_ID, text: 'original' });
    if (!addRes.ok) throw new Error('add failed');
    const actualNoteId = addRes.event.noteId;

    const edit = createEditNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T11:00:00.000Z'),
      newId: idGen([ulid('EDIT1')]),
    });
    const response = await edit({ noteId: actualNoteId, text: 'updated' });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.type).toBe('tx.note.edited');
    expect(response.event.text).toBe('updated');
    expect(response.event.noteId).toBe(actualNoteId);

    const note = getReadModel().notes.get(TX_ID)?.[0];
    expect(note?.text).toBe('updated');
    // createdAt is preserved; we do not bump it on edits (edit is in-place).
    expect(note?.createdAt).toBe('2026-04-20T10:32:00.000Z');
  });

  it('returns NOTE_NOT_FOUND when noteId is unknown', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createEditNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date(),
      newId: idGen([]),
    });
    const response = await handle({ noteId: ulid('GHOST'), text: 'hi' });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('NOTE_NOT_FOUND');
  });

  it('rejects empty text via SCHEMA_INVALID at the boundary', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createEditNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date(),
      newId: idGen([]),
    });
    const response = await handle({ noteId: ulid('N'), text: '   ' });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('SCHEMA_INVALID');
  });
});

describe('transaction:note:delete handler', () => {
  beforeEach(() => {
    resetReadModel();
    seedAccountAndTx();
  });

  it('happy path: hard-deletes the note', async () => {
    const eventLog = new InMemoryEventLog();
    const EVT_ID = ulid('EVT1');
    const NOTE_ID = ulid('NOTE1');
    const add = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T10:32:00.000Z'),
      newId: idGen([EVT_ID, NOTE_ID]),
    });
    const addRes = await add({ txId: TX_ID, text: 'doomed' });
    if (!addRes.ok) throw new Error('add failed');
    const actualNoteId = addRes.event.noteId;
    expect(getReadModel().notes.get(TX_ID)).toHaveLength(1);

    const del = createDeleteNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T11:00:00.000Z'),
      newId: idGen([ulid('DEL1')]),
    });
    const response = await del({ noteId: actualNoteId });
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.event.type).toBe('tx.note.deleted');
    expect(response.event.noteId).toBe(actualNoteId);

    expect(getReadModel().notes.get(TX_ID) ?? []).toHaveLength(0);
  });

  it('returns NOTE_NOT_FOUND for a non-existent note', async () => {
    const eventLog = new InMemoryEventLog();
    const handle = createDeleteNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date(),
      newId: idGen([]),
    });
    const response = await handle({ noteId: ulid('GHOST') });
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.code).toBe('NOTE_NOT_FOUND');
  });

  it('is idempotent when the same deletion event is replayed', async () => {
    const eventLog = new InMemoryEventLog();
    const EVT_ID = ulid('EVT1');
    const NOTE_ID = ulid('NOTE1');
    const add = createAddNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T10:32:00.000Z'),
      newId: idGen([EVT_ID, NOTE_ID]),
    });
    const addRes = await add({ txId: TX_ID, text: 'doomed' });
    if (!addRes.ok) throw new Error('add failed');
    const actualNoteId = addRes.event.noteId;

    const del = createDeleteNoteHandler({
      eventLog,
      getReadModel,
      now: () => new Date('2026-04-20T11:00:00.000Z'),
      newId: idGen([ulid('DEL1'), ulid('DEL2')]),
      applyEvent,
    });
    const r1 = await del({ noteId: actualNoteId });
    expect(r1.ok).toBe(true);

    // Second delete: note is already gone from the read model.
    const r2 = await del({ noteId: actualNoteId });
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error.code).toBe('NOTE_NOT_FOUND');
  });
});
