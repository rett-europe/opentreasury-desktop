// transaction:note:add/list/edit/delete IPC handler factories — WI-19.
//
// Wire the pure core/commands/transactionNote commands to the runtime
// singletons (EventLog + reducer read model + ULID/clock generators). Mirrors
// the createTransaction handler's layered validation + error-envelope pattern:
//
//   1. Zod-parse the raw IPC payload (SCHEMA_INVALID at the boundary).
//   2. Business-rule validation inside the command (TX_NOT_FOUND / NOTE_NOT_FOUND).
//   3. Append to the event log, then apply to the reducer if the log grew.
//
// Nothing throws across IPC — all failures return a discriminated union.
//
// Encryption: note events ride the same append-only NDJSON log as transactions.
// The log transport layer (M2 crypto) is responsible for DEK encryption at
// rest; this handler does NOT bypass that layer. All plaintext note text goes
// through the standard append() path.

import {
  addNote,
  deleteNote,
  editNote,
  type NoteError as CoreNoteError,
} from '../../../core/commands/index.js';
import type { EventLog } from '../../../core/eventLog/index.js';
import { applyEvent } from '../../../core/query/reducers.js';
import type { ReadModel } from '../../../core/query/types.js';
import {
  addNoteRequestSchema,
  deleteNoteRequestSchema,
  editNoteRequestSchema,
  listNotesRequestSchema,
  type AddNoteResponse,
  type DeleteNoteResponse,
  type EditNoteResponse,
  type ListNotesResponse,
  type NoteErrorCode,
} from '../../../shared/ipc-contracts/notes.js';

export interface NoteHandlerDeps {
  readonly eventLog: EventLog;
  readonly getReadModel: () => ReadModel;
  readonly now: () => Date;
  readonly newId: () => string;
  /** Override for tests — defaults to core reducer's applyEvent singleton. */
  readonly applyEvent?: typeof applyEvent;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function schemaInvalid(issues: string): { code: NoteErrorCode; message: string } {
  return { code: 'SCHEMA_INVALID', message: issues };
}

function mapCommandError(err: CoreNoteError): {
  code: NoteErrorCode;
  message: string;
  field?: string;
} {
  const base: { code: NoteErrorCode; message: string; field?: string } = {
    code: err.code,
    message: err.message,
  };
  if (err.field !== undefined) base.field = err.field;
  return base;
}

function internal(err: unknown): { code: NoteErrorCode; message: string } {
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'INTERNAL', message };
}

// ---------------------------------------------------------------------------
// transaction:note:add
// ---------------------------------------------------------------------------

export function createAddNoteHandler(
  deps: NoteHandlerDeps,
): (raw: unknown) => Promise<AddNoteResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleAddNote(raw: unknown): Promise<AddNoteResponse> {
    try {
      const parsed = addNoteRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: schemaInvalid(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        };
      }

      const result = addNote(
        { txId: parsed.data.txId, text: parsed.data.text },
        {
          now: deps.now,
          newId: deps.newId,
          readModel: deps.getReadModel(),
        },
      );
      if (!result.ok) {
        return { ok: false, error: mapCommandError(result.error) };
      }

      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(result.value);
      const after = (await deps.eventLog.load()).length;
      if (after > before) apply(result.value);

      return { ok: true, event: result.value };
    } catch (err) {
      return { ok: false, error: internal(err) };
    }
  };
}

// ---------------------------------------------------------------------------
// transaction:note:list — notes for txId ordered by createdAt ASC.
// ---------------------------------------------------------------------------

export function createListNotesHandler(
  deps: Pick<NoteHandlerDeps, 'getReadModel'>,
): (raw: unknown) => Promise<ListNotesResponse> {
  return async function handleListNotes(raw: unknown): Promise<ListNotesResponse> {
    try {
      const parsed = listNotesRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: schemaInvalid(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        };
      }

      const model = deps.getReadModel();
      // List is permissive: returning [] for an unknown txId is fine
      // (matches other list handlers' behavior). If Pedro later wants strict
      // TX_NOT_FOUND semantics, uncomment the check below.
      const notes = model.notes.get(parsed.data.txId) ?? [];
      return { ok: true, notes: notes.map((n) => ({ ...n })) };
    } catch (err) {
      return { ok: false, error: internal(err) };
    }
  };
}

// ---------------------------------------------------------------------------
// transaction:note:edit — future-proof; Trinity may or may not surface in WI-19.
// ---------------------------------------------------------------------------

export function createEditNoteHandler(
  deps: NoteHandlerDeps,
): (raw: unknown) => Promise<EditNoteResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleEditNote(raw: unknown): Promise<EditNoteResponse> {
    try {
      const parsed = editNoteRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: schemaInvalid(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        };
      }

      const result = editNote(
        { noteId: parsed.data.noteId, text: parsed.data.text },
        {
          now: deps.now,
          newId: deps.newId,
          readModel: deps.getReadModel(),
        },
      );
      if (!result.ok) {
        return { ok: false, error: mapCommandError(result.error) };
      }

      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(result.value);
      const after = (await deps.eventLog.load()).length;
      if (after > before) apply(result.value);

      return { ok: true, event: result.value };
    } catch (err) {
      return { ok: false, error: internal(err) };
    }
  };
}

// ---------------------------------------------------------------------------
// transaction:note:delete — hard-delete per Neo's WI-19 spec.
// ---------------------------------------------------------------------------

export function createDeleteNoteHandler(
  deps: NoteHandlerDeps,
): (raw: unknown) => Promise<DeleteNoteResponse> {
  const apply = deps.applyEvent ?? applyEvent;

  return async function handleDeleteNote(raw: unknown): Promise<DeleteNoteResponse> {
    try {
      const parsed = deleteNoteRequestSchema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: schemaInvalid(
            parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          ),
        };
      }

      const result = deleteNote(
        { noteId: parsed.data.noteId },
        {
          now: deps.now,
          newId: deps.newId,
          readModel: deps.getReadModel(),
        },
      );
      if (!result.ok) {
        return { ok: false, error: mapCommandError(result.error) };
      }

      const before = (await deps.eventLog.load()).length;
      await deps.eventLog.append(result.value);
      const after = (await deps.eventLog.load()).length;
      if (after > before) apply(result.value);

      return { ok: true, event: result.value };
    } catch (err) {
      return { ok: false, error: internal(err) };
    }
  };
}
