// @vitest-environment jsdom
// Tests for the Movimientos Refresh button — verifies it forces a main-side
// re-read of the event log (via queryApi.rehydrate) before re-issuing
// listMovements, and surfaces a toast + skips listMovements on failure.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '../../i18n/index.js';
import { MovementsScreen } from './MovementsScreen.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';

vi.mock('../../services/movementsApi.js', () => ({
  listMovements: vi.fn(),
}));

vi.mock('../../services/queryApi.js', () => ({
  rehydrate: vi.fn(),
}));

vi.mock('../../services/transactionApi.js', () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  bulkUpdateTransactions: vi.fn(),
  bulkAddLabelToTransactions: vi.fn(),
}));

vi.mock('../../services/panelApi.js', () => ({
  getAccounts: vi.fn(),
}));

import { listMovements } from '../../services/movementsApi.js';
import { rehydrate } from '../../services/queryApi.js';
import { getAccounts } from '../../services/panelApi.js';

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

const mockMovements: MovementRecord[] = [
  {
    id: 'mov-1',
    date: '2026-04-15',
    type: 'expense',
    amount: 100.5,
    currency: 'EUR',
    description: 'Test expense',
    accountId: 'acc-1',
    categoryId: null,
    subcategoryId: null,
    tagIds: [],
    status: 'approved',
    createdAt: '2026-04-15T10:00:00Z',
    hasSplits: false,
    splitCount: 0,
  } as MovementRecord,
];

function renderWithI18n(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <MovementsScreen />
    </I18nextProvider>,
  );
}

function findRefreshButton(): HTMLElement {
  // The button label is i18n'd: "Refrescar" / "Refresh".
  const btn = screen
    .getAllByRole('button')
    .find((b) => /refrescar|refresh/i.test(b.textContent ?? ''));
  if (!btn) throw new Error('Refresh button not found');
  return btn;
}

describe('MovementsScreen Refresh button', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    localStorage.clear();
    vi.mocked(getAccounts).mockResolvedValue({ accounts: mockAccounts });
    vi.mocked(listMovements).mockResolvedValue(mockMovements);
    vi.mocked(rehydrate).mockResolvedValue({ ok: true, eventCount: 7, durationMs: 3 });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('calls rehydrate then listMovements when clicked', async () => {
    renderWithI18n();

    // Initial mount triggers listMovements once but NOT rehydrate.
    await waitFor(() => {
      expect(listMovements).toHaveBeenCalledTimes(1);
    });
    expect(rehydrate).not.toHaveBeenCalled();

    fireEvent.click(findRefreshButton());

    await waitFor(() => {
      expect(rehydrate).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(listMovements).toHaveBeenCalledTimes(2);
    });
  });

  it('shows a toast and skips listMovements when rehydrate fails', async () => {
    vi.mocked(rehydrate).mockResolvedValue({
      ok: false,
      error: { code: 'rehydrate_failed', message: 'disk gone' },
    });

    renderWithI18n();

    await waitFor(() => {
      expect(listMovements).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(findRefreshButton());

    await waitFor(() => {
      expect(rehydrate).toHaveBeenCalledTimes(1);
    });

    // Toast renders (Spanish copy because i18n default is `es`).
    await waitFor(() => {
      expect(screen.getByText(/no se pudo refrescar|refresh failed/i)).toBeDefined();
    });

    // Critically, listMovements was NOT called a second time.
    expect(listMovements).toHaveBeenCalledTimes(1);
  });
});
