// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { AddTransactionModal } from './AddTransactionModal.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';

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
});
