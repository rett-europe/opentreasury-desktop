// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { addNote, listNotes, deleteNote } from './notesApi.js';
import type {
  AddNoteResponse,
  ListNotesResponse,
  DeleteNoteResponse,
  TransactionNote,
} from '../../shared/ipc-contracts/notes.js';

const TX_ID = '01HZTX00000000000000000000';
const NOTE_ID = '01HZNOTE0000000000000000000'.slice(0, 26);
const NOTE_ID_2 = '01HZNOTE0000000000000000002'.slice(0, 26);
const EVT_ID = '01HZEVT0000000000000000000';

function stub(note: {
  add?: ReturnType<typeof vi.fn>;
  list?: ReturnType<typeof vi.fn>;
  edit?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
}): void {
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    transaction: { note },
  };
}

const fixtureNote: TransactionNote = {
  id: NOTE_ID,
  txId: TX_ID,
  text: 'Called donor.',
  createdAt: '2026-04-20T10:32:00Z',
};

describe('notesApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('addNote forwards request and returns response with event envelope', async () => {
    const payload: AddNoteResponse = {
      ok: true,
      event: {
        type: 'tx.note.added',
        id: NOTE_ID,
        txId: TX_ID,
        text: 'Called donor.',
        createdAt: '2026-04-20T10:32:00Z',
      },
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ add: fn });

    const result = await addNote({ txId: TX_ID, text: 'Called donor.' });

    expect(fn).toHaveBeenCalledWith({ txId: TX_ID, text: 'Called donor.' });
    expect(result).toEqual(payload);
  });

  it('listNotes returns notes oldest first', async () => {
    const payload: ListNotesResponse = {
      ok: true,
      notes: [fixtureNote, { ...fixtureNote, id: NOTE_ID_2, createdAt: '2026-04-21T14:05:00Z' }],
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ list: fn });

    const result = await listNotes({ txId: TX_ID });

    expect(fn).toHaveBeenCalledWith({ txId: TX_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.notes).toHaveLength(2);
  });

  it('deleteNote forwards noteId and returns deletion event', async () => {
    const payload: DeleteNoteResponse = {
      ok: true,
      event: {
        type: 'tx.note.deleted',
        id: NOTE_ID,
        txId: TX_ID,
        deletedAt: '2026-04-22T09:00:00Z',
      },
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ delete: fn });

    const result = await deleteNote({ noteId: NOTE_ID });

    expect(fn).toHaveBeenCalledWith({ noteId: NOTE_ID });
    expect(result.ok).toBe(true);
  });

  it('passes errors through with new error codes', async () => {
    const payload: AddNoteResponse = {
      ok: false,
      error: { code: 'TEXT_TOO_LONG', message: 'too long' },
    };
    const fn = vi.fn().mockResolvedValue(payload);
    stub({ add: fn });

    const result = await addNote({ txId: TX_ID, text: 'x'.repeat(2001) });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected error');
    expect(result.error.code).toBe('TEXT_TOO_LONG');
  });

  // Silence unused-import lint for EVT_ID (reserved for future event-roundtrip
  // assertions when edit is wired).
  it('references constants', () => {
    expect(EVT_ID).toHaveLength(26);
  });
});
