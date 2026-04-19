// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Table } from './Table.js';
import type { TableColumn } from './Table.js';

interface Row {
  id: string;
  name: string;
  amount: number;
}

const COLS: readonly TableColumn<Row>[] = [
  { id: 'name', header: 'Name', sortable: true, render: (r) => r.name },
  {
    id: 'amount',
    header: 'Amount',
    sortable: true,
    align: 'right',
    tabular: true,
    render: (r) => r.amount,
  },
];

describe('Table', () => {
  it('renders headers and rows', () => {
    render(
      <Table
        columns={COLS}
        rows={[
          { id: 'a', name: 'Alpha', amount: 10 },
          { id: 'b', name: 'Beta', amount: 20 },
        ]}
        getRowKey={(r) => r.id}
      />,
    );
    expect(screen.getByRole('columnheader', { name: /Name/ })).toBeDefined();
    expect(screen.getByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
  });

  it('calls onSort when a sortable header is clicked', () => {
    const onSort = vi.fn();
    render(
      <Table
        columns={COLS}
        rows={[]}
        getRowKey={(r) => r.id}
        sortBy="name"
        sortDirection="asc"
        onSort={onSort}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSort).toHaveBeenCalledWith('name');
  });

  it('exposes aria-sort on sorted column', () => {
    render(
      <Table
        columns={COLS}
        rows={[]}
        getRowKey={(r) => r.id}
        sortBy="amount"
        sortDirection="desc"
        onSort={vi.fn()}
      />,
    );
    const th = screen.getByRole('columnheader', { name: /Amount/ });
    expect(th.getAttribute('aria-sort')).toBe('descending');
  });

  it('applies tabular class to tabular columns', () => {
    render(
      <Table
        columns={COLS}
        rows={[{ id: 'a', name: 'Alpha', amount: 10 }]}
        getRowKey={(r) => r.id}
      />,
    );
    const amountCell = screen.getByText('10');
    expect(amountCell.className).toContain('ot-table__cell--tnum');
  });
});
