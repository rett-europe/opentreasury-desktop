// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { TransactionFormModal } from './TransactionFormModal.js';
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

// ES locale sweep — regression for the comma-decimal bug Pedro hit during
// trial.3.13 integration testing. TransactionFormModal currently has no
// callers in the renderer (AddTransactionModal embeds TransactionFormFields
// directly), but we keep the comma-decimal pattern consistent so that if /
// when this modal is wired up again it won't reintroduce the truncation bug.
describe('TransactionFormModal — comma-decimal amount input (ES locale sweep)', () => {
  async function submitWithAmount(typed: string): Promise<CreateTransactionRequest> {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nextProvider i18n={i18n}>
        <TransactionFormModal
          mode="add"
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={onSubmit}
          accounts={mockAccounts}
        />
      </I18nextProvider>,
    );

    const amountInput = document.getElementById('tx-amount') as HTMLInputElement;
    const descriptionInput = document.getElementById('tx-description') as HTMLInputElement;
    expect(amountInput).not.toBeNull();
    expect(descriptionInput).not.toBeNull();

    // The input must be text + decimal inputMode so the browser accepts comma.
    expect(amountInput.type).toBe('text');
    expect(amountInput.inputMode).toBe('decimal');

    fireEvent.change(amountInput, { target: { value: typed } });
    fireEvent.change(descriptionInput, { target: { value: 'Comma decimal smoke test' } });

    // The user's raw typed string round-trips in state — no silent coercion.
    expect(amountInput.value).toBe(typed);

    fireEvent.click(screen.getByRole('button', { name: /^Save$|^Guardar$/i }));
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

  it('silently rejects garbage keystrokes (e.g. `1..2`) — input value is unchanged', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <TransactionFormModal
          mode="add"
          isOpen={true}
          onClose={vi.fn()}
          onSubmit={vi.fn()}
          accounts={mockAccounts}
        />
      </I18nextProvider>,
    );

    const amountInput = document.getElementById('tx-amount') as HTMLInputElement;
    expect(amountInput).not.toBeNull();

    fireEvent.change(amountInput, { target: { value: '1331,85' } });
    expect(amountInput.value).toBe('1331,85');

    fireEvent.change(amountInput, { target: { value: '1.....,2,..' } });
    expect(amountInput.value).toBe('1331,85');
    fireEvent.change(amountInput, { target: { value: '1..2' } });
    expect(amountInput.value).toBe('1331,85');
    fireEvent.change(amountInput, { target: { value: 'abc' } });
    expect(amountInput.value).toBe('1331,85');
  });
});
