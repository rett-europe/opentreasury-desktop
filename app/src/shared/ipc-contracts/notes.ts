// Transaction Notes IPC contract — WI-19.
//
// Channels + Zod schemas for the full note lifecycle:
//   - transaction:note:add
//   - transaction:note:list
//   - transaction:note:edit   (future-proofing — Trinity may surface in a later WI)
//   - transaction:note:delete
//
// Error-code discriminated-union response matches the `transaction:create`
// shape so the renderer handles all boundaries uniformly. Notes live alongside
// a transaction and are user annotations (not audit data). Hard-delete
// semantics, no author field in v1, flat wire shape (no envelope) — see Neo's
// WI-19 scope doc in .squad/decisions/inbox/.
//
// Renderer boundary: this module is renderer-safe (no core/ or main/ imports,
// no Electron/Node APIs) per ADR-002 §4.1. Imported by preload bridge + the
// renderer service layer; both see the same types.

import { z } from 'zod';

// ============================================================================
// Channel name constants
// ============================================================================

export const IPC_TRANSACTION_NOTE_ADD = 'transaction:note:add';
export const IPC_TRANSACTION_NOTE_LIST = 'transaction:note:list';
export const IPC_TRANSACTION_NOTE_LIST_ALL = 'transaction:note:listAll';
export const IPC_TRANSACTION_NOTE_EDIT = 'transaction:note:edit';
export const IPC_TRANSACTION_NOTE_DELETE = 'transaction:note:delete';

// ============================================================================
// Constants (exported for UI counters + client-side validation)
// ============================================================================

export const NOTE_TEXT_MAX = 2000;
export const NOTE_TEXT_MAX_LENGTH = NOTE_TEXT_MAX; // legacy alias

// ============================================================================
// Error codes — same shape as transaction:create's discriminated union.
// ============================================================================

export const noteErrorCodeSchema = z.enum([
  'TX_NOT_FOUND',
  'NOTE_NOT_FOUND',
  'TEXT_EMPTY',
  'TEXT_TOO_LONG',
  'SCHEMA_INVALID',
  'INTERNAL',
]);

export type NoteErrorCode = z.infer<typeof noteErrorCodeSchema>;

export const noteErrorSchema = z.object({
  code: noteErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
});

export type NoteError = z.infer<typeof noteErrorSchema>;

// ============================================================================
// Note text normalization helper. add/edit BOTH require non-empty text, so we
// trim at the boundary and reject if empty; distinguishing TEXT_EMPTY vs
// TEXT_TOO_LONG codes is the handler's job.
// ============================================================================

const noteTextInputSchema = z
  .string()
  .transform((v) => v.trim())
  .pipe(z.string().min(1).max(NOTE_TEXT_MAX));

// ============================================================================
// Event mirror schemas — one per note lifecycle event. Kept here (not imported
// from core/) to preserve renderer → shared dependency direction (ADR-002 §4.1).
// ============================================================================

export const transactionNoteAddedEventMirrorSchema = z.object({
  type: z.literal('tx.note.added'),
  id: z.string().length(26),
  noteId: z.string().length(26),
  txId: z.string().length(26),
  text: z.string().min(1).max(NOTE_TEXT_MAX),
  createdAt: z.string().datetime(),
});

export type TransactionNoteAddedEventWire = z.infer<typeof transactionNoteAddedEventMirrorSchema>;

export const transactionNoteEditedEventMirrorSchema = z.object({
  type: z.literal('tx.note.edited'),
  id: z.string().length(26),
  noteId: z.string().length(26),
  txId: z.string().length(26),
  text: z.string().min(1).max(NOTE_TEXT_MAX),
  editedAt: z.string().datetime(),
});

export type TransactionNoteEditedEventWire = z.infer<typeof transactionNoteEditedEventMirrorSchema>;

export const transactionNoteDeletedEventMirrorSchema = z.object({
  type: z.literal('tx.note.deleted'),
  id: z.string().length(26),
  noteId: z.string().length(26),
  txId: z.string().length(26),
  deletedAt: z.string().datetime(),
});

export type TransactionNoteDeletedEventWire = z.infer<
  typeof transactionNoteDeletedEventMirrorSchema
>;

// ============================================================================
// Note read-model shape (renderer consumes via transaction:note:list).
// ============================================================================

export const transactionNoteSchema = z.object({
  id: z.string().length(26),
  txId: z.string().length(26),
  text: z.string().min(1).max(NOTE_TEXT_MAX),
  createdAt: z.string().datetime(),
});

export type TransactionNote = z.infer<typeof transactionNoteSchema>;

// ============================================================================
// transaction:note:add
// ============================================================================

export const addNoteRequestSchema = z.object({
  txId: z.string().length(26),
  text: noteTextInputSchema,
});

export type AddNoteRequest = z.infer<typeof addNoteRequestSchema>;

export const addNoteResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: transactionNoteAddedEventMirrorSchema }),
  z.object({ ok: z.literal(false), error: noteErrorSchema }),
]);

export type AddNoteResponse = z.infer<typeof addNoteResponseSchema>;

// ============================================================================
// transaction:note:list — notes ordered by createdAt ASC.
// ============================================================================

export const listNotesRequestSchema = z.object({
  txId: z.string().length(26),
});

export type ListNotesRequest = z.infer<typeof listNotesRequestSchema>;

export const listNotesResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), notes: z.array(transactionNoteSchema) }),
  z.object({ ok: z.literal(false), error: noteErrorSchema }),
]);

export type ListNotesResponse = z.infer<typeof listNotesResponseSchema>;

// ============================================================================
// transaction:note:listAll — bulk-list every note grouped by transaction ID.
// Powers the Movements search index (SPEC-024): the renderer needs all note
// text up-front to build the haystack, and N round-trips per tx is too slow.
// Wire shape uses a plain object (z.record) so structured-clone keeps it JSON
// safe; the renderer turns it back into a Map.
// ============================================================================

export const listAllNotesRequestSchema = z.object({}).strict();

export type ListAllNotesRequest = z.infer<typeof listAllNotesRequestSchema>;

export const listAllNotesResponseSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    notesByTxId: z.record(z.array(transactionNoteSchema)),
  }),
  z.object({ ok: z.literal(false), error: noteErrorSchema }),
]);

export type ListAllNotesResponse = z.infer<typeof listAllNotesResponseSchema>;

// ============================================================================
// transaction:note:edit — future-proofing. Trinity may or may not surface in WI-19.
// ============================================================================

export const editNoteRequestSchema = z.object({
  noteId: z.string().length(26),
  text: noteTextInputSchema,
});

export type EditNoteRequest = z.infer<typeof editNoteRequestSchema>;

export const editNoteResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: transactionNoteEditedEventMirrorSchema }),
  z.object({ ok: z.literal(false), error: noteErrorSchema }),
]);

export type EditNoteResponse = z.infer<typeof editNoteResponseSchema>;

// ============================================================================
// transaction:note:delete — hard-delete per Neo's spec.
// ============================================================================

export const deleteNoteRequestSchema = z.object({
  noteId: z.string().length(26),
});

export type DeleteNoteRequest = z.infer<typeof deleteNoteRequestSchema>;

export const deleteNoteResponseSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), event: transactionNoteDeletedEventMirrorSchema }),
  z.object({ ok: z.literal(false), error: noteErrorSchema }),
]);

export type DeleteNoteResponse = z.infer<typeof deleteNoteResponseSchema>;
