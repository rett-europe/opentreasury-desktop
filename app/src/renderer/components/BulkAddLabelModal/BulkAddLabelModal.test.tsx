// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { BulkAddLabelModal } from './BulkAddLabelModal.js';
import type {
  BulkAddLabelTransactionRequest,
  BulkAddLabelTransactionResponse,
} from '../../../shared/ipc-contracts/transaction.js';
import type { TagRecord } from '../../types/config.js';

// jsdom doesn't implement HTMLDialogElement.showModal; stub to no-op.
beforeEach(() => {
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

const tags: TagRecord[] = [
  {
    id: '01HTAG0000000000000000TAG1',
    name: 'Travel',
    sortOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '01HTAG0000000000000000TAG2',
    name: 'Subscriptions',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '01HTAG0000000000000000TAG3',
    name: 'Archived Tag',
    sortOrder: 2,
    createdAt: '2026-01-01T00:00:00Z',
    archivedAt: '2026-02-01T00:00:00Z',
  },
];

function renderModal(opts: {
  onBulkAddLabel: (
    input: BulkAddLabelTransactionRequest,
  ) => Promise<BulkAddLabelTransactionResponse>;
  onSuccess?: () => void;
  onClose?: () => void;
  selectedIds?: string[];
  tags?: TagRecord[];
}) {
  const onClose = opts.onClose ?? vi.fn();
  const onSuccess = opts.onSuccess ?? vi.fn();
  return {
    onClose,
    onSuccess,
    onBulkAddLabel: opts.onBulkAddLabel,
    ...render(
      <I18nextProvider i18n={i18n}>
        <BulkAddLabelModal
          isOpen={true}
          onClose={onClose}
          selectedIds={
            opts.selectedIds ?? ['01HTX10000000000000000TX01', '01HTX20000000000000000TX02']
          }
          tags={opts.tags ?? tags}
          onBulkAddLabel={opts.onBulkAddLabel}
          onSuccess={onSuccess}
        />
      </I18nextProvider>,
    ),
  };
}

describe('BulkAddLabelModal', () => {
  it('renders the title with the selection count and the available labels', () => {
    renderModal({ onBulkAddLabel: vi.fn() });
    expect(
      screen.getByRole('heading', { name: /Label 2 transactions|Etiquetar 2 movimientos/i }),
    ).not.toBeNull();
    // Active tags appear; archived tag does NOT.
    expect(screen.getByRole('option', { name: 'Travel' })).not.toBeNull();
    expect(screen.getByRole('option', { name: 'Subscriptions' })).not.toBeNull();
    expect(screen.queryByRole('option', { name: 'Archived Tag' })).toBeNull();
  });

  it('keeps the Apply button disabled until a label is selected', () => {
    renderModal({ onBulkAddLabel: vi.fn() });
    const apply = screen.getByRole('button', { name: /apply|aplicar/i }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);

    const select = screen.getByLabelText(/^label$|^etiqueta$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '01HTAG0000000000000000TAG1' } });
    expect(apply.disabled).toBe(false);
  });

  it('submits a bulk-add-label request with a correlationId and calls onSuccess on ok=true', async () => {
    const onBulkAddLabel = vi.fn().mockResolvedValue({
      ok: true,
      results: [
        { id: '01HTXA0000000000000000TXA1', status: 'updated' },
        { id: '01HTXB0000000000000000TXB2', status: 'updated' },
      ],
      events: [],
      updatedCount: 2,
      skippedAlreadyHadCount: 0,
      skippedSplitParentCount: 0,
    } as BulkAddLabelTransactionResponse);

    const { onSuccess, onClose } = renderModal({
      onBulkAddLabel,
      selectedIds: ['01HTXA0000000000000000TXA1', '01HTXB0000000000000000TXB2'],
    });

    const select = screen.getByLabelText(/^label$|^etiqueta$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '01HTAG0000000000000000TAG2' } });

    fireEvent.click(screen.getByRole('button', { name: /apply|aplicar/i }));

    await waitFor(() => expect(onBulkAddLabel).toHaveBeenCalledTimes(1));
    const req = onBulkAddLabel.mock.calls[0]![0] as BulkAddLabelTransactionRequest;
    expect(req.ids).toEqual(['01HTXA0000000000000000TXA1', '01HTXB0000000000000000TXB2']);
    expect(req.tagId).toBe('01HTAG0000000000000000TAG2');
    expect(typeof req.correlationId).toBe('string');
    expect(req.correlationId.length).toBe(26);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('renders failures and keeps the modal open when the IPC returns ok=false', async () => {
    const onBulkAddLabel = vi.fn().mockResolvedValue({
      ok: false,
      failures: [{ id: 'bad-1', code: 'TX_NOT_FOUND', message: 'Transaction not found' }],
    } as BulkAddLabelTransactionResponse);

    const { onSuccess, onClose } = renderModal({ onBulkAddLabel });

    const select = screen.getByLabelText(/^label$|^etiqueta$/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '01HTAG0000000000000000TAG1' } });

    fireEvent.click(screen.getByRole('button', { name: /apply|aplicar/i }));

    await waitFor(() => expect(onBulkAddLabel).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(screen.getByText(/TX_NOT_FOUND/)).not.toBeNull();
      expect(screen.getByText(/Transaction not found/)).not.toBeNull();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('invokes onClose when Cancel is clicked', () => {
    const onBulkAddLabel = vi.fn();
    const { onClose } = renderModal({ onBulkAddLabel });
    fireEvent.click(screen.getByRole('button', { name: /^cancel(ar)?$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onBulkAddLabel).not.toHaveBeenCalled();
  });

  it('renders the empty-state copy when no labels are available', () => {
    renderModal({ onBulkAddLabel: vi.fn(), tags: [] });
    expect(screen.getByText(/no labels available|no hay etiquetas disponibles/i)).not.toBeNull();
    const apply = screen.getByRole('button', { name: /apply|aplicar/i }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });
});
