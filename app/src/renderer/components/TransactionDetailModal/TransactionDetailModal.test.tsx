// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  function renderModal(tx: RecentTransaction | null) {
    return render(
      <I18nextProvider i18n={i18n}>
        <TransactionDetailModal
          isOpen={tx !== null}
          onClose={() => {}}
          transaction={tx}
          accounts={[mockAccount]}
        />
      </I18nextProvider>,
    );
  }

  it('renders header with date, description, and amount', () => {
    renderModal(baseTx);
    expect(screen.getByText('Donation RETT Europe')).toBeTruthy();
    // Amount rendered via Intl — find the specific amount node by its class.
    const amountNode = document.querySelector('.ot-transaction-detail-modal__amount');
    expect(amountNode).not.toBeNull();
    expect(amountNode?.textContent).toMatch(/150/);
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

  it('renders notes thread container', () => {
    renderModal(baseTx);
    // The thread heading uses the `notes.heading` i18n key.
    expect(screen.getByRole('heading', { name: /Notes|Notas/i })).toBeTruthy();
  });
});
