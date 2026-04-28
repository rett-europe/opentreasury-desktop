// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DivergingSubcategoryChart, formatBreadcrumbLabel } from './DivergingSubcategoryChart.js';
import type { SubcategoryRow } from '../../../shared/ipc-contracts/insights.js';

const labels = {
  title: 'Distribution by subcategory',
  emptyLabel: 'No data for this view',
  showAllLabel: 'Show all',
  showLessLabel: 'Show less',
  chipClearAriaLabel: 'Clear category filter',
  chipPrefixLabel: 'Filtered by',
  expenseSideLabel: 'Expense',
  incomeSideLabel: 'Income',
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

describe('DivergingSubcategoryChart', () => {
  it('renders both sides simultaneously with breadcrumb labels', () => {
    render(
      <DivergingSubcategoryChart
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

  it('sorts each side by magnitude descending', () => {
    const { container } = render(
      <DivergingSubcategoryChart
        rows={rows}
        expenseCategoryColorMap={expenseColors}
        incomeCategoryColorMap={incomeColors}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    const expenseCells = Array.from(
      container.querySelectorAll('.ot-diverging-chart__cell--expense'),
    )
      .map((c) => c.textContent ?? '')
      .filter((t) => t.length > 0);

    expect(expenseCells[0]).toContain('Groceries');
    expect(expenseCells[1]).toContain('Fuel');
    expect(expenseCells[2]).toContain('Restaurants');
  });

  it('shows just the category name when subcategoryId is null', () => {
    const rowsNoSub: SubcategoryRow[] = [
      {
        categoryId: 'cat-misc',
        categoryName: 'Misc',
        subcategoryId: null,
        subcategoryName: 'Sin subcategoría',
        incomeCents: 0,
        expenseCents: 1000,
      },
    ];
    const colors = new Map<string, string>([['cat-misc', 'var(--color-donut-0)']]);
    render(
      <DivergingSubcategoryChart
        rows={rowsNoSub}
        expenseCategoryColorMap={colors}
        incomeCategoryColorMap={new Map()}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );
    expect(screen.getByText('Misc')).toBeDefined();
    expect(screen.queryByText(/Misc \u203A/)).toBeNull();
  });

  it('shows the empty label when neither side has data', () => {
    render(
      <DivergingSubcategoryChart
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

  it('filters both sides by the selected category and exposes a clear chip', () => {
    const onClearSelection = vi.fn();
    render(
      <DivergingSubcategoryChart
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

  it('toggles to all rows via the show-all link when either side overflows topN', () => {
    const many: SubcategoryRow[] = Array.from({ length: 12 }, (_, i) => ({
      categoryId: 'cat-food',
      categoryName: 'Food',
      subcategoryId: `sub-${i}`,
      subcategoryName: `Sub ${i}`,
      incomeCents: 0,
      expenseCents: (12 - i) * 1000,
    }));
    const colors = new Map<string, string>([['cat-food', 'var(--color-donut-0)']]);

    render(
      <DivergingSubcategoryChart
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

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeDefined();
  });

  it('uses the parent category colour from the matching side map', () => {
    const { container } = render(
      <DivergingSubcategoryChart
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
      '.ot-diverging-chart__cell--expense .ot-diverging-chart__pill',
    ) as HTMLSpanElement | null;
    expect(expensePill?.style.background ?? '').toContain('--color-donut-0');

    const incomePill = container.querySelector(
      '.ot-diverging-chart__cell--income .ot-diverging-chart__pill',
    ) as HTMLSpanElement | null;
    expect(incomePill?.style.background ?? '').toContain('--color-donut-0');
  });

  it('exposes accessible progress bars with the breadcrumb label', () => {
    render(
      <DivergingSubcategoryChart
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
    expect(firstLabel).toMatch(/Food \u203A Groceries/);
  });
});
