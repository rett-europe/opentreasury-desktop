// WI-19 — unit tests for the notes IPC request/response schemas.
//
// Covers add/list/edit/delete:
//   - Valid payloads parse.
//   - Text trimming + empty rejection.
//   - Max-length (2000) rejection.
//   - Malformed ULIDs rejected.
//   - Response discriminated-union shapes.

import { describe, expect, it } from 'vitest';
import {
  addNoteRequestSchema,
  addNoteResponseSchema,
  deleteNoteRequestSchema,
  deleteNoteResponseSchema,
  editNoteRequestSchema,
  listNotesRequestSchema,
  listNotesResponseSchema,
  transactionNoteSchema,
  NOTE_TEXT_MAX,
} from './notes';

const TX_ID = '01HZTX00000000000000000000';
const NOTE_ID = '01HZNT00000000000000000000';

describe('addNoteRequestSchema', () => {
  it('accepts a valid payload and trims text', () => {
    const parsed = addNoteRequestSchema.safeParse({
      txId: TX_ID,
      text: '   Called donor.   ',
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.text).toBe('Called donor.');
  });

  it('rejects empty text after trim', () => {
    const parsed = addNoteRequestSchema.safeParse({ txId: TX_ID, text: '   \t\n ' });
    expect(parsed.success).toBe(false);
  });

  it('rejects text longer than NOTE_TEXT_MAX', () => {
    const parsed = addNoteRequestSchema.safeParse({
      txId: TX_ID,
      text: 'x'.repeat(NOTE_TEXT_MAX + 1),
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts text at exactly NOTE_TEXT_MAX chars', () => {
    const parsed = addNoteRequestSchema.safeParse({
      txId: TX_ID,
      text: 'x'.repeat(NOTE_TEXT_MAX),
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects non-ULID txId', () => {
    const parsed = addNoteRequestSchema.safeParse({ txId: 'not-a-ulid', text: 'Hi' });
    expect(parsed.success).toBe(false);
  });

  it('rejects non-string text', () => {
    const parsed = addNoteRequestSchema.safeParse({ txId: TX_ID, text: 42 as unknown });
    expect(parsed.success).toBe(false);
  });
});

describe('listNotesRequestSchema', () => {
  it('accepts a valid ULID txId', () => {
    const parsed = listNotesRequestSchema.safeParse({ txId: TX_ID });
    expect(parsed.success).toBe(true);
  });

  it('rejects missing txId', () => {
    const parsed = listNotesRequestSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  it('rejects short txId', () => {
    const parsed = listNotesRequestSchema.safeParse({ txId: 'short' });
    expect(parsed.success).toBe(false);
  });
});

describe('editNoteRequestSchema', () => {
  it('accepts a valid payload', () => {
    const parsed = editNoteRequestSchema.safeParse({
      noteId: NOTE_ID,
      text: 'Updated comment',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects empty text', () => {
    const parsed = editNoteRequestSchema.safeParse({ noteId: NOTE_ID, text: '' });
    expect(parsed.success).toBe(false);
  });

  it('rejects overlong text', () => {
    const parsed = editNoteRequestSchema.safeParse({
      noteId: NOTE_ID,
      text: 'z'.repeat(NOTE_TEXT_MAX + 10),
    });
    expect(parsed.success).toBe(false);
  });
});

describe('deleteNoteRequestSchema', () => {
  it('accepts a valid noteId', () => {
    const parsed = deleteNoteRequestSchema.safeParse({ noteId: NOTE_ID });
    expect(parsed.success).toBe(true);
  });

  it('rejects missing noteId', () => {
    const parsed = deleteNoteRequestSchema.safeParse({});
    expect(parsed.success).toBe(false);
  });
});

describe('transactionNoteSchema', () => {
  it('accepts a valid note record', () => {
    const parsed = transactionNoteSchema.safeParse({
      id: NOTE_ID,
      txId: TX_ID,
      text: 'Hi',
      createdAt: '2026-04-20T10:32:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an invalid ISO datetime', () => {
    const parsed = transactionNoteSchema.safeParse({
      id: NOTE_ID,
      txId: TX_ID,
      text: 'Hi',
      createdAt: 'yesterday',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('response schemas — discriminated-union shape', () => {
  it('addNoteResponseSchema accepts ok: true with event envelope', () => {
    const parsed = addNoteResponseSchema.safeParse({
      ok: true,
      event: {
        type: 'tx.note.added',
        id: '01HZEVT0000000000000000000',
        noteId: NOTE_ID,
        txId: TX_ID,
        text: 'Hi',
        createdAt: '2026-04-20T10:32:00.000Z',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('addNoteResponseSchema accepts ok: false with error', () => {
    const parsed = addNoteResponseSchema.safeParse({
      ok: false,
      error: { code: 'TX_NOT_FOUND', message: 'transaction not found' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown error code', () => {
    const parsed = addNoteResponseSchema.safeParse({
      ok: false,
      error: { code: 'WHATEVER', message: 'x' },
    });
    expect(parsed.success).toBe(false);
  });

  it('listNotesResponseSchema accepts ok: true with notes array', () => {
    const parsed = listNotesResponseSchema.safeParse({
      ok: true,
      notes: [
        {
          id: NOTE_ID,
          txId: TX_ID,
          text: 'Hi',
          createdAt: '2026-04-20T10:32:00.000Z',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('deleteNoteResponseSchema accepts ok: true with deletion event', () => {
    const parsed = deleteNoteResponseSchema.safeParse({
      ok: true,
      event: {
        type: 'tx.note.deleted',
        id: '01HZEVT0000000000000000000',
        noteId: NOTE_ID,
        txId: TX_ID,
        deletedAt: '2026-04-22T09:00:00.000Z',
      },
    });
    expect(parsed.success).toBe(true);
  });
});
