// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { MovementsScreen } from './MovementsScreen.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';

// Mock the API modules
vi.mock('../../services/movementsApi.js', () => ({
  listMovements: vi.fn(),
}));

vi.mock('../../services/transactionApi.js', () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  bulkUpdateTransactions: vi.fn(),
}));

vi.mock('../../services/panelApi.js', () => ({
  getAccounts: vi.fn(),
}));

import { listMovements } from '../../services/movementsApi.js';
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
  },
  {
    id: 'mov-2',
    date: '2026-04-14',
    type: 'income',
    amount: 200.0,
    currency: 'EUR',
    description: 'Test income',
    accountId: 'acc-1',
    categoryId: null,
    subcategoryId: null,
    tagIds: [],
    status: 'approved',
    createdAt: '2026-04-14T10:00:00Z',
  },
];

function renderWithI18n(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <MovementsScreen />
    </I18nextProvider>,
  );
}

describe('MovementsScreen', () => {
  beforeEach(() => {
    vi.mocked(getAccounts).mockResolvedValue({ accounts: mockAccounts });
    vi.mocked(listMovements).mockResolvedValue(mockMovements);
  });

  it('renders the prototype-parity filter bar on mount', async () => {
    renderWithI18n();
    expect(screen.getByRole('heading', { level: 1 })).toBeDefined();
    // Type chip group is present.
    expect(screen.getByRole('tablist')).toBeDefined();
    // "All" chip is active by default.
    const allChip = screen.getByRole('tab', { name: /todos|all/i });
    expect(allChip.getAttribute('aria-selected')).toBe('true');
  });

  it('shows the New Transaction CTA in the page header', async () => {
    renderWithI18n();
    // Wait for IPC load to flip the disabled state off.
    await waitFor(() => {
      const btn = screen.getAllByRole('button').find((b) => /nuevo|new/i.test(b.textContent ?? ''));
      expect(btn).toBeDefined();
      expect(btn?.hasAttribute('disabled')).toBe(false);
    });
  });

  it('loads movements from IPC on mount', async () => {
    renderWithI18n();
    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });

    expect(getAccounts).toHaveBeenCalled();
    expect(listMovements).toHaveBeenCalled();
  });

  it.skip('displays movements in the table', async () => {
    renderWithI18n();

    await waitFor(() => {
      const table = screen.queryByRole('table');
      expect(table).toBeInTheDocument();
    });

    // Check that IPC was called
    expect(getAccounts).toHaveBeenCalled();
    expect(listMovements).toHaveBeenCalled();
  });

  it('WI-31b: hides the bulk-actions bar until a row is selected', async () => {
    renderWithI18n();
    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });
    // No region before anything is selected.
    expect(
      screen.queryByRole('region', { name: /bulk actions|acciones en lote/i }),
    ).toBeNull();

    // Click the first row checkbox (not the header one). There are N row
    // checkboxes plus 1 header checkbox, all with the same aria-label.
    const checkboxes = screen
      .getAllByRole('checkbox')
      .filter((cb) => cb.classList.contains('ot-row-checkbox'));
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]!);

    // Bar should now be visible.
    expect(
      screen.getByRole('region', { name: /bulk actions|acciones en lote/i }),
    ).not.toBeNull();
  });

  it('WI-31b: Cancel button in the bulk bar clears selection without opening a modal', async () => {
    renderWithI18n();
    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });
    const rowCb = screen
      .getAllByRole('checkbox')
      .find((cb) => cb.classList.contains('ot-row-checkbox'))!;
    fireEvent.click(rowCb);

    const region = screen.getByRole('region', { name: /bulk actions|acciones en lote/i });
    const cancelBtn = region.querySelector('button')!; // first button is the ghost Cancel
    fireEvent.click(cancelBtn);

    // Bar hides again.
    expect(
      screen.queryByRole('region', { name: /bulk actions|acciones en lote/i }),
    ).toBeNull();
    // No classify modal was opened.
    expect(
      screen.queryByRole('heading', { name: /Classify|Clasificar/i }),
    ).toBeNull();
  });
});
