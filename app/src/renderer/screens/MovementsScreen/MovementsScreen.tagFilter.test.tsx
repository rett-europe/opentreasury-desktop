// @vitest-environment jsdom
//
// Movements screen — Label/Tag filter coverage.
//
// Mirrors the `MovementsScreen.bulk.test.tsx` MSW-style harness: the renderer
// service modules are mocked so the test body can drive IPC responses while
// MovementsScreen thinks it's talking to the main process. We focus on the
// new single-select tag filter dropdown added next to the Category filter.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';

import { i18n } from '../../i18n/index.js';
import { MovementsScreen } from './MovementsScreen.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import type { TagRecord } from '../../types/config.js';

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
vi.mock('../../services/categoriesApi.js', () => ({
  listCategories: vi.fn(),
}));
vi.mock('../../services/tagsApi.js', () => ({
  listTags: vi.fn(),
}));

import { listMovements } from '../../services/movementsApi.js';
import { getAccounts } from '../../services/panelApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';

const ACCOUNT_ID = '01HACC00000000000000000001';
const TAG_GROCERIES = '01HTAG0000000000000000GROC';
const TAG_TRAVEL = '01HTAG0000000000000000TRVL';

const mockAccounts: Account[] = [
  {
    id: ACCOUNT_ID,
    bankName: 'Test Bank',
    bankNameShort: 'TB',
    accountLabel: 'Main',
    color: null,
    sortOrder: 0,
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
  },
];

const mockTags: TagRecord[] = [
  {
    id: TAG_TRAVEL,
    name: 'Travel',
    sortOrder: 1,
    createdAt: '2026-04-01T00:00:00Z',
  },
  {
    id: TAG_GROCERIES,
    name: 'Groceries',
    sortOrder: 0,
    createdAt: '2026-04-01T00:00:00Z',
  },
];

const mockMovements: MovementRecord[] = [
  {
    id: 'mov-groceries',
    date: '2026-04-15',
    type: 'expense',
    amount: 42.5,
    currency: 'EUR',
    description: 'Supermarket',
    accountId: ACCOUNT_ID,
    categoryId: null,
    subcategoryId: null,
    tagIds: [TAG_GROCERIES],
    status: 'approved',
    createdAt: '2026-04-15T10:00:00Z',
  },
  {
    id: 'mov-travel',
    date: '2026-04-14',
    type: 'expense',
    amount: 320,
    currency: 'EUR',
    description: 'Flight to Madrid',
    accountId: ACCOUNT_ID,
    categoryId: null,
    subcategoryId: null,
    tagIds: [TAG_TRAVEL],
    status: 'approved',
    createdAt: '2026-04-14T10:00:00Z',
  },
  {
    id: 'mov-untagged',
    date: '2026-04-13',
    type: 'income',
    amount: 1500,
    currency: 'EUR',
    description: 'Salary',
    accountId: ACCOUNT_ID,
    categoryId: null,
    subcategoryId: null,
    tagIds: [],
    status: 'approved',
    createdAt: '2026-04-13T10:00:00Z',
  },
];

function renderWithI18n(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <MovementsScreen />
    </I18nextProvider>,
  );
}

// Pin i18n to ES because the i18n singleton is shared by every renderer test
// file in the same vitest worker; restore on teardown.
const originalLanguage = i18n.language;
beforeAll(async () => {
  await i18n.changeLanguage('es');
});
afterAll(async () => {
  await i18n.changeLanguage(originalLanguage);
});

describe('MovementsScreen — tag filter', () => {
  beforeEach(() => {
    // Pin the clock so the default "this month" filter window
    // (2026-04-01 → 2026-04-20) includes all fixture rows.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
    localStorage.clear();
    vi.mocked(getAccounts).mockResolvedValue({ accounts: mockAccounts });
    vi.mocked(listMovements).mockResolvedValue([...mockMovements]);
    vi.mocked(listCategories).mockResolvedValue({ categories: [] });
    vi.mocked(listTags).mockResolvedValue({ tags: [...mockTags] });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    vi.clearAllMocks();
  });

  function getTagSelect(): HTMLSelectElement {
    return screen.getByRole('combobox', {
      name: /filtrar por etiqueta|filter by label/i,
    }) as HTMLSelectElement;
  }

  it('defaults to "Todas las etiquetas" and shows every row', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());

    const select = getTagSelect();
    expect(select.value).toBe('all');

    // Default option text mirrors the i18n key.
    const defaultOption = Array.from(select.options).find((o) => o.value === 'all');
    expect(defaultOption?.textContent).toMatch(/todas las etiquetas|all labels/i);

    // All three rows visible.
    expect(screen.getByText('Supermarket')).not.toBeNull();
    expect(screen.getByText('Flight to Madrid')).not.toBeNull();
    expect(screen.getByText('Salary')).not.toBeNull();
  });

  it('lists every loaded tag, sorted alphabetically by name', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());

    const select = getTagSelect();
    const tagOptionLabels = Array.from(select.options)
      .filter((o) => o.value !== 'all')
      .map((o) => o.textContent ?? '');

    // Sorted alphabetically (Groceries < Travel), independent of sortOrder.
    expect(tagOptionLabels).toEqual(['Groceries', 'Travel']);
  });

  it('filters the visible rows to transactions whose tagIds include the selected tag', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());

    fireEvent.change(getTagSelect(), { target: { value: TAG_GROCERIES } });

    await waitFor(() => {
      expect(screen.queryByText('Supermarket')).not.toBeNull();
      expect(screen.queryByText('Flight to Madrid')).toBeNull();
      expect(screen.queryByText('Salary')).toBeNull();
    });
  });

  it('enables the "Limpiar filtros" affordance when a tag is selected', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());

    // No clear button while only the default filters are active.
    expect(screen.queryByRole('button', { name: /limpiar filtros|clear filters/i })).toBeNull();

    fireEvent.change(getTagSelect(), { target: { value: TAG_TRAVEL } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /limpiar filtros|clear filters/i })).not.toBeNull();
    });
  });

  it('"Limpiar filtros" resets the tag filter back to "all"', async () => {
    renderWithI18n();
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeNull());

    fireEvent.change(getTagSelect(), { target: { value: TAG_TRAVEL } });
    await waitFor(() => {
      expect(getTagSelect().value).toBe(TAG_TRAVEL);
      expect(screen.queryByText('Supermarket')).toBeNull();
    });

    fireEvent.click(screen.getByRole('button', { name: /limpiar filtros|clear filters/i }));

    await waitFor(() => {
      expect(getTagSelect().value).toBe('all');
      expect(screen.queryByText('Supermarket')).not.toBeNull();
      expect(screen.queryByText('Flight to Madrid')).not.toBeNull();
      expect(screen.queryByText('Salary')).not.toBeNull();
    });
  });
});
