import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import './Table.css';

export type SortDirection = 'asc' | 'desc' | null;

export interface TableColumn<T> {
  readonly id: string;
  readonly header: string;
  readonly sortable?: boolean;
  readonly align?: 'left' | 'right';
  readonly tabular?: boolean;
  readonly render: (row: T) => ReactNode;
}

export interface TableProps<T> {
  readonly caption?: string;
  readonly columns: readonly TableColumn<T>[];
  readonly rows: readonly T[];
  readonly getRowKey: (row: T) => string;
  readonly sortBy?: string | null;
  readonly sortDirection?: SortDirection;
  readonly onSort?: (columnId: string) => void;
  readonly footer?: ReactNode;
}

/**
 * Generic data table. Semantic `<table>` with sticky header, zebra rows,
 * WCAG-compliant sort indicators, and an optional sticky footer row.
 *
 * Sort behavior is controlled by the parent (onSort callback) — the table
 * does not mutate data; it only renders what it's given.
 */
export function Table<T>({
  caption,
  columns,
  rows,
  getRowKey,
  sortBy,
  sortDirection,
  onSort,
  footer,
}: TableProps<T>): JSX.Element {
  return (
    <div className="ot-table-wrap">
      <table className="ot-table">
        {caption ? <caption className="ot-sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((col) => {
              const isSorted = sortBy === col.id;
              const ariaSort = !col.sortable
                ? undefined
                : isSorted
                  ? sortDirection === 'asc'
                    ? 'ascending'
                    : sortDirection === 'desc'
                      ? 'descending'
                      : 'none'
                  : 'none';
              const align = col.align === 'right' ? 'ot-table__cell--right' : '';
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={align}
                  style={col.align === 'right' ? { textAlign: 'right' } : undefined}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      className="ot-table__sort-btn"
                      onClick={() => onSort(col.id)}
                    >
                      {col.header}
                      <span className="ot-table__sort-indicator" aria-hidden="true">
                        {isSorted && sortDirection === 'asc' ? (
                          <ChevronUp size={14} />
                        ) : isSorted && sortDirection === 'desc' ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronsUpDown size={14} />
                        )}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={getRowKey(row)}>
              {columns.map((col) => {
                const classes = [
                  col.align === 'right' ? 'ot-table__cell--right' : '',
                  col.tabular ? 'ot-table__cell--tnum' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <td key={col.id} className={classes || undefined}>
                    {col.render(row)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {footer ? <tfoot className="ot-table__foot">{footer}</tfoot> : null}
      </table>
    </div>
  );
}
