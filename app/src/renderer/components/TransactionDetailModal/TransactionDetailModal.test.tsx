// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { TransactionDetailModal } from './TransactionDetailModal.js';
import type { Account, RecentTransaction } from '../../../shared/ipc-contracts/panel.js';

// jsdom doesn't implement HTMLDialogElement.showModal; stub to no-op so the
// component doesn't throw when it tries to open.
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

const mockAccount: Account = {
  id: '01HACC0000000000000000ACC1',
  bankName: 'Test Bank',
  bankNameShort: 'TestBank',
  accountLabel: 'Ops Account',
  color: '#9b72cf',
  sortOrder: 0,
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
};

const baseTx: RecentTransaction = {
  id: '01HZTX00000000000000000000',
  date: '2026-04-20',
  type: 'income',
  amount: 150,
  currency: 'EUR',
  description: 'Donation RETT Europe',
  accountId: mockAccount.id,
  categoryId: null,
  subcategoryId: null,
  tagIds: [],
  status: 'approved',
  createdAt: '2026-04-20T10:32:00Z',
};

function mountBridge(): void {
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    transaction: {
      note: {
        add: vi.fn(),
        list: vi.fn().mockResolvedValue({ ok: true, notes: [] }),
        edit: vi.fn(),
        delete: vi.fn(),
      },
    },
  };
}

describe('TransactionDetailModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mountBridge();
  });

  function renderModal(
    tx: RecentTransaction | null,
    props?: { onUpdate?: () => void; onDelete?: () => void },
  ) {
    return render(
      <I18nextProvider i18n={i18n}>
        <TransactionDetailModal
          isOpen={tx !== null}
          onClose={() => {}}
          transaction={tx}
          accounts={[mockAccount]}
          onUpdate={props?.onUpdate ?? vi.fn()}
          onDelete={props?.onDelete ?? vi.fn()}
        />
      </I18nextProvider>,
    );
  }

  it('renders read-only view by default', async () => {
    renderModal(baseTx);
    expect(await screen.findByText('Donation RETT Europe')).toBeTruthy();
    // Amount rendered via Intl — find the specific amount node by its class.
    const amountNode = document.querySelector('.ot-transaction-detail-modal__amount');
    expect(amountNode).not.toBeNull();
    expect(amountNode?.textContent).toMatch(/150/);
    // Edit button should be visible in read-only mode
    expect(screen.getByRole('button', { name: /Edit|Editar/i })).toBeTruthy();
  });

  it('swaps to edit mode when Edit button is clicked (in-place swap, no second modal)', () => {
    renderModal(baseTx);
    const editButton = screen.getByRole('button', { name: /Edit|Editar/i });
    fireEvent.click(editButton);

    // After clicking Edit, the same modal should now show the form fields
    // The modal title should change from "Transaction detail" to "Edit Transaction"
    expect(
      screen.getByRole('heading', { name: /Edit Transaction|Editar Movimiento/i }),
    ).toBeTruthy();

    // Edit mode shows editable metadata fields (Account, Category, Status, etc.)
    // Date/Description/Amount remain read-only in summary header (same as view mode)
    expect(screen.getByLabelText(/Account|Cuenta/i)).toBeTruthy();
    expect(screen.getByLabelText(/Status|Estado/i)).toBeTruthy();

    // Footer should now show "Cancel" and "Save" buttons instead of "Edit" and "Close"
    expect(screen.getByRole('button', { name: /Cancel|Cancelar/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Save|Guardar/i })).toBeTruthy();

    // Original "Edit" button should no longer be visible
    expect(screen.queryByRole('button', { name: /^Edit$|^Editar$/i })).toBeNull();

    // Delete button should be hidden during edit mode
    expect(screen.queryByRole('button', { name: /Delete|Eliminar/i })).toBeNull();
  });

  it('reverts to read-only mode when Cancel is clicked', () => {
    renderModal(baseTx);
    const editButton = screen.getByRole('button', { name: /Edit|Editar/i });
    fireEvent.click(editButton);

    // Now in edit mode
    const cancelButton = screen.getByRole('button', { name: /Cancel|Cancelar/i });
    fireEvent.click(cancelButton);

    // Should be back to read-only mode — Edit button visible again
    expect(screen.getByRole('button', { name: /Edit|Editar/i })).toBeTruthy();
    // Save/Cancel buttons should be gone
    expect(screen.queryByRole('button', { name: /Cancel|Cancelar/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save|Guardar/i })).toBeNull();
  });

  it('shows reference and details blocks when present', () => {
    renderModal({ ...baseTx, reference: 'INV-2026-0042', details: 'Monthly donation' });
    expect(screen.getByText('INV-2026-0042')).toBeTruthy();
    expect(screen.getByText('Monthly donation')).toBeTruthy();
  });

  it('hides reference and details blocks when null/undefined', () => {
    renderModal(baseTx);
    expect(screen.queryByText('INV-2026-0042')).toBeNull();
  });

  it('renders notes thread container in read-only mode', () => {
    renderModal(baseTx);
    // The thread heading uses the `notes.heading` i18n key.
    expect(screen.getByRole('heading', { name: /Notes|Notas/i })).toBeTruthy();
  });

  it('hides notes thread in edit mode (edit body takes over)', () => {
    renderModal(baseTx);
    const editButton = screen.getByRole('button', { name: /Edit|Editar/i });
    fireEvent.click(editButton);

    // Notes thread should not be visible in edit mode
    expect(screen.queryByRole('heading', { name: /Notes|Notas/i })).toBeNull();
  });
});
