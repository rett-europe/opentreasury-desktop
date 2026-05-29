// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { AddTransactionModal } from './AddTransactionModal.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import type { CreateTransactionRequest } from '../../../shared/ipc-contracts/transaction.js';

// jsdom doesn't implement HTMLDialogElement.showModal; stub to no-op so the
// component doesn't throw when it tries to open the modal.
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

const mockAccounts: Account[] = [
  {
    id: 'acc-1',
    bankName: 'Test Bank',
    bankNameShort: 'TestBank',
    accountLabel: 'Test Account 1',
    color: '#9b72cf',
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
];

describe('AddTransactionModal', () => {
  const onClose = vi.fn();
  const onSubmit = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderModal(isOpen = true) {
    return render(
      <I18nextProvider i18n={i18n}>
        <AddTransactionModal
          isOpen={isOpen}
          onClose={onClose}
          onSubmit={onSubmit}
          accounts={mockAccounts}
        />
      </I18nextProvider>,
    );
  }

  it.skip('renders modal when isOpen is true', () => {
    renderModal(true);

    // Check that the dialog element exists
    const dialog = document.querySelector('dialog');
    expect(dialog).toBeTruthy();
  });

  it.skip('modal contains form fields', () => {
    renderModal(true);

    // Check that form inputs are present (by ID since labels might not be properly associated in jsdom)
    expect(document.getElementById('tx-date')).toBeTruthy();
    expect(document.getElementById('tx-type')).toBeTruthy();
    expect(document.getElementById('tx-amount')).toBeTruthy();
    expect(document.getElementById('tx-description')).toBeTruthy();
    expect(document.getElementById('tx-account')).toBeTruthy();
  });

  it.skip('renders cancel and submit buttons', () => {
    renderModal(true);

    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  // ES locale sweep — regression for the comma-decimal bug Pedro hit during
  // trial.3.13 integration testing. The amount input must accept both
  // `1331,85` (Spanish decimal) and `1.331,85` (Spanish thousands + decimal)
  // and forward the correct numeric value to the IPC submit handler.
  describe('comma-decimal amount input (ES locale sweep)', () => {
    async function submitWithAmount(typed: string): Promise<CreateTransactionRequest> {
      onSubmit.mockResolvedValue(undefined);
      renderModal(true);

      const amountInput = document.getElementById('tx-amount') as HTMLInputElement;
      const descriptionInput = document.getElementById('tx-description') as HTMLInputElement;
      expect(amountInput).not.toBeNull();
      expect(descriptionInput).not.toBeNull();

      // Pre-conditions: text input + decimal inputMode (so the browser doesn't
      // reject the comma).
      expect(amountInput.type).toBe('text');
      expect(amountInput.inputMode).toBe('decimal');

      fireEvent.change(amountInput, { target: { value: typed } });
      fireEvent.change(descriptionInput, { target: { value: 'Comma decimal smoke test' } });

      // The user's raw typed string must round-trip in state (no silent number
      // coercion to `1331` / `NaN`).
      expect(amountInput.value).toBe(typed);

      const submitButton = screen.getByRole('button', { name: /^Save$|^Guardar$/i });
      fireEvent.click(submitButton);

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      return onSubmit.mock.calls[0]![0] as CreateTransactionRequest;
    }

    it('parses `1331,85` (Spanish decimal) into 1331.85 for the IPC call', async () => {
      const input = await submitWithAmount('1331,85');
      expect(input.amount).toBe(1331.85);
    });

    it('parses `1.331,85` (Spanish thousands + decimal) into 1331.85 for the IPC call', async () => {
      const input = await submitWithAmount('1.331,85');
      expect(input.amount).toBe(1331.85);
    });
  });
});
