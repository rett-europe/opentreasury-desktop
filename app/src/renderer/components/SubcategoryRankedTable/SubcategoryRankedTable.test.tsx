// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SubcategoryRankedTable, formatBreadcrumbLabel } from './SubcategoryRankedTable.js';
import type { SubcategoryRow } from '../../../shared/ipc-contracts/insights.js';

const labels = {
  title: 'Distribution by subcategory',
  expenseSideLabel: 'Expense',
  incomeSideLabel: 'Income',
  emptyLabel: 'No data for this view',
  sideEmptyLabel: 'No data',
  showAllLabel: 'Show all',
  showLessLabel: 'Show less',
  chipClearAriaLabel: 'Clear category filter',
  chipPrefixLabel: 'Filtered by',
  amountColumnLabel: 'Amount',
  percentColumnLabel: '% of total',
};

const expenseColors = new Map<string, string>([
  ['cat-food', 'var(--color-donut-0)'],
  ['cat-transport', 'var(--color-donut-1)'],
]);
const incomeColors = new Map<string, string>([['cat-salary', 'var(--color-donut-0)']]);

const rows: SubcategoryRow[] = [
  {
    categoryId: 'cat-food',
    categoryName: 'Food',
    subcategoryId: 'sub-groceries',
    subcategoryName: 'Groceries',
    incomeCents: 0,
    expenseCents: 50000,
  },
  {
    categoryId: 'cat-food',
    categoryName: 'Food',
    subcategoryId: 'sub-restaurants',
    subcategoryName: 'Restaurants',
    incomeCents: 0,
    expenseCents: 20000,
  },
  {
    categoryId: 'cat-transport',
    categoryName: 'Transport',
    subcategoryId: 'sub-fuel',
    subcategoryName: 'Fuel',
    incomeCents: 0,
    expenseCents: 30000,
  },
  {
    categoryId: 'cat-salary',
    categoryName: 'Salary',
    subcategoryId: 'sub-base',
    subcategoryName: 'Base salary',
    incomeCents: 200000,
    expenseCents: 0,
  },
];

describe('formatBreadcrumbLabel', () => {
  it('joins category and subcategory with the U+203A chevron', () => {
    expect(formatBreadcrumbLabel('Gastos', 'Calendario', 'sub-cal')).toBe(
      'Gastos \u203A Calendario',
    );
  });

  it('renders only the category name when there is no subcategory id', () => {
    expect(formatBreadcrumbLabel('Gastos', 'Sin subcategoría', null)).toBe('Gastos');
  });

  it('does not use the ASCII > character', () => {
    expect(formatBreadcrumbLabel('A', 'B', 's')).not.toContain('>');
    expect(formatBreadcrumbLabel('A', 'B', 's')).toContain('\u203A');
  });
});

describe('SubcategoryRankedTable', () => {
  it('renders both sides simultaneously with breadcrumb labels', () => {
    render(
      <SubcategoryRankedTable
        rows={rows}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={incomeColors}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    expect(screen.getByText(/Food \u203A Groceries/)).toBeDefined();
    expect(screen.getByText(/Food \u203A Restaurants/)).toBeDefined();
    expect(screen.getByText(/Transport \u203A Fuel/)).toBeDefined();
    expect(screen.getByText(/Salary \u203A Base salary/)).toBeDefined();
  });

  it('sorts each side by magnitude descending and assigns rank pills 1..N', () => {
    const { container } = render(
      <SubcategoryRankedTable
        rows={rows}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={incomeColors}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    const expenseSide = container.querySelector(
      '.ot-subcategory-ranked__side--expense',
    ) as HTMLElement;
    const expenseLabels = Array.from(
      expenseSide.querySelectorAll('.ot-subcategory-ranked__row .ot-subcategory-ranked__name'),
    ).map((n) => n.textContent ?? '');

    expect(expenseLabels[0]).toContain('Groceries'); // 500
    expect(expenseLabels[1]).toContain('Fuel'); // 300
    expect(expenseLabels[2]).toContain('Restaurants'); // 200

    const ranks = Array.from(
      expenseSide.querySelectorAll('.ot-subcategory-ranked__row .ot-subcategory-ranked__rank'),
    ).map((n) => n.textContent ?? '');
    expect(ranks).toEqual(['1', '2', '3']);
  });

  it('computes "% of side total" rounded to 1 decimal', () => {
    const skewed: SubcategoryRow[] = [
      {
        categoryId: 'cat-food',
        categoryName: 'Food',
        subcategoryId: 'sub-a',
        subcategoryName: 'A',
        incomeCents: 0,
        expenseCents: 4400,
      },
      {
        categoryId: 'cat-food',
        categoryName: 'Food',
        subcategoryId: 'sub-b',
        subcategoryName: 'B',
        incomeCents: 0,
        expenseCents: 5600,
      },
    ];
    const { container } = render(
      <SubcategoryRankedTable
        rows={skewed}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={new Map()}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );
    const percents = Array.from(
      container.querySelectorAll(
        '.ot-subcategory-ranked__side--expense .ot-subcategory-ranked__percent',
      ),
    ).map((n) => n.textContent ?? '');
    // Top row = 56%, second = 44%. en-US Intl percent w/ 1 decimal.
    expect(percents[0]).toMatch(/56\.0\s?%/);
    expect(percents[1]).toMatch(/44\.0\s?%/);
  });

  it('scales bars per-side independently (no shared maxAbs)', () => {
    const mixed: SubcategoryRow[] = [
      {
        categoryId: 'cat-food',
        categoryName: 'Food',
        subcategoryId: 'sub-a',
        subcategoryName: 'A',
        incomeCents: 0,
        expenseCents: 100,
      },
      {
        categoryId: 'cat-salary',
        categoryName: 'Salary',
        subcategoryId: 'sub-base',
        subcategoryName: 'Base',
        incomeCents: 100000,
        expenseCents: 0,
      },
    ];
    const { container } = render(
      <SubcategoryRankedTable
        rows={mixed}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={incomeColors}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );
    const expenseFill = container.querySelector(
      '.ot-subcategory-ranked__side--expense .ot-subcategory-ranked__bar-fill',
    ) as HTMLElement;
    const incomeFill = container.querySelector(
      '.ot-subcategory-ranked__side--income .ot-subcategory-ranked__bar-fill',
    ) as HTMLElement;
    expect(expenseFill.style.width).toMatch(/^100/);
    expect(incomeFill.style.width).toMatch(/^100/);
  });

  it('shows the empty label when neither side has data', () => {
    render(
      <SubcategoryRankedTable
        rows={[]}
        expenseCategoryColorMap={new Map()}
        incomeCategoryColorMap={new Map()}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );
    expect(screen.getByText('No data for this view')).toBeDefined();
  });

  it('shows per-side empty state when only one side has rows', () => {
    const onlyExpense: SubcategoryRow[] = [
      {
        categoryId: 'cat-food',
        categoryName: 'Food',
        subcategoryId: 'sub-a',
        subcategoryName: 'A',
        incomeCents: 0,
        expenseCents: 1000,
      },
    ];
    const { container } = render(
      <SubcategoryRankedTable
        rows={onlyExpense}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={new Map()}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );
    const incomeSide = container.querySelector(
      '.ot-subcategory-ranked__side--income',
    ) as HTMLElement;
    expect(within(incomeSide).getByText('No data')).toBeDefined();
    const expenseSide = container.querySelector(
      '.ot-subcategory-ranked__side--expense',
    ) as HTMLElement;
    expect(within(expenseSide).queryByText('No data')).toBeNull();
  });

  it('does not render the show-all toggle when both sides have <= topN rows', () => {
    render(
      <SubcategoryRankedTable
        rows={rows}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={incomeColors}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  });

  it('filters both sides by the selected category and exposes a clear chip', () => {
    const onClearSelection = vi.fn();
    render(
      <SubcategoryRankedTable
        rows={rows}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={incomeColors}
        selectedCategoryId="cat-food"
        selectedCategoryName="Food"
        onClearSelection={onClearSelection}
        locale="en-US"
        {...labels}
      />,
    );

    expect(screen.getByText(/Food \u203A Groceries/)).toBeDefined();
    expect(screen.getByText(/Food \u203A Restaurants/)).toBeDefined();
    expect(screen.queryByText(/Transport \u203A Fuel/)).toBeNull();
    expect(screen.queryByText(/Salary \u203A Base salary/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear category filter' }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('toggles the expense side independently of the income side via show-all/show-less', () => {
    const many: SubcategoryRow[] = Array.from({ length: 12 }, (_, i) => ({
      categoryId: 'cat-food',
      categoryName: 'Food',
      subcategoryId: `sub-${i}`,
      subcategoryName: `Sub ${i}`,
      incomeCents: 0,
      expenseCents: (12 - i) * 1000,
    }));
    const colors = new Map<string, string>([['cat-food', 'var(--color-donut-0)']]);

    const { container } = render(
      <SubcategoryRankedTable
        rows={many}
        expenseCategoryColorMap={colors}
        incomeCategoryColorMap={new Map()}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        topN={10}
        {...labels}
      />,
    );

    const expenseSide = container.querySelector(
      '.ot-subcategory-ranked__side--expense',
    ) as HTMLElement;
    expect(expenseSide.querySelectorAll('.ot-subcategory-ranked__row')).toHaveLength(10);

    fireEvent.click(within(expenseSide).getByRole('button', { name: 'Show all' }));
    expect(expenseSide.querySelectorAll('.ot-subcategory-ranked__row')).toHaveLength(12);
    expect(within(expenseSide).getByRole('button', { name: 'Show less' })).toBeDefined();
  });

  it('uses the parent category colour from the matching side map', () => {
    const { container } = render(
      <SubcategoryRankedTable
        rows={rows}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={incomeColors}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );
    const expensePill = container.querySelector(
      '.ot-subcategory-ranked__side--expense .ot-subcategory-ranked__pill',
    ) as HTMLSpanElement | null;
    expect(expensePill?.style.background ?? '').toContain('--color-donut-0');

    const incomePill = container.querySelector(
      '.ot-subcategory-ranked__side--income .ot-subcategory-ranked__pill',
    ) as HTMLSpanElement | null;
    expect(incomePill?.style.background ?? '').toContain('--color-donut-0');
  });

  it('exposes accessible progress bars labelled with breadcrumb + amount + percent', () => {
    render(
      <SubcategoryRankedTable
        rows={rows}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={incomeColors}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );
    const bars = screen.getAllByRole('progressbar');
    const firstLabel = bars[0]?.getAttribute('aria-label') ?? '';
    expect(firstLabel).toMatch(/\u203A/);
    expect(firstLabel).toMatch(/%/);
  });
});
