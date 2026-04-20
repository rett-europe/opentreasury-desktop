import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button } from '../Button/index.js';
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

function formatTimestamp(iso: string): string {
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(navigator.language, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch {
    return iso;
  }
}

/**
 * Notes thread — chronological list + add/delete UI. Lives inside the
 * Transaction Detail modal. Oldest-first ordering matches the backend
 * `transaction:note:list` channel contract.
 */
export function NotesThread({ txId }: NotesThreadProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<ThreadState>({ kind: 'loading' });
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const handleDelete = useCallback(
    async (note: TransactionNote) => {
      // eslint-disable-next-line no-alert
      if (!window.confirm(t('notes.deleteConfirm'))) return;
      setActionError(null);
      try {
        const resp = await notesApi.deleteNote({ noteId: note.id });
        if (!resp.ok) {
          setActionError(
            t(`notes.errors.${resp.error.code}`, { defaultValue: resp.error.message }),
          );
          return;
        }
        await refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : t('notes.errors.INTERNAL'));
      }
    },
    [refresh, t],
  );

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
          state.notes.map((note) => (
            <article key={note.id} className="ot-notes-thread__card">
              <header className="ot-notes-thread__card-header">
                <time className="ot-notes-thread__timestamp" dateTime={note.createdAt}>
                  {formatTimestamp(note.createdAt)}
                </time>
                <button
                  type="button"
                  className="ot-notes-thread__delete"
                  onClick={() => handleDelete(note)}
                  aria-label={t('notes.deleteAria')}
                  title={t('notes.deleteAria')}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </header>
              <p className="ot-notes-thread__text">{note.text}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
