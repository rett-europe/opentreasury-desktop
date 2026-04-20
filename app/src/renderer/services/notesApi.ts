// Notes API client — thin wrapper over window.opentreasury.transaction.note.*
// Mirrors existing service layer patterns (importApi.ts / transactionApi.ts).
// WI-19.

import type {
  AddNoteRequest,
  AddNoteResponse,
  ListNotesRequest,
  ListNotesResponse,
  EditNoteRequest,
  EditNoteResponse,
  DeleteNoteRequest,
  DeleteNoteResponse,
} from '../../shared/ipc-contracts/notes.js';

/** Add a new note to a transaction. */
export async function addNote(input: AddNoteRequest): Promise<AddNoteResponse> {
  return window.opentreasury.transaction.note.add(input);
}

/** List all notes for a transaction (oldest first per Neo's spec). */
export async function listNotes(input: ListNotesRequest): Promise<ListNotesResponse> {
  return window.opentreasury.transaction.note.list(input);
}

/** Edit an existing note. Future-proofing — WI-19 UI may not expose. */
export async function editNote(input: EditNoteRequest): Promise<EditNoteResponse> {
  return window.opentreasury.transaction.note.edit(input);
}

/** Hard-delete a note. */
export async function deleteNote(input: DeleteNoteRequest): Promise<DeleteNoteResponse> {
  return window.opentreasury.transaction.note.delete(input);
}
