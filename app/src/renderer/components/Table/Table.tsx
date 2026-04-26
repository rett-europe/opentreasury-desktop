import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import './Table.css';

export type SortDirection = 'asc' | 'desc' | null;

export interface TableColumn<T> {
  readonly id: string;
  readonly header: ReactNode;
  readonly sortable?: boolean;
  readonly align?: 'left' | 'center' | 'right';
  readonly tabular?: boolean;
  readonly width?: string | number;
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
  /**
   * Optional per-row click handler. When provided, rows become keyboard-
   * focusable (tabindex=0) and invoke the callback on click + Enter / Space.
   */
  readonly onRowClick?: (row: T) => void;
  /**
   * Optional per-row className getter. Returns a class name (or undefined)
   * for each row. Used to apply row-level styling (e.g., .ot-split-parent).
   */
  readonly getRowClassName?: (row: T) => string | undefined;
  /**
   * Enable row virtualisation. The wrapping div becomes a scroll container;
   * only rows near the visible viewport are mounted. Recommended for datasets
   * with ≥100 rows. Requires the container to have a bounded height — pass
   * `containerStyle` or set height via an ancestor CSS rule.
   */
  readonly virtualise?: boolean;
  /**
   * Forwarded to the outer scroll-container div. Use to set `height` /
   * `maxHeight` when `virtualise={true}` so the virtualiser has a bounded
   * scroll area.
   */
  readonly containerStyle?: CSSProperties | undefined;
}

/** Estimated row height (px) used by the virtualiser before the real height
 *  is measured. A slight over-estimate reduces layout shift. */
const ESTIMATE_ROW_HEIGHT = 45;

/** Extra rows rendered above and below the visible range. */
const OVERSCAN = 5;

/**
 * Generic data table. Semantic `<table>` with sticky header, zebra rows,
 * WCAG-compliant sort indicators, and an optional sticky footer row.
 *
 * Sort behavior is controlled by the parent (onSort callback) — the table
 * does not mutate data; it only renders what it's given.
 *
 * Pass `virtualise={true}` (plus a bounded `containerStyle`) to enable row
 * virtualisation for large datasets without sacrificing `<table>` semantics.
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
  onRowClick,
  getRowClassName,
  virtualise = false,
  containerStyle,
}: TableProps<T>): JSX.Element {
  // scrollRef is attached to the outer div when virtualise=true so
  // useVirtualizer can observe scroll events on the correct element.
  const scrollRef = useRef<HTMLDivElement>(null);

  // Always call the hook (rules of hooks). When virtualise=false, the scroll
  // element returns null and the virtualiser stays idle — getVirtualItems()
  // is not used in that branch.
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => (virtualise ? scrollRef.current : null),
    estimateSize: () => ESTIMATE_ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  // Compute padding so spacer rows maintain the correct total scroll height
  // while only the visible window of rows is mounted in the DOM.
  const virtualItems = virtualise ? rowVirtualizer.getVirtualItems() : null;
  const totalVirtualSize = virtualise ? rowVirtualizer.getTotalSize() : 0;
  const firstItem = virtualItems && virtualItems.length > 0 ? virtualItems[0] : null;
  const lastItem =
    virtualItems && virtualItems.length > 0 ? virtualItems[virtualItems.length - 1] : null;
  const paddingTop = firstItem ? firstItem.start : 0;
  const paddingBottom = lastItem ? totalVirtualSize - lastItem.end : 0;

  /** Render a single data row (shared between virtual and non-virtual paths). */
  const renderRow = (row: T, rowIndex: number): JSX.Element => {
    const clickable = !!onRowClick;
    const handleRowActivate = (): void => {
      if (onRowClick) onRowClick(row);
    };
    const rowClasses = [clickable ? 'ot-table__row--clickable' : '', getRowClassName?.(row) ?? '']
      .filter(Boolean)
      .join(' ');
    return (
      <tr
        key={getRowKey(row)}
        aria-rowindex={virtualise ? rowIndex + 1 : undefined}
        className={rowClasses || undefined}
        onClick={clickable ? handleRowActivate : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRowActivate();
                }
              }
            : undefined
        }
        tabIndex={clickable ? 0 : undefined}
        role={clickable ? 'button' : undefined}
      >
        {columns.map((col) => {
          const classes = [
            col.align === 'right'
              ? 'ot-table__cell--right'
              : col.align === 'center'
                ? 'ot-table__cell--center'
                : '',
            col.tabular ? 'ot-table__cell--tnum' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const tdStyle: CSSProperties = {};
          if (col.width != null) tdStyle.width = col.width;
          return (
            <td
              key={col.id}
              className={classes || undefined}
              style={Object.keys(tdStyle).length > 0 ? tdStyle : undefined}
            >
              {col.render(row)}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div
      ref={scrollRef}
      className={`ot-table-wrap${virtualise ? ' ot-table-wrap--virtual' : ''}`}
      style={containerStyle}
    >
      <table
        className="ot-table"
        // aria-rowcount tells assistive tech the full dataset size even when
        // only a window of rows is mounted in the DOM.
        aria-rowcount={virtualise ? rows.length : undefined}
      >
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
              const align =
                col.align === 'right'
                  ? 'ot-table__cell--right'
                  : col.align === 'center'
                    ? 'ot-table__cell--center'
                    : '';
              const thStyle: CSSProperties = {};
              if (col.align === 'right') thStyle.textAlign = 'right';
              else if (col.align === 'center') thStyle.textAlign = 'center';
              if (col.width != null) thStyle.width = col.width;
              return (
                <th
                  key={col.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={align}
                  style={Object.keys(thStyle).length > 0 ? thStyle : undefined}
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
          {virtualise && virtualItems ? (
            <>
              {paddingTop > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={columns.length}
                    style={{ height: paddingTop, padding: 0, border: 'none' }}
                  />
                </tr>
              )}
              {virtualItems.map((virtualItem) => {
                const row = rows[virtualItem.index];
                if (row === undefined) return null;
                return renderRow(row, virtualItem.index);
              })}
              {paddingBottom > 0 && (
                <tr aria-hidden="true">
                  <td
                    colSpan={columns.length}
                    style={{ height: paddingBottom, padding: 0, border: 'none' }}
                  />
                </tr>
              )}
            </>
          ) : (
            rows.map((row, index) => renderRow(row, index))
          )}
        </tbody>
        {footer ? <tfoot className="ot-table__foot">{footer}</tfoot> : null}
      </table>
    </div>
  );
}
