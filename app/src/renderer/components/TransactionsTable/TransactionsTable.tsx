import { useTranslation } from 'react-i18next';
import { Table } from '../Table/index.js';
import type { TableColumn } from '../Table/Table.js';
import type { SortDirection } from '../Table/index.js';
import { useFormatters } from '../../format/index.js';
import { getTagColor } from '../../utils/tagColor.js';
import { getStatusBadgeClass } from '../../utils/statusBadge.js';
import './TransactionsTable.css';

export type TransactionRowType = 'income' | 'expense';
export type TransactionRowStatus = 'pending' | 'approved' | 'rejected';

export interface TransactionRow {
  readonly id: string;
  readonly date: string;
  readonly type: TransactionRowType;
  readonly amount: number;
  readonly description: string;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly subcategoryId: string | null;
  readonly tagIds: readonly string[];
  readonly status: TransactionRowStatus;
  readonly reference?: string | null;
  readonly details?: string | null;
  readonly hasSplits?: boolean;
  readonly splitCount?: number;
}

export interface LookupItem {
  readonly name: string;
  readonly color: string;
}

export interface TransactionsTableProps {
  readonly rows: readonly TransactionRow[];
  readonly accountLookup: ReadonlyMap<string, LookupItem>;
  readonly tagLookup: ReadonlyMap<string, LookupItem>;
  readonly categoryLookup: ReadonlyMap<string, string>;
  readonly subcategoryLookup: ReadonlyMap<string, string>;
  readonly showSelectColumn?: boolean;
  readonly selectedIds?: ReadonlySet<string>;
  readonly onToggleRow?: (id: string) => void;
  readonly onToggleAll?: () => void;
  readonly allSelected?: boolean;
  readonly someSelected?: boolean;
  readonly onRowClick?: (row: TransactionRow) => void;
  readonly onSplitClick?: (row: TransactionRow) => void;
  /** SPEC-023 AC1 — Callback when user chooses "Split transaction" action on a non-split row. */
  readonly onSplitAction?: (row: TransactionRow) => void;
  readonly emptyState?: React.ReactNode;
  readonly sortBy?: string | null;
  readonly sortDirection?: SortDirection;
  readonly onSort?: (columnId: string) => void;
  readonly getRowClassName?: (row: TransactionRow) => string | undefined;
  readonly virtualise?: boolean;
  readonly containerStyle?: React.CSSProperties | undefined;
}

export function TransactionsTable({
  rows,
  accountLookup,
  tagLookup,
  categoryLookup,
  subcategoryLookup,
  showSelectColumn = false,
  selectedIds,
  onToggleRow,
  onToggleAll,
  allSelected = false,
  someSelected = false,
  onRowClick,
  onSplitClick,
  onSplitAction,
  emptyState,
  sortBy,
  sortDirection,
  onSort,
  getRowClassName,
  virtualise,
  containerStyle,
}: TransactionsTableProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatDate, formatCurrency } = useFormatters();

  const tagColor = (tagId: string): string => getTagColor(tagLookup.get(tagId), tagId);

  const statusLabel = (s: TransactionRowStatus) => t(`movements.status.${s}`);
  const statusClass = getStatusBadgeClass;

  const columns: TableColumn<TransactionRow>[] = [
    ...(showSelectColumn
      ? [
          {
            id: 'select',
            header: (
              <input
                type="checkbox"
                className="ot-header-checkbox"
                checked={allSelected}
                ref={(el: HTMLInputElement | null) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={onToggleAll}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                aria-label={t('movements.columns.select')}
              />
            ),
            sortable: false,
            align: 'center' as const,
            render: (row: TransactionRow) => (
              <input
                type="checkbox"
                className="ot-row-checkbox"
                checked={selectedIds?.has(row.id) ?? false}
                onChange={() => onToggleRow?.(row.id)}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                aria-label={t('movements.columns.select')}
              />
            ),
          },
        ]
      : []),
    {
      id: 'type',
      header: '',
      sortable: false,
      align: 'center' as const,
      render: (row: TransactionRow) => {
        const cls =
          row.type === 'income'
            ? 'ot-type-arrow ot-type-arrow--income'
            : 'ot-type-arrow ot-type-arrow--expense';
        return (
          <span className={cls} aria-hidden="true">
            {row.type === 'income' ? '↑' : '↓'}
          </span>
        );
      },
    },
    {
      id: 'date',
      header: t('movements.columns.date'),
      sortable: true,
      tabular: true,
      render: (row: TransactionRow) => formatDate(row.date),
    },
    {
      id: 'account',
      header: t('movements.columns.account'),
      sortable: true,
      render: (row: TransactionRow) => {
        const account = accountLookup.get(row.accountId);
        const label = account?.name ?? t('panel.recent.unknownAccount');
        const color = account?.color ?? 'var(--color-brand-primary)';
        return (
          <span
            className="ot-account-pill"
            title={label}
            style={{
              background: `color-mix(in oklch, ${color} 18%, transparent)`,
              color: 'var(--color-text-primary)',
            }}
          >
            <span
              className="ot-account-pill__dot"
              aria-hidden="true"
              style={{ background: color }}
            />
            {label}
          </span>
        );
      },
    },
    {
      id: 'description',
      header: t('movements.columns.observations'),
      sortable: true,
      render: (row: TransactionRow) => {
        const tooltipParts: string[] = [row.description];
        if (row.reference) {
          tooltipParts.push(`${t('movements.tooltip.reference')}: ${row.reference}`);
        }
        if (row.details) {
          tooltipParts.push(`${t('movements.tooltip.details')}: ${row.details}`);
        }
        // SPEC-023 AC1 — Show inline "Split" action for eligible rows (confirmed, non-split).
        const canSplit = row.status === 'approved' && !row.hasSplits && onSplitAction;
        return (
          <span className="ot-description-cell" title={tooltipParts.join('\n')}>
            <span className="ot-description-cell__text">{row.description}</span>
            {canSplit && (
              <button
                type="button"
                className="ot-description-cell__action"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onSplitAction(row);
                }}
                aria-label={t('splits.actions.split')}
              >
                {t('splits.actions.split')}
              </button>
            )}
          </span>
        );
      },
    },
    {
      id: 'category',
      header: t('movements.columns.category'),
      sortable: true,
      render: (row: TransactionRow) => {
        if (row.hasSplits && onSplitClick) {
          return (
            <button
              type="button"
              className="ot-split-parent-badge"
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                onSplitClick(row);
              }}
              aria-label={t('splits.actions.editSplit')}
            >
              {t('splits.list.categoryCell')} ·{' '}
              {t('splits.list.partCount', { count: row.splitCount ?? 0 })}
            </button>
          );
        }
        const categoryName = row.categoryId ? categoryLookup.get(row.categoryId) : null;
        return categoryName ? (
          <span title={categoryName}>{categoryName}</span>
        ) : (
          <span className="ot-badge ot-badge--uncategorized">
            {t('movements.filters.uncategorizedOnly')}
          </span>
        );
      },
    },
    {
      id: 'subcategory',
      header: t('movements.columns.subcategory'),
      sortable: true,
      render: (row: TransactionRow) => {
        const subcategoryName = row.subcategoryId ? subcategoryLookup.get(row.subcategoryId) : null;
        return subcategoryName ? (
          <span title={subcategoryName}>{subcategoryName}</span>
        ) : (
          <span className="ot-text-muted">—</span>
        );
      },
    },
    {
      id: 'tags',
      header: t('movements.columns.tags'),
      sortable: false,
      render: (row: TransactionRow) => {
        if (row.tagIds.length === 0) return <span className="ot-text-muted">—</span>;
        const MAX_VISIBLE = 2;
        const visibleTags = row.tagIds.slice(0, MAX_VISIBLE);
        const overflowTags = row.tagIds.slice(MAX_VISIBLE);
        const overflowCount = overflowTags.length;
        const allTagNames = row.tagIds.map((id) => tagLookup.get(id)?.name ?? id).join(', ');
        return (
          <span className="ot-tag-cell" title={allTagNames}>
            <span className="ot-tag-cell__chips">
              {visibleTags.map((tagId) => {
                const tagName = tagLookup.get(tagId)?.name ?? tagId;
                return (
                  <span
                    key={tagId}
                    className="ot-tag-chip"
                    style={{ ['--ot-tag-color' as string]: tagColor(tagId) }}
                    title={tagName}
                  >
                    {tagName}
                  </span>
                );
              })}
            </span>
            {overflowCount > 0 && (
              <span
                className="ot-tag-cell__overflow"
                title={overflowTags.map((id) => tagLookup.get(id)?.name ?? id).join(', ')}
              >
                +{overflowCount}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: t('movements.columns.status'),
      sortable: true,
      render: (row: TransactionRow) => (
        <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>
      ),
    },
    {
      id: 'amount',
      header: t('movements.columns.amount'),
      sortable: true,
      align: 'right' as const,
      tabular: true,
      render: (row: TransactionRow) => {
        const cls = row.type === 'income' ? 'ot-amount--income' : 'ot-amount--expense';
        const signed = row.type === 'expense' ? -row.amount : row.amount;
        return <span className={cls}>{formatCurrency(signed)}</span>;
      },
    },
  ];

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div
      className={showSelectColumn ? 'ot-transactions-table--with-select' : 'ot-transactions-table'}
    >
      <Table
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        sortBy={sortBy ?? null}
        sortDirection={sortDirection ?? null}
        {...(onSort && { onSort })}
        {...(onRowClick && { onRowClick })}
        {...(getRowClassName && { getRowClassName })}
        {...(virtualise !== undefined && { virtualise })}
        containerStyle={containerStyle}
      />
    </div>
  );
}
