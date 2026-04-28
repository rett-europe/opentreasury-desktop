// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SubcategoryDistributionPanel } from './SubcategoryDistributionPanel.js';
import type { SubcategoryRow } from '../../../shared/ipc-contracts/insights.js';

const labels = {
  title: 'Distribution by subcategory',
  emptyLabel: 'No data for this view',
  showAllLabel: 'Show all',
  showLessLabel: 'Show less',
  chipClearAriaLabel: 'Clear category filter',
  chipPrefixLabel: 'Filtered by',
};

const colorMap = new Map<string, string>([
  ['cat-food', 'var(--color-donut-0)'],
  ['cat-transport', 'var(--color-donut-1)'],
  ['cat-salary', 'var(--color-donut-0)'],
]);

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

describe('SubcategoryDistributionPanel', () => {
  it('renders only expense subcategories in gastos view, sorted desc by amount', () => {
    render(
      <SubcategoryDistributionPanel
        rows={rows}
        view="gastos"
        categoryColorMap={colorMap}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent ?? '').toContain('Groceries');
    expect(items[1]?.textContent ?? '').toContain('Fuel');
    expect(items[2]?.textContent ?? '').toContain('Restaurants');
    // Income row absent
    expect(screen.queryByText(/Base salary/)).toBeNull();
  });

  it('renders only income subcategories in ingresos view', () => {
    render(
      <SubcategoryDistributionPanel
        rows={rows}
        view="ingresos"
        categoryColorMap={colorMap}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]?.textContent ?? '').toContain('Base salary');
  });

  it('filters to subcategories of the selected category and shows clear chip', () => {
    const onClearSelection = vi.fn();
    render(
      <SubcategoryDistributionPanel
        rows={rows}
        view="gastos"
        categoryColorMap={colorMap}
        selectedCategoryId="cat-food"
        selectedCategoryName="Food"
        onClearSelection={onClearSelection}
        locale="en-US"
        {...labels}
      />,
    );

    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent ?? '').toContain('Groceries');
    expect(items[1]?.textContent ?? '').toContain('Restaurants');
    expect(screen.queryByText(/Fuel/)).toBeNull();

    const chip = screen.getByRole('button', { name: 'Clear category filter' });
    fireEvent.click(chip);
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('shows empty-state message when the active view has no data', () => {
    render(
      <SubcategoryDistributionPanel
        rows={[]}
        view="ingresos"
        categoryColorMap={colorMap}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    expect(screen.getByText('No data for this view')).toBeDefined();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('shows top-N rows and toggles to all via the show-all link', () => {
    const many: SubcategoryRow[] = Array.from({ length: 12 }, (_, i) => ({
      categoryId: 'cat-food',
      categoryName: 'Food',
      subcategoryId: `sub-${i}`,
      subcategoryName: `Sub ${i}`,
      incomeCents: 0,
      expenseCents: (12 - i) * 1000,
    }));

    render(
      <SubcategoryDistributionPanel
        rows={many}
        view="gastos"
        categoryColorMap={colorMap}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        topN={10}
        {...labels}
      />,
    );

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    const toggle = screen.getByRole('button', { name: 'Show all' });
    fireEvent.click(toggle);
    expect(screen.getAllByRole('listitem')).toHaveLength(12);
    expect(screen.getByRole('button', { name: 'Show less' })).toBeDefined();
  });

  it('applies the parent category colour to each row pill', () => {
    const { container } = render(
      <SubcategoryDistributionPanel
        rows={rows}
        view="gastos"
        categoryColorMap={colorMap}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    const items = container.querySelectorAll<HTMLLIElement>('.ot-subcat-dist__row');
    const firstPill = items[0]?.querySelector<HTMLSpanElement>('.ot-subcat-dist__pill');
    // Groceries → cat-food → donut-0
    expect(firstPill?.style.background).toContain('--color-donut-0');
  });

  it('row tooltip exposes amount and percentage for screen readers / hover', () => {
    render(
      <SubcategoryDistributionPanel
        rows={rows}
        view="gastos"
        categoryColorMap={colorMap}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    const progressBars = screen.getAllByRole('progressbar');
    // First row = Groceries 500 of (500+300+200)=1000 = 50%
    const firstLabel = progressBars[0]?.getAttribute('aria-label') ?? '';
    expect(firstLabel).toContain('Groceries');
    expect(firstLabel).toContain('50.0%');
    expect(progressBars[0]?.getAttribute('aria-valuenow')).toBe('50');
  });

  it('renders amount with the income semantic colour class in ingresos view', () => {
    const { container } = render(
      <SubcategoryDistributionPanel
        rows={rows}
        view="ingresos"
        categoryColorMap={colorMap}
        selectedCategoryId={null}
        onClearSelection={() => {}}
        locale="en-US"
        {...labels}
      />,
    );

    const item = container.querySelector('.ot-subcat-dist__row') as HTMLElement;
    expect(within(item).getByText(/Base salary/)).toBeDefined();
    expect(item.querySelector('.ot-subcat-dist__amount--income')).not.toBeNull();
    expect(item.querySelector('.ot-subcat-dist__amount--expense')).toBeNull();
  });
});
