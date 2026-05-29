// @vitest-environment jsdom
//
// AddAccountModal — opening-balance edit gate.
//
// The opening balance is part of the AccountCreated event payload. Editing it
// is only safe when no derived state (running balances, KPIs, charts) depends
// on it — i.e. the account has zero transactions. These tests pin the
// edit-mode UI behaviour around that gate.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '../../i18n/index.js';
import { AddAccountModal } from './AddAccountModal.js';
import type { AccountRecord } from '../../../shared/ipc-contracts/accounts.js';

vi.mock('../../services/accountsApi.js', () => ({
  createAccount: vi.fn(),
  listAccountsUsage: vi.fn(),
}));
vi.mock('../../services/configMutationsApi.js', () => ({
  updateAccount: vi.fn(),
}));

import { listAccountsUsage } from '../../services/accountsApi.js';
import { updateAccount } from '../../services/configMutationsApi.js';

// jsdom doesn't implement HTMLDialogElement.showModal; stub to no-op.
beforeEach(() => {
  vi.clearAllMocks();
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

function makeAccount(overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: '01HACCT0000000000000000ACC1',
    name: 'Banco ABC',
    currency: 'EUR',
    openingBalance: 100,
    sortOrder: 0,
    createdAt: '2026-04-21T10:00:00.000Z',
    ...overrides,
  };
}

function renderEditModal(account: AccountRecord) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const result = render(
    <I18nextProvider i18n={i18n}>
      <AddAccountModal
        isOpen={true}
        mode="edit"
        record={account}
        onClose={onClose}
        onSaved={onSaved}
      />
    </I18nextProvider>,
  );
  return { onClose, onSaved, ...result };
}

describe('AddAccountModal — opening-balance edit gate', () => {
  it('enables the opening balance input when the account has zero transactions', async () => {
    (listAccountsUsage as ReturnType<typeof vi.fn>).mockResolvedValue({ usage: [] });
    const account = makeAccount();
    renderEditModal(account);

    const input = (await screen.findByLabelText(
      /opening balance|saldo inicial/i,
    )) as HTMLInputElement;

    // Wait for the usage fetch to resolve and the field to flip to editable.
    await waitFor(() => expect(input.disabled).toBe(false));
    expect(input.readOnly).toBe(false);

    // The editable-hint copy is shown.
    expect(
      screen.getByText(
        /Editable while the account has no transactions|Editable mientras la cuenta no tenga movimientos/i,
      ),
    ).not.toBeNull();
  });

  it('keeps the opening balance input disabled when the account has transactions, and surfaces the locked-with-count message', async () => {
    (listAccountsUsage as ReturnType<typeof vi.fn>).mockResolvedValue({
      usage: [{ accountId: '01HACCT0000000000000000ACC1', transactionCount: 3 }],
    });
    const account = makeAccount();
    renderEditModal(account);

    const input = (await screen.findByLabelText(
      /opening balance|saldo inicial/i,
    )) as HTMLInputElement;

    // Field never becomes editable.
    await waitFor(() =>
      expect(
        screen.getByText(
          /Opening balance is locked because the account has 3 transaction|saldo inicial está bloqueado porque la cuenta tiene 3 movimiento/i,
        ),
      ).not.toBeNull(),
    );
    expect(input.disabled).toBe(true);
    expect(input.readOnly).toBe(true);
  });

  it('forwards the updated openingBalance through updateAccount when the account is empty and the user changes the value', async () => {
    (listAccountsUsage as ReturnType<typeof vi.fn>).mockResolvedValue({ usage: [] });
    (updateAccount as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const account = makeAccount({ openingBalance: 100 });
    const { onSaved } = renderEditModal(account);

    const input = (await screen.findByLabelText(
      /opening balance|saldo inicial/i,
    )) as HTMLInputElement;
    await waitFor(() => expect(input.disabled).toBe(false));

    await act(async () => {
      fireEvent.change(input, { target: { value: '250' } });
    });

    const save = screen.getByRole('button', { name: /save|guardar/i });
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
    const [id, changes] = (updateAccount as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(id).toBe(account.id);
    expect(changes.openingBalance).toBe(250);
    expect(onSaved).toHaveBeenCalledTimes(1);
    const savedRecord = onSaved.mock.calls[0]![0] as AccountRecord;
    expect(savedRecord.openingBalance).toBe(250);
  });

  it('omits openingBalance from the update payload when the user does not change it (no-op suppression)', async () => {
    (listAccountsUsage as ReturnType<typeof vi.fn>).mockResolvedValue({ usage: [] });
    (updateAccount as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    const account = makeAccount({ openingBalance: 100, name: 'Banco ABC' });
    renderEditModal(account);

    const input = (await screen.findByLabelText(
      /opening balance|saldo inicial/i,
    )) as HTMLInputElement;
    await waitFor(() => expect(input.disabled).toBe(false));

    // Don't touch the opening balance. Tweak the name so the modal has at
    // least one change to submit.
    const nameInput = screen.getByLabelText(
      /account name|nombre de la cuenta/i,
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(nameInput, { target: { value: 'Banco XYZ' } });
    });

    const save = screen.getByRole('button', { name: /save|guardar/i });
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(() => expect(updateAccount).toHaveBeenCalledTimes(1));
    const [, changes] = (updateAccount as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect('openingBalance' in changes).toBe(false);
    expect(changes.name).toBe('Banco XYZ');
  });
});
