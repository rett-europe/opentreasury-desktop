// WI-19: transactionNote commands — pure domain, no I/O.
//
// Three commands: add, edit, delete. Each returns a Result<DomainEvent, NoteError>
// and is wired by `main/ipc/handlers/notes.ts` to the JsonFileEventLog +
// in-memory reducer. All events follow the flat wire-style shape (no envelope)
// used by WI-15-lite / WI-17 events so they coexist on the same NDJSON log.
//
// Encryption: the event log transport layer (M2 crypto) encrypts the full
// payload surface — this module never bypasses that layer. Notes are stored
// inside the same DEK-encrypted payload envelope as tx.created (see ADR /
// decisions.md).

import type {
  TransactionNoteAddedEvent,
  TransactionNoteDeletedEvent,
  TransactionNoteEditedEvent,
} from '../events/schemas';
import type { ReadModel } from '../query/types';
import type { Result } from './createTransaction';

export type NoteErrorCode = 'TX_NOT_FOUND' | 'NOTE_NOT_FOUND' | 'TEXT_EMPTY' | 'TEXT_TOO_LONG';

export interface NoteError {
  readonly code: NoteErrorCode;
  readonly message: string;
  readonly field?: 'txId' | 'noteId' | 'text';
}

export const NOTE_TEXT_MAX = 2000;

export interface NoteDeps {
  readonly now: () => Date;
  readonly newId: () => string;
  readonly readModel: ReadModel;
}

export interface AddNoteInput {
  readonly txId: string;
  readonly text: string;
}

export interface EditNoteInput {
  readonly noteId: string;
  readonly text: string;
}

export interface DeleteNoteInput {
  readonly noteId: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateText(raw: unknown): Result<string, NoteError> {
  if (typeof raw !== 'string') {
    return {
      ok: false,
      error: { code: 'TEXT_EMPTY', field: 'text', message: 'text must be a non-empty string' },
    };
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return {
      ok: false,
      error: { code: 'TEXT_EMPTY', field: 'text', message: 'text must be a non-empty string' },
    };
  }
  if (trimmed.length > NOTE_TEXT_MAX) {
    return {
      ok: false,
      error: {
        code: 'TEXT_TOO_LONG',
        field: 'text',
        message: `text must be ${NOTE_TEXT_MAX} characters or fewer`,
      },
    };
  }
  return { ok: true, value: trimmed };
}

function findNote(readModel: ReadModel, noteId: string): { txId: string } | null {
  for (const [txId, notes] of readModel.notes) {
    const found = notes.find((n) => n.id === noteId);
    if (found) return { txId };
  }
  return null;
}

// ---------------------------------------------------------------------------
// addNote
// ---------------------------------------------------------------------------

export function addNote(
  input: AddNoteInput,
  deps: NoteDeps,
): Result<TransactionNoteAddedEvent, NoteError> {
  const txExists = deps.readModel.transactions.some((t) => t.id === input.txId);
  if (!txExists) {
    return {
      ok: false,
      error: {
        code: 'TX_NOT_FOUND',
        field: 'txId',
        message: `transaction '${input.txId}' does not exist`,
      },
    };
  }

  const textResult = validateText(input.text);
  if (!textResult.ok) return textResult;

  const event: TransactionNoteAddedEvent = {
    type: 'tx.note.added',
    id: deps.newId(), // event id (log dedupe key)
    noteId: deps.newId(), // note primary key
    txId: input.txId,
    text: textResult.value,
    createdAt: deps.now().toISOString(),
  };
  return { ok: true, value: event };
}

// ---------------------------------------------------------------------------
// editNote
// ---------------------------------------------------------------------------

export function editNote(
  input: EditNoteInput,
  deps: NoteDeps,
): Result<TransactionNoteEditedEvent, NoteError> {
  const existing = findNote(deps.readModel, input.noteId);
  if (!existing) {
    return {
      ok: false,
      error: {
        code: 'NOTE_NOT_FOUND',
        field: 'noteId',
        message: `note '${input.noteId}' does not exist`,
      },
    };
  }

  const textResult = validateText(input.text);
  if (!textResult.ok) return textResult;

  const event: TransactionNoteEditedEvent = {
    type: 'tx.note.edited',
    id: deps.newId(),
    noteId: input.noteId,
    txId: existing.txId,
    text: textResult.value,
    editedAt: deps.now().toISOString(),
  };
  return { ok: true, value: event };
}

// ---------------------------------------------------------------------------
// deleteNote — hard-delete semantics per Neo's WI-19 spec.
// ---------------------------------------------------------------------------

export function deleteNote(
  input: DeleteNoteInput,
  deps: NoteDeps,
): Result<TransactionNoteDeletedEvent, NoteError> {
  const existing = findNote(deps.readModel, input.noteId);
  if (!existing) {
    return {
      ok: false,
      error: {
        code: 'NOTE_NOT_FOUND',
        field: 'noteId',
        message: `note '${input.noteId}' does not exist`,
      },
    };
  }

  const event: TransactionNoteDeletedEvent = {
    type: 'tx.note.deleted',
    id: deps.newId(),
    noteId: input.noteId,
    txId: existing.txId,
    deletedAt: deps.now().toISOString(),
  };
  return { ok: true, value: event };
}
