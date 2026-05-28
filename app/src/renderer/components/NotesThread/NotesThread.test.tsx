// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { NotesThread } from './NotesThread.js';
import type {
  AddNoteResponse,
  ListNotesResponse,
  DeleteNoteResponse,
  EditNoteResponse,
} from '../../../shared/ipc-contracts/notes.js';

const TX_ID = '01HZTX00000000000000000000';
const NOTE_ID = '01HZNOTE000000000000000000';

type NoteBridge = {
  add: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
  edit: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function mountBridge(bridge: Partial<NoteBridge>): NoteBridge {
  const full: NoteBridge = {
    add: vi.fn(),
    list: vi.fn(),
    edit: vi.fn(),
    delete: vi.fn(),
    ...bridge,
  };
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    transaction: { note: full },
  };
  return full;
}

function renderThread() {
  return render(
    <I18nextProvider i18n={i18n}>
      <NotesThread txId={TX_ID} />
    </I18nextProvider>,
  );
}

describe('NotesThread', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
    // jsdom doesn't implement HTMLDialogElement.{showModal, close}; stub so
    // the in-tree ConfirmDialog (which replaced window.confirm for note
    // deletion to fix the trial.3.12 frozen-inputs bug) can open. Guarded
    // so we don't reinstall over a previous polyfill across tests.
    if (typeof HTMLDialogElement !== 'undefined') {
      if (!HTMLDialogElement.prototype.showModal) {
        HTMLDialogElement.prototype.showModal = function showModal() {
          this.setAttribute('open', '');
        };
      }
      if (!HTMLDialogElement.prototype.close) {
        HTMLDialogElement.prototype.close = function close() {
          this.removeAttribute('open');
        };
      }
    }
  });

  it('renders empty-state message when no notes exist', async () => {
    const listResp: ListNotesResponse = { ok: true, notes: [] };
    mountBridge({ list: vi.fn().mockResolvedValue(listResp) });

    renderThread();

    await waitFor(() => {
      expect(screen.getByText(/No notes yet|Aún no hay notas/i)).toBeTruthy();
    });
  });

  it('lists notes returned by the bridge (oldest first)', async () => {
    const listResp: ListNotesResponse = {
      ok: true,
      notes: [
        { id: NOTE_ID, txId: TX_ID, text: 'First note', createdAt: '2026-04-20T10:32:00Z' },
        {
          id: '01HZNOTE000000000000000002',
          txId: TX_ID,
          text: 'Second note',
          createdAt: '2026-04-21T14:05:00Z',
        },
      ],
    };
    mountBridge({ list: vi.fn().mockResolvedValue(listResp) });

    renderThread();

    await waitFor(() => {
      expect(screen.getByText('First note')).toBeTruthy();
    });
    expect(screen.getByText('Second note')).toBeTruthy();
  });

  it('submits a note via addNote and refreshes the list afterward', async () => {
    const listFn = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, notes: [] } satisfies ListNotesResponse)
      .mockResolvedValueOnce({
        ok: true,
        notes: [
          { id: NOTE_ID, txId: TX_ID, text: 'Fresh note', createdAt: '2026-04-20T10:32:00Z' },
        ],
      } satisfies ListNotesResponse);
    const addResp: AddNoteResponse = {
      ok: true,
      event: {
        type: 'tx.note.added',
        id: NOTE_ID,
        txId: TX_ID,
        text: 'Fresh note',
        createdAt: '2026-04-20T10:32:00Z',
      },
    };
    const addFn = vi.fn().mockResolvedValue(addResp);
    mountBridge({ list: listFn, add: addFn });

    renderThread();

    await waitFor(() => {
      expect(screen.getByText(/No notes yet|Aún no hay notas/i)).toBeTruthy();
    });

    const textarea = screen.getByLabelText(/Add a note|Añadir una nota/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Fresh note' } });
    const submit = screen.getByRole('button', { name: /^Add$|^Añadir$/ });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(addFn).toHaveBeenCalledWith({ txId: TX_ID, text: 'Fresh note' });
    });
    await waitFor(() => {
      expect(screen.getByText('Fresh note')).toBeTruthy();
    });
    expect(listFn).toHaveBeenCalledTimes(2);
  });

  it('shows a ConfirmDialog and deletes a note after confirmation, then re-fetches the list', async () => {
    const listFn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        notes: [{ id: NOTE_ID, txId: TX_ID, text: 'doomed', createdAt: '2026-04-20T10:32:00Z' }],
      } satisfies ListNotesResponse)
      .mockResolvedValueOnce({ ok: true, notes: [] } satisfies ListNotesResponse);
    const deleteResp: DeleteNoteResponse = {
      ok: true,
      event: {
        type: 'tx.note.deleted',
        id: NOTE_ID,
        txId: TX_ID,
        deletedAt: '2026-04-22T09:00:00Z',
      },
    };
    const deleteFn = vi.fn().mockResolvedValue(deleteResp);
    mountBridge({ list: listFn, delete: deleteFn });

    // We REPLACED window.confirm with a state-driven dialog to avoid
    // freezing renderer keyboard input (trial.3.12 bug). Assert window.confirm
    // is never called, then interact with the new confirm dialog instead.
    const confirmSpy = vi.spyOn(window, 'confirm');

    renderThread();

    await waitFor(() => {
      expect(screen.getByText('doomed')).toBeTruthy();
    });

    const delBtn = screen.getByRole('button', { name: /Delete note|Eliminar nota/i });
    fireEvent.click(delBtn);

    // The confirm dialog should now be open. Find it by role=alertdialog
    // and click its destructive Delete button.
    const confirmDialog = await waitFor(() => {
      const dlg = screen.getByRole('alertdialog');
      expect(dlg).toBeTruthy();
      return dlg;
    });
    expect(confirmDialog.textContent ?? '').toMatch(/Delete this note|¿Eliminar esta nota/i);

    // The destructive variant — find the danger-styled button (not the
    // ghost Cancel).
    const dangerBtn = confirmDialog.querySelector(
      '.ot-button--destructive',
    ) as HTMLButtonElement | null;
    expect(dangerBtn).not.toBeNull();
    fireEvent.click(dangerBtn!);

    await waitFor(() => {
      expect(deleteFn).toHaveBeenCalledWith({ noteId: NOTE_ID });
    });
    await waitFor(() => {
      expect(screen.getByText(/No notes yet|Aún no hay notas/i)).toBeTruthy();
    });

    // The whole point of this fix: the native window.confirm() must
    // never have been called.
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('cancels the delete when the user clicks Cancel in the ConfirmDialog', async () => {
    const listFn = vi.fn().mockResolvedValue({
      ok: true,
      notes: [{ id: NOTE_ID, txId: TX_ID, text: 'safe', createdAt: '2026-04-20T10:32:00Z' }],
    } satisfies ListNotesResponse);
    const deleteFn = vi.fn();
    mountBridge({ list: listFn, delete: deleteFn });

    renderThread();

    await waitFor(() => expect(screen.getByText('safe')).toBeTruthy());

    const delBtn = screen.getByRole('button', { name: /Delete note|Eliminar nota/i });
    fireEvent.click(delBtn);

    const confirmDialog = await waitFor(() => screen.getByRole('alertdialog'));
    const cancelBtn = confirmDialog.querySelector('.ot-button--ghost') as HTMLButtonElement | null;
    expect(cancelBtn).not.toBeNull();
    fireEvent.click(cancelBtn!);

    // No delete IPC, and the note is still there.
    expect(deleteFn).not.toHaveBeenCalled();
    expect(screen.getByText('safe')).toBeTruthy();
  });

  it('surfaces backend errors with localized messages', async () => {
    const listFn = vi.fn().mockResolvedValue({
      ok: true,
      notes: [],
    } satisfies ListNotesResponse);
    const addFn = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'TEXT_TOO_LONG', message: 'raw' },
    } satisfies AddNoteResponse);
    mountBridge({ list: listFn, add: addFn });

    renderThread();

    await waitFor(() => {
      expect(screen.getByText(/No notes yet|Aún no hay notas/i)).toBeTruthy();
    });

    const textarea = screen.getByLabelText(/Add a note|Añadir una nota/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'x'.repeat(10) } });
    const submit = screen.getByRole('button', { name: /^Add$|^Añadir$/ });
    fireEvent.click(submit);

    await waitFor(() => {
      expect(screen.getByText(/Note is too long|Nota demasiado larga/i)).toBeTruthy();
    });
  });

  describe('edit-note flow', () => {
    const ORIGINAL_TEXT = 'original text';
    const UPDATED_TEXT = 'updated text';

    function setupWithSingleNote(opts?: { editResp?: EditNoteResponse }): {
      editFn: ReturnType<typeof vi.fn>;
      listFn: ReturnType<typeof vi.fn>;
    } {
      const listFn = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          notes: [
            { id: NOTE_ID, txId: TX_ID, text: ORIGINAL_TEXT, createdAt: '2026-04-20T10:32:00Z' },
          ],
        } satisfies ListNotesResponse)
        .mockResolvedValueOnce({
          ok: true,
          notes: [
            { id: NOTE_ID, txId: TX_ID, text: UPDATED_TEXT, createdAt: '2026-04-20T10:32:00Z' },
          ],
        } satisfies ListNotesResponse);
      const editResp: EditNoteResponse = opts?.editResp ?? {
        ok: true,
        event: {
          type: 'tx.note.edited',
          id: NOTE_ID,
          noteId: NOTE_ID,
          txId: TX_ID,
          text: UPDATED_TEXT,
          editedAt: '2026-04-22T09:00:00Z',
        },
      };
      const editFn = vi.fn().mockResolvedValue(editResp);
      mountBridge({ list: listFn, edit: editFn });
      return { editFn, listFn };
    }

    it('exposes an Edit button for each note', async () => {
      setupWithSingleNote();
      renderThread();
      await waitFor(() => {
        expect(screen.getByText(ORIGINAL_TEXT)).toBeTruthy();
      });
      expect(screen.getByRole('button', { name: /Edit note|Editar nota/i })).toBeTruthy();
    });

    it('opens an inline textarea pre-filled with the note text when Edit is clicked', async () => {
      setupWithSingleNote();
      renderThread();
      await waitFor(() => {
        expect(screen.getByText(ORIGINAL_TEXT)).toBeTruthy();
      });
      fireEvent.click(screen.getByRole('button', { name: /Edit note|Editar nota/i }));
      const ta = screen.getByLabelText(
        /Edit note text|Editar texto de la nota/i,
      ) as HTMLTextAreaElement;
      expect(ta.value).toBe(ORIGINAL_TEXT);
    });

    it('cancels edit without calling editNote and keeps the original text', async () => {
      const { editFn } = setupWithSingleNote();
      renderThread();
      await waitFor(() => {
        expect(screen.getByText(ORIGINAL_TEXT)).toBeTruthy();
      });
      fireEvent.click(screen.getByRole('button', { name: /Edit note|Editar nota/i }));
      const ta = screen.getByLabelText(
        /Edit note text|Editar texto de la nota/i,
      ) as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: 'discarded' } });
      fireEvent.click(screen.getByRole('button', { name: /^Cancel$|^Cancelar$/ }));
      expect(editFn).not.toHaveBeenCalled();
      expect(screen.getByText(ORIGINAL_TEXT)).toBeTruthy();
    });

    it('saves edited note via editNote and refreshes the list', async () => {
      const { editFn } = setupWithSingleNote();
      renderThread();
      await waitFor(() => {
        expect(screen.getByText(ORIGINAL_TEXT)).toBeTruthy();
      });
      fireEvent.click(screen.getByRole('button', { name: /Edit note|Editar nota/i }));
      const ta = screen.getByLabelText(
        /Edit note text|Editar texto de la nota/i,
      ) as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: UPDATED_TEXT } });
      fireEvent.click(screen.getByRole('button', { name: /^Save$|^Guardar$/ }));
      await waitFor(() => {
        expect(editFn).toHaveBeenCalledWith({ noteId: NOTE_ID, text: UPDATED_TEXT });
      });
      await waitFor(() => {
        expect(screen.getByText(UPDATED_TEXT)).toBeTruthy();
      });
    });

    it('disables Save when text is empty or trimmed-empty', async () => {
      setupWithSingleNote();
      renderThread();
      await waitFor(() => {
        expect(screen.getByText(ORIGINAL_TEXT)).toBeTruthy();
      });
      fireEvent.click(screen.getByRole('button', { name: /Edit note|Editar nota/i }));
      const ta = screen.getByLabelText(
        /Edit note text|Editar texto de la nota/i,
      ) as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: '   ' } });
      const save = screen.getByRole('button', { name: /^Save$|^Guardar$/ }) as HTMLButtonElement;
      expect(save.disabled).toBe(true);
    });

    it('surfaces backend edit errors with localized messages', async () => {
      setupWithSingleNote({
        editResp: { ok: false, error: { code: 'TEXT_TOO_LONG', message: 'raw' } },
      });
      renderThread();
      await waitFor(() => {
        expect(screen.getByText(ORIGINAL_TEXT)).toBeTruthy();
      });
      fireEvent.click(screen.getByRole('button', { name: /Edit note|Editar nota/i }));
      const ta = screen.getByLabelText(
        /Edit note text|Editar texto de la nota/i,
      ) as HTMLTextAreaElement;
      fireEvent.change(ta, { target: { value: 'something new' } });
      fireEvent.click(screen.getByRole('button', { name: /^Save$|^Guardar$/ }));
      await waitFor(() => {
        expect(screen.getByText(/Note is too long|Nota demasiado larga/i)).toBeTruthy();
      });
    });
  });
});
