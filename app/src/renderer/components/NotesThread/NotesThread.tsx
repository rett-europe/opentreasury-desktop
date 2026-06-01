import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Edit, Trash2 } from 'lucide-react';
import { Button } from '../Button/index.js';
import { ConfirmDialog } from '../ConfirmDialog/index.js';
import { useFormatters } from '../../format/index.js';
import * as notesApi from '../../services/notesApi.js';
import { NOTE_TEXT_MAX_LENGTH, type TransactionNote } from '../../../shared/ipc-contracts/notes.js';
import './NotesThread.css';

export interface NotesThreadProps {
  readonly txId: string;
}

type ThreadState =
  | { kind: 'loading' }
  | { kind: 'loaded'; notes: readonly TransactionNote[] }
  | { kind: 'error'; message: string };

/**
 * Notes thread — chronological list + add/delete UI. Lives inside the
 * Transaction Detail modal. Oldest-first ordering matches the backend
 * `transaction:note:list` channel contract.
 */
export function NotesThread({ txId }: NotesThreadProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatDateTime } = useFormatters();
  const [state, setState] = useState<ThreadState>({ kind: 'loading' });
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Per-note edit state. Only one note may be in edit mode at a time.
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [editingSubmitting, setEditingSubmitting] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Delete confirmation — state-driven instead of `window.confirm()` because
  // calling the native confirm from inside an open <dialog> in Electron
  // corrupts keyboard-input routing to the WebContents (every input in the
  // app stops accepting keystrokes until window blur+focus). See
  // ConfirmDialog component header for the full story.
  const [noteToDelete, setNoteToDelete] = useState<TransactionNote | null>(null);

  const refresh = useCallback(async () => {
    try {
      const resp = await notesApi.listNotes({ txId });
      if (!resp.ok) {
        setState({
          kind: 'error',
          message: t(`notes.errors.${resp.error.code}`, { defaultValue: resp.error.message }),
        });
        return;
      }
      setState({ kind: 'loaded', notes: resp.notes });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : t('notes.errors.INTERNAL'),
      });
    }
  }, [txId, t]);

  useEffect(() => {
    setState({ kind: 'loading' });
    void refresh();
  }, [refresh]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const text = draft.trim();
      if (!text) return;
      if (text.length > NOTE_TEXT_MAX_LENGTH) return;
      setSubmitting(true);
      setActionError(null);
      try {
        const resp = await notesApi.addNote({ txId, text });
        if (!resp.ok) {
          setActionError(
            t(`notes.errors.${resp.error.code}`, { defaultValue: resp.error.message }),
          );
          return;
        }
        setDraft('');
        await refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t('notes.errors.INTERNAL'));
      } finally {
        setSubmitting(false);
      }
    },
    [draft, txId, refresh, t],
  );

  const requestDelete = useCallback((note: TransactionNote) => {
    setNoteToDelete(note);
  }, []);

  const cancelDelete = useCallback(() => {
    setNoteToDelete(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    const note = noteToDelete;
    if (!note) return;
    setNoteToDelete(null);
    setActionError(null);
    try {
      const resp = await notesApi.deleteNote({ noteId: note.id });
      if (!resp.ok) {
        setActionError(t(`notes.errors.${resp.error.code}`, { defaultValue: resp.error.message }));
        return;
      }
      await refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t('notes.errors.INTERNAL'));
    }
  }, [noteToDelete, refresh, t]);

  const handleStartEdit = useCallback((note: TransactionNote) => {
    setEditingNoteId(note.id);
    setEditingText(note.text);
    setEditingError(null);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingNoteId(null);
    setEditingText('');
    setEditingError(null);
  }, []);

  const handleSaveEdit = useCallback(
    async (noteId: string) => {
      const text = editingText.trim();
      if (!text) return;
      if (text.length > NOTE_TEXT_MAX_LENGTH) return;
      setEditingSubmitting(true);
      setEditingError(null);
      try {
        const resp = await notesApi.editNote({ noteId, text });
        if (!resp.ok) {
          setEditingError(
            t(`notes.errors.${resp.error.code}`, { defaultValue: resp.error.message }),
          );
          return;
        }
        setEditingNoteId(null);
        setEditingText('');
        await refresh();
      } catch (err) {
        setEditingError(err instanceof Error ? err.message : t('notes.errors.INTERNAL'));
      } finally {
        setEditingSubmitting(false);
      }
    },
    [editingText, refresh, t],
  );

  // Auto-focus the textarea when entering edit mode.
  useEffect(() => {
    if (editingNoteId && editTextareaRef.current) {
      editTextareaRef.current.focus();
      // Move caret to end of existing text.
      const len = editTextareaRef.current.value.length;
      editTextareaRef.current.setSelectionRange(len, len);
    }
  }, [editingNoteId]);

  const editingRemaining = NOTE_TEXT_MAX_LENGTH - editingText.length;
  const editingOverLimit = editingText.length > NOTE_TEXT_MAX_LENGTH;
  const editingEmpty = editingText.trim().length === 0;

  const remaining = NOTE_TEXT_MAX_LENGTH - draft.length;
  const overLimit = draft.length > NOTE_TEXT_MAX_LENGTH;

  return (
    <section className="ot-notes-thread" aria-label={t('notes.heading')}>
      <h3 className="ot-notes-thread__heading">{t('notes.heading')}</h3>

      <form className="ot-notes-thread__form" onSubmit={handleSubmit}>
        <label className="ot-notes-thread__label" htmlFor="ot-notes-thread-input">
          {t('notes.addLabel')}
        </label>
        <textarea
          id="ot-notes-thread-input"
          className="ot-notes-thread__textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={NOTE_TEXT_MAX_LENGTH + 100}
          rows={3}
          placeholder={t('notes.placeholder')}
          aria-describedby="ot-notes-thread-counter"
          disabled={submitting}
        />
        <div className="ot-notes-thread__controls">
          <span
            id="ot-notes-thread-counter"
            className={
              overLimit
                ? 'ot-notes-thread__counter ot-notes-thread__counter--over'
                : 'ot-notes-thread__counter'
            }
            aria-live="polite"
          >
            {t('notes.counter', { remaining })}
          </span>
          <Button
            type="submit"
            variant="primary"
            disabled={submitting || overLimit || draft.trim().length === 0}
          >
            {submitting ? t('common.saving') : t('notes.addButton')}
          </Button>
        </div>
        {actionError ? (
          <div className="ot-notes-thread__error" role="alert">
            {actionError}
          </div>
        ) : null}
      </form>

      <div className="ot-notes-thread__list" aria-live="polite">
        {state.kind === 'loading' ? (
          <p className="ot-notes-thread__placeholder">{t('common.loading')}</p>
        ) : state.kind === 'error' ? (
          <p className="ot-notes-thread__placeholder ot-notes-thread__placeholder--error">
            {state.message}
          </p>
        ) : state.notes.length === 0 ? (
          <p className="ot-notes-thread__placeholder">{t('notes.empty')}</p>
        ) : (
          state.notes.map((note) => {
            const isEditing = editingNoteId === note.id;
            const editInputId = `ot-notes-thread-edit-${note.id}`;
            const editCounterId = `${editInputId}-counter`;
            return (
              <article key={note.id} className="ot-notes-thread__card">
                <header className="ot-notes-thread__card-header">
                  <time className="ot-notes-thread__timestamp" dateTime={note.createdAt}>
                    {formatDateTime(note.createdAt)}
                  </time>
                  {!isEditing && (
                    <div className="ot-notes-thread__card-actions">
                      <button
                        type="button"
                        className="ot-notes-thread__action ot-notes-thread__edit"
                        onClick={() => handleStartEdit(note)}
                        aria-label={t('notes.editAria')}
                        title={t('notes.editAria')}
                        disabled={editingNoteId !== null}
                      >
                        <Edit size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="ot-notes-thread__action ot-notes-thread__delete"
                        onClick={() => requestDelete(note)}
                        aria-label={t('notes.deleteAria')}
                        title={t('notes.deleteAria')}
                        disabled={editingNoteId !== null}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </header>
                {isEditing ? (
                  <div className="ot-notes-thread__edit-form">
                    <label className="ot-notes-thread__edit-label" htmlFor={editInputId}>
                      {t('notes.editLabel')}
                    </label>
                    <textarea
                      id={editInputId}
                      ref={editTextareaRef}
                      className="ot-notes-thread__textarea"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      maxLength={NOTE_TEXT_MAX_LENGTH + 100}
                      rows={3}
                      disabled={editingSubmitting}
                      aria-describedby={editCounterId}
                    />
                    <div className="ot-notes-thread__edit-controls">
                      <span
                        id={editCounterId}
                        className={
                          editingOverLimit
                            ? 'ot-notes-thread__counter ot-notes-thread__counter--over'
                            : 'ot-notes-thread__counter'
                        }
                        aria-live="polite"
                      >
                        {t('notes.counter', { remaining: editingRemaining })}
                      </span>
                      <div className="ot-notes-thread__edit-buttons">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          disabled={editingSubmitting}
                        >
                          {t('notes.editCancelButton')}
                        </Button>
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => void handleSaveEdit(note.id)}
                          disabled={editingSubmitting || editingOverLimit || editingEmpty}
                        >
                          {editingSubmitting ? t('common.saving') : t('notes.editSaveButton')}
                        </Button>
                      </div>
                    </div>
                    {editingError ? (
                      <div className="ot-notes-thread__error" role="alert">
                        {editingError}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="ot-notes-thread__text">{note.text}</p>
                )}
              </article>
            );
          })
        )}
      </div>

      <ConfirmDialog
        isOpen={noteToDelete !== null}
        title={t('notes.deleteConfirmTitle')}
        message={t('notes.deleteConfirm')}
        confirmLabel={t('notes.deleteConfirmCta')}
        variant="destructive"
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={cancelDelete}
      />
    </section>
  );
}
