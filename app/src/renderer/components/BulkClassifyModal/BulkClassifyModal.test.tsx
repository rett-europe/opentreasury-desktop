// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { BulkClassifyModal } from './BulkClassifyModal.js';
import type {
  BulkUpdateTransactionRequest,
  BulkUpdateTransactionResponse,
} from '../../../shared/ipc-contracts/transaction.js';
import type { CategoryRecord } from '../../types/config.js';

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

const categories: CategoryRecord[] = [
  {
    id: '01HCAT0000000000000000CAT1',
    name: 'Payroll',
    kind: 'expense',
    createdAt: '2026-01-01T00:00:00Z',
    isActive: true,
    subcategories: [
      {
        id: '01HSUB0000000000000000SUB1',
        parentCategoryId: '01HCAT0000000000000000CAT1',
        name: 'Salary',
        createdAt: '2026-01-01T00:00:00Z',
        isActive: true,
      },
    ],
  } as unknown as CategoryRecord,
];

function renderModal(opts: {
  onBulkUpdate: (
    input: BulkUpdateTransactionRequest,
  ) => Promise<BulkUpdateTransactionResponse>;
  onSuccess?: () => void;
  onClose?: () => void;
  selectedIds?: string[];
}) {
  const onClose = opts.onClose ?? vi.fn();
  const onSuccess = opts.onSuccess ?? vi.fn();
  return {
    onClose,
    onSuccess,
    onBulkUpdate: opts.onBulkUpdate,
    ...render(
      <I18nextProvider i18n={i18n}>
        <BulkClassifyModal
          isOpen={true}
          onClose={onClose}
          selectedIds={opts.selectedIds ?? ['01HTX10000000000000000TX01', '01HTX20000000000000000TX02']}
          categories={categories}
          onBulkUpdate={opts.onBulkUpdate}
          onSuccess={onSuccess}
        />
      </I18nextProvider>,
    ),
  };
}

describe('BulkClassifyModal', () => {
  it('renders the classify title with the selection count', () => {
    renderModal({ onBulkUpdate: vi.fn() });
    expect(
      screen.getByRole('heading', { name: /Classify 2 transactions|Clasificar 2 movimientos/i }),
    ).not.toBeNull();
  });

  it('submits a bulk-update request with a correlationId and calls onSuccess on ok=true', async () => {
    const onBulkUpdate = vi.fn().mockResolvedValue({
      ok: true,
      updatedCount: 2,
      events: [],
    } as BulkUpdateTransactionResponse);

    const { onSuccess, onClose } = renderModal({
      onBulkUpdate,
      selectedIds: ['01HTXA0000000000000000TXA1', '01HTXB0000000000000000TXB2'],
    });

    fireEvent.click(screen.getByRole('button', { name: /apply|aplicar/i }));

    await waitFor(() => expect(onBulkUpdate).toHaveBeenCalledTimes(1));
    const req = onBulkUpdate.mock.calls[0]![0] as BulkUpdateTransactionRequest;
    expect(req.ids).toEqual(['01HTXA0000000000000000TXA1', '01HTXB0000000000000000TXB2']);
    expect(typeof req.correlationId).toBe('string');
    expect(req.correlationId.length).toBe(26);

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('renders failures and keeps the modal open when the IPC returns ok=false', async () => {
    const onBulkUpdate = vi.fn().mockResolvedValue({
      ok: false,
      failures: [
        { id: 'bad-1', code: 'TX_NOT_FOUND', message: 'Transaction not found' },
      ],
    } as BulkUpdateTransactionResponse);

    const { onSuccess, onClose } = renderModal({ onBulkUpdate });

    fireEvent.click(screen.getByRole('button', { name: /apply|aplicar/i }));

    await waitFor(() => expect(onBulkUpdate).toHaveBeenCalledTimes(1));
    // Failure heading + code should render.
    await waitFor(() => {
      expect(screen.getByText(/TX_NOT_FOUND/)).not.toBeNull();
      expect(screen.getByText(/Transaction not found/)).not.toBeNull();
    });
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables the subcategory picker until a category is picked', () => {
    renderModal({ onBulkUpdate: vi.fn() });
    const sub = screen.getByLabelText(/subcategory|subcategoría/i) as HTMLSelectElement;
    expect(sub.disabled).toBe(true);

    const cat = screen.getByLabelText(/^category$|^categoría$/i) as HTMLSelectElement;
    fireEvent.change(cat, { target: { value: '01HCAT0000000000000000CAT1' } });
    expect(sub.disabled).toBe(false);
    // And the Payroll subcategory is now available.
    expect(screen.getByRole('option', { name: 'Salary' })).not.toBeNull();
  });
});
