// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { MovementsScreen } from './MovementsScreen.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import { MOVEMENTS_DATE_FILTER_STORAGE_KEY } from '../../utils/movementsDateFilter.js';

// Mock the API modules
vi.mock('../../services/movementsApi.js', () => ({
  listMovements: vi.fn(),
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
    // Pin the clock so the default "this month" filter has a deterministic
    // window: 2026-04-01 → 2026-04-20. mockMovements (2026-04-14, -15) fall
    // inside this range so existing assertions about the table rendering
    // continue to hold. Only Date is faked so async test flows still run.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    localStorage.clear();
    vi.mocked(getAccounts).mockResolvedValue({ accounts: mockAccounts });
    vi.mocked(listMovements).mockResolvedValue(mockMovements);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
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
    expect(screen.queryByRole('region', { name: /bulk actions|acciones en lote/i })).toBeNull();

    // Click the first row checkbox (not the header one). There are N row
    // checkboxes plus 1 header checkbox, all with the same aria-label.
    const checkboxes = screen
      .getAllByRole('checkbox')
      .filter((cb) => cb.classList.contains('ot-row-checkbox'));
    expect(checkboxes.length).toBeGreaterThan(0);
    fireEvent.click(checkboxes[0]!);

    // Bar should now be visible.
    expect(screen.getByRole('region', { name: /bulk actions|acciones en lote/i })).not.toBeNull();
  });

  it('WI-19: description column tooltip includes reference and details when present', async () => {
    vi.mocked(listMovements).mockResolvedValue([
      {
        id: 'mov-extras',
        date: '2026-04-15',
        type: 'expense',
        amount: 50,
        currency: 'EUR',
        description: 'Coffee',
        accountId: 'acc-1',
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-15T10:00:00Z',
        reference: 'BANK-REF-42',
        details: 'Cafetería céntrica',
      },
    ]);

    renderWithI18n();
    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });

    const descCell = await screen.findByText('Coffee');
    // SPEC-023 AC1 — Description is now wrapped in .ot-description-cell span
    const tooltip = descCell.closest('.ot-description-cell')?.getAttribute('title') ?? '';
    expect(tooltip).toContain('Coffee');
    expect(tooltip).toContain('BANK-REF-42');
    expect(tooltip).toContain('Cafetería céntrica');
    // Multi-line
    expect(tooltip.split('\n').length).toBeGreaterThanOrEqual(3);
  });

  it('WI-19: description tooltip omits reference/details when absent', async () => {
    renderWithI18n();
    await waitFor(() => {
      expect(screen.queryByRole('table')).not.toBeNull();
    });

    const descCell = await screen.findByText('Test expense');
    // SPEC-023 AC1 — Description is now wrapped in .ot-description-cell span
    const tooltip = descCell.closest('.ot-description-cell')?.getAttribute('title') ?? '';
    expect(tooltip).toBe('Test expense');
  });

  it('WI-19: clicking a row forwards reference/details into the detail modal', async () => {
    // jsdom doesn't implement <dialog>; stub showModal/close.
    const proto = HTMLDialogElement.prototype as unknown as {
      showModal: () => void;
      close: () => void;
    };
    const originalShow = proto.showModal;
    const originalClose = proto.close;
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
    };

    try {
      vi.mocked(listMovements).mockResolvedValue([
        {
          id: 'mov-extras',
          date: '2026-04-15',
          type: 'expense',
          amount: 50,
          currency: 'EUR',
          description: 'Coffee',
          accountId: 'acc-1',
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-15T10:00:00Z',
          reference: 'BANK-REF-42',
          details: 'Cafetería céntrica',
        },
      ]);

      renderWithI18n();
      await waitFor(() => {
        expect(screen.queryByRole('table')).not.toBeNull();
      });

      const descCell = await screen.findByText('Coffee');
      const row = descCell.closest('tr');
      expect(row).not.toBeNull();
      fireEvent.click(row!);

      await waitFor(() => {
        expect(screen.getByText('BANK-REF-42')).not.toBeNull();
        expect(screen.getByText('Cafetería céntrica')).not.toBeNull();
      });
    } finally {
      proto.showModal = originalShow;
      proto.close = originalClose;
    }
  });

  // ── Date-range filter ────────────────────────────────────────────────
  it('date filter: defaults to "Este mes" preset (selected radio)', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
    const thisMonthChip = screen.getByRole('radio', { name: /^Este mes$|^This month$/i });
    expect(thisMonthChip.getAttribute('aria-checked')).toBe('true');
  });

  it('date filter: clicking "Año pasado" filters out all rows in this-month range', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: /^Año pasado$|^Last year$/i }));
    // Pill appears for non-default range.
    await waitFor(() => {
      // No table because no mock rows are in 2025-01-01..2025-12-31.
      expect(screen.queryByRole('table')).toBeNull();
    });
  });

  it('date filter: clicking "Todo" disables the date filter and shows the table', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: /^Año pasado$|^Last year$/i }));
    await waitFor(() => expect(screen.queryByRole('table')).toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: /^Todo$|^All time$/i }));
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
  });

  it('date filter: persists preset selection across mounts (via localStorage)', async () => {
    const { unmount } = renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: /^Año pasado$|^Last year$/i }));
    await waitFor(() => {
      expect(localStorage.getItem(MOVEMENTS_DATE_FILTER_STORAGE_KEY)).not.toBeNull();
    });
    expect(JSON.parse(localStorage.getItem(MOVEMENTS_DATE_FILTER_STORAGE_KEY)!)).toEqual({
      kind: 'preset',
      id: 'last-year',
    });
    unmount();
    renderWithI18n();
    await waitFor(() => {
      const chip = screen.getByRole('radio', { name: /^Año pasado$|^Last year$/i });
      expect(chip.getAttribute('aria-checked')).toBe('true');
    });
  });

  it('date filter: custom range applies and is NOT persisted', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
    // Open the popover.
    fireEvent.click(screen.getByRole('radio', { name: /^Personalizado$|^Custom$/i }));
    const dialog = await screen.findByRole('dialog', {
      name: /Personalizado|Custom/i,
    });
    const fromInput = dialog.querySelectorAll('input[type="date"]')[0] as HTMLInputElement;
    const toInput = dialog.querySelectorAll('input[type="date"]')[1] as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: '2026-04-14' } });
    fireEvent.change(toInput, { target: { value: '2026-04-14' } });
    const applyBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
      /Aplicar|Apply/i.test(b.textContent ?? ''),
    )!;
    fireEvent.click(applyBtn);

    // Custom is intentionally not persisted to localStorage.
    expect(localStorage.getItem(MOVEMENTS_DATE_FILTER_STORAGE_KEY)).toBeNull();
    // Pill appears showing the active custom range.
    await waitFor(() => {
      expect(document.querySelector('.ot-movements__date-pill')).not.toBeNull();
    });
  });

  it('date filter: Clear filters resets to "Este mes" (not "Todo")', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());
    fireEvent.click(screen.getByRole('radio', { name: /^Todo$|^All time$/i }));
    // Find the "Limpiar filtros" button (filter-bar level) and click it.
    const clearBtn = screen.getByRole('button', { name: /Limpiar filtros|Clear filters/i });
    fireEvent.click(clearBtn);
    await waitFor(() => {
      const chip = screen.getByRole('radio', { name: /^Este mes$|^This month$/i });
      expect(chip.getAttribute('aria-checked')).toBe('true');
    });
  });

  // ── Amount filter (ES locale sweep) ──────────────────────────────────
  //
  // Regression for the comma-decimal bug Pedro hit during trial.3.13. The
  // min/max amount filters must accept Spanish-style numbers (`100,50` and
  // `1.000,00`) and parse them via `parseLocaleAmount`. The inputs are
  // `type="text"` so the browser doesn't reject the comma in locales that
  // expect a `.` decimal.
  describe('amount filter: comma-decimal input', () => {
    function getMinAmountInput(): HTMLInputElement {
      // The aria-label resolves to the i18n string `movements.filters.amountMin`,
      // which is `"min €"` in both locales (en/es). Match permissively.
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label*="min" i][inputmode="decimal"]',
      );
      if (!input) throw new Error('min-amount input not found');
      return input;
    }

    function getMaxAmountInput(): HTMLInputElement {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label*="max" i][inputmode="decimal"]',
      );
      if (!input) throw new Error('max-amount input not found');
      return input;
    }

    function countDataRows(): number {
      const table = screen.queryByRole('table');
      if (!table) return 0;
      // Exclude the header row.
      return table.querySelectorAll('tbody tr').length;
    }

    beforeEach(() => {
      // Seed three transactions at distinct amounts so the filter changes
      // are visible: 100.50, 200.00 (defaults) + 1331.85 to exercise the
      // thousands-separator code path.
      vi.mocked(listMovements).mockResolvedValue([
        ...mockMovements,
        {
          id: 'mov-3',
          date: '2026-04-16',
          type: 'income',
          amount: 1331.85,
          currency: 'EUR',
          description: 'Big donation',
          accountId: 'acc-1',
          categoryId: null,
          subcategoryId: null,
          tagIds: [],
          status: 'approved',
          createdAt: '2026-04-16T10:00:00Z',
        },
      ]);
    });

    it('min amount input is `type="text"` + `inputMode="decimal"`', async () => {
      renderWithI18n();
      await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());

      const minInput = getMinAmountInput();
      expect(minInput.type).toBe('text');
      expect(minInput.inputMode).toBe('decimal');

      const maxInput = getMaxAmountInput();
      expect(maxInput.type).toBe('text');
      expect(maxInput.inputMode).toBe('decimal');
    });

    it('min amount `150,50` (Spanish decimal) keeps rows ≥ 150.5', async () => {
      renderWithI18n();
      await waitFor(() => expect(countDataRows()).toBe(3));

      fireEvent.change(getMinAmountInput(), { target: { value: '150,50' } });

      await waitFor(() => {
        // 100.50 is filtered out; 200.00 and 1331.85 remain.
        expect(countDataRows()).toBe(2);
      });
      expect(screen.queryByText('Test expense')).toBeNull();
      expect(screen.getByText('Test income')).toBeTruthy();
      expect(screen.getByText('Big donation')).toBeTruthy();
    });

    it('max amount `150,50` (Spanish decimal) keeps rows ≤ 150.5', async () => {
      renderWithI18n();
      await waitFor(() => expect(countDataRows()).toBe(3));

      fireEvent.change(getMaxAmountInput(), { target: { value: '150,50' } });

      await waitFor(() => {
        // Only 100.50 stays.
        expect(countDataRows()).toBe(1);
      });
      expect(screen.getByText('Test expense')).toBeTruthy();
      expect(screen.queryByText('Test income')).toBeNull();
      expect(screen.queryByText('Big donation')).toBeNull();
    });

    it('min amount `1.000,00` (Spanish thousands + decimal) keeps only rows ≥ 1000', async () => {
      renderWithI18n();
      await waitFor(() => expect(countDataRows()).toBe(3));

      fireEvent.change(getMinAmountInput(), { target: { value: '1.000,00' } });

      await waitFor(() => {
        // Only the 1331.85 row remains.
        expect(countDataRows()).toBe(1);
      });
      expect(screen.getByText('Big donation')).toBeTruthy();
    });
  });
});
