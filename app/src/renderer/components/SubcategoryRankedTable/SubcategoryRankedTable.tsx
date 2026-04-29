import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { SubcategoryRow } from '../../../shared/ipc-contracts/insights.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import './SubcategoryRankedTable.css';

/**
 * Subcategory ranked tables for the Insights drilldown.
 *
 * Two side-by-side ranked lists — Gastos (left), Ingresos (right) — each with
 * its own scale, its own sort, its own % column. They never share an axis;
 * gastos and ingresos do not share subcategory keys, so any visual claim of
 * row-by-row pairing (as the prior diverging chart did) is misleading.
 *
 * Each row: tinted rank pill (rank number sits inside a chip tinted with the
 * category colour from the donut, replacing the prior separate dot) |
 * breadcrumb label `Category › Subcategory` | inline horizontal magnitude bar
 * | amount | % of side total.
 *
 * `selectedCategoryId` (driven by donut click) filters both tables to that
 * category's subcategories. Each side renders an empty state independently if
 * it has no rows. Top 10 rows visible by default with a "Ver todas" toggle.
 */

const UNCAT = '__uncat__';
const CHEVRON = '\u203A'; // U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK

export type SubcategoryRankedTableLabels = {
  readonly title: string;
  readonly expenseSideLabel: string;
  readonly incomeSideLabel: string;
  readonly emptyLabel: string;
  readonly sideEmptyLabel: string;
  readonly showAllLabel: string;
  readonly showLessLabel: string;
  readonly chipClearAriaLabel: string;
  readonly chipPrefixLabel: string;
  readonly amountColumnLabel: string;
  readonly percentColumnLabel: string;
};

export type SubcategoryRankedTableProps = SubcategoryRankedTableLabels & {
  readonly rows: ReadonlyArray<SubcategoryRow>;
  readonly expenseCategoryColorMap: ReadonlyMap<string, string>;
  readonly incomeCategoryColorMap: ReadonlyMap<string, string>;
  readonly selectedCategoryId: string | null;
  readonly selectedCategoryName?: string | null;
  readonly onClearSelection: () => void;
  readonly locale: string;
  readonly topN?: number;
};

/**
 * Render a row label as `Category › Subcategory`. When the row represents a
 * category-level aggregate (no `subcategoryId`) only the category name is
 * shown — no chevron.
 */
export function formatBreadcrumbLabel(
  categoryName: string,
  subcategoryName: string,
  subcategoryId: string | null,
): string {
  if (subcategoryId == null) return categoryName;
  return `${categoryName} ${CHEVRON} ${subcategoryName}`;
}

type RankedRow = {
  readonly row: SubcategoryRow;
  readonly cents: number;
  readonly key: string;
  readonly colorVar: string;
  readonly label: string;
};

function rankSide(
  rows: ReadonlyArray<SubcategoryRow>,
  side: 'gastos' | 'ingresos',
  selectedCategoryId: string | null,
  colorMap: ReadonlyMap<string, string>,
): ReadonlyArray<RankedRow> {
  const out: RankedRow[] = [];
  for (const r of rows) {
    const cents = side === 'ingresos' ? r.incomeCents : r.expenseCents;
    if (cents <= 0) continue;
    if (selectedCategoryId != null && (r.categoryId ?? UNCAT) !== selectedCategoryId) continue;
    out.push({
      row: r,
      cents,
      key: `${side}::${r.categoryId ?? UNCAT}::${r.subcategoryId ?? UNCAT}`,
      colorVar: colorMap.get(r.categoryId ?? UNCAT) ?? 'var(--color-donut-otras)',
      label: formatBreadcrumbLabel(r.categoryName, r.subcategoryName, r.subcategoryId),
    });
  }
  out.sort((a, b) => b.cents - a.cents);
  return out;
}

/**
 * % rounded to 1 decimal. Cheap accuracy that stops the column from looking
 * lossy at small magnitudes.
 */
function formatPercent(cents: number, sideTotal: number, locale: string): string {
  if (sideTotal <= 0) return new Intl.NumberFormat(locale, { style: 'percent' }).format(0);
  const ratio = cents / sideTotal;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ratio);
}

export function SubcategoryRankedTable({
  rows,
  expenseCategoryColorMap,
  incomeCategoryColorMap,
  selectedCategoryId,
  selectedCategoryName,
  onClearSelection,
  locale,
  title,
  expenseSideLabel,
  incomeSideLabel,
  emptyLabel,
  sideEmptyLabel,
  showAllLabel,
  showLessLabel,
  chipClearAriaLabel,
  chipPrefixLabel,
  amountColumnLabel,
  percentColumnLabel,
  topN = 10,
}: SubcategoryRankedTableProps): JSX.Element {
  const [showAllExpense, setShowAllExpense] = useState(false);
  const [showAllIncome, setShowAllIncome] = useState(false);

  const expenseRows = useMemo(
    () => rankSide(rows, 'gastos', selectedCategoryId, expenseCategoryColorMap),
    [rows, selectedCategoryId, expenseCategoryColorMap],
  );
  const incomeRows = useMemo(
    () => rankSide(rows, 'ingresos', selectedCategoryId, incomeCategoryColorMap),
    [rows, selectedCategoryId, incomeCategoryColorMap],
  );

  const isEmpty = expenseRows.length === 0 && incomeRows.length === 0;

  return (
    <section
      className="ot-subcategory-ranked ot-p-card ot-p-card--padded"
      aria-labelledby="ot-subcategory-ranked-title"
    >
      <header className="ot-subcategory-ranked__header">
        <h3 id="ot-subcategory-ranked-title" className="ot-subcategory-ranked__title">
          {title}
        </h3>
        {selectedCategoryId != null ? (
          <button
            type="button"
            className="ot-subcategory-ranked__chip"
            onClick={onClearSelection}
            aria-label={chipClearAriaLabel}
          >
            <span className="ot-subcategory-ranked__chip-text">
              {chipPrefixLabel}: {selectedCategoryName ?? ''}
            </span>
            <X size={12} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {isEmpty ? (
        <p className="ot-subcategory-ranked__empty">{emptyLabel}</p>
      ) : (
        <div className="ot-subcategory-ranked__grid">
          <RankedSide
            side="expense"
            sideLabel={expenseSideLabel}
            rows={expenseRows}
            topN={topN}
            showAll={showAllExpense}
            onToggleShowAll={() => setShowAllExpense((v) => !v)}
            locale={locale}
            sideEmptyLabel={sideEmptyLabel}
            showAllLabel={showAllLabel}
            showLessLabel={showLessLabel}
            amountColumnLabel={amountColumnLabel}
            percentColumnLabel={percentColumnLabel}
          />
          <RankedSide
            side="income"
            sideLabel={incomeSideLabel}
            rows={incomeRows}
            topN={topN}
            showAll={showAllIncome}
            onToggleShowAll={() => setShowAllIncome((v) => !v)}
            locale={locale}
            sideEmptyLabel={sideEmptyLabel}
            showAllLabel={showAllLabel}
            showLessLabel={showLessLabel}
            amountColumnLabel={amountColumnLabel}
            percentColumnLabel={percentColumnLabel}
          />
        </div>
      )}
    </section>
  );
}

function RankedSide({
  side,
  sideLabel,
  rows,
  topN,
  showAll,
  onToggleShowAll,
  locale,
  sideEmptyLabel,
  showAllLabel,
  showLessLabel,
  amountColumnLabel,
  percentColumnLabel,
}: {
  readonly side: 'expense' | 'income';
  readonly sideLabel: string;
  readonly rows: ReadonlyArray<RankedRow>;
  readonly topN: number;
  readonly showAll: boolean;
  readonly onToggleShowAll: () => void;
  readonly locale: string;
  readonly sideEmptyLabel: string;
  readonly showAllLabel: string;
  readonly showLessLabel: string;
  readonly amountColumnLabel: string;
  readonly percentColumnLabel: string;
}): JSX.Element {
  const sideTotal = useMemo(() => rows.reduce((sum, r) => sum + r.cents, 0), [rows]);
  // Each side scales bars to its own top row. No shared scale across sides.
  const maxCents = rows[0]?.cents ?? 0;
  const visible = showAll ? rows : rows.slice(0, topN);
  const hasMore = rows.length > topN;
  const headingId = `ot-subcategory-ranked-${side}-heading`;

  return (
    <div
      className={`ot-subcategory-ranked__side ot-subcategory-ranked__side--${side}`}
      data-side={side}
    >
      <div className="ot-subcategory-ranked__side-header">
        <h4 id={headingId} className="ot-subcategory-ranked__side-title">
          {sideLabel}
        </h4>
      </div>

      {rows.length === 0 ? (
        <p className="ot-subcategory-ranked__side-empty">{sideEmptyLabel}</p>
      ) : (
        <>
          <div className="ot-subcategory-ranked__col-headers" aria-hidden="true">
            <span className="ot-subcategory-ranked__col-rank" />
            <span className="ot-subcategory-ranked__col-label" />
            <span className="ot-subcategory-ranked__col-amount">{amountColumnLabel}</span>
            <span className="ot-subcategory-ranked__col-percent">{percentColumnLabel}</span>
          </div>
          <ol className="ot-subcategory-ranked__list" aria-labelledby={headingId}>
            {visible.map((entry, i) => (
              <RankedRowItem
                key={entry.key}
                rank={i + 1}
                entry={entry}
                maxCents={maxCents}
                sideTotal={sideTotal}
                side={side}
                locale={locale}
              />
            ))}
          </ol>
          {hasMore ? (
            <div className="ot-subcategory-ranked__footer">
              <button
                type="button"
                className="ot-subcategory-ranked__show-all"
                onClick={onToggleShowAll}
              >
                {showAll ? showLessLabel : showAllLabel}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function RankedRowItem({
  rank,
  entry,
  maxCents,
  sideTotal,
  side,
  locale,
}: {
  readonly rank: number;
  readonly entry: RankedRow;
  readonly maxCents: number;
  readonly sideTotal: number;
  readonly side: 'expense' | 'income';
  readonly locale: string;
}): JSX.Element {
  const widthPct = maxCents > 0 ? (entry.cents / maxCents) * 100 : 0;
  const amountStr = formatCurrency(entry.cents / 100, locale);
  const percentStr = formatPercent(entry.cents, sideTotal, locale);
  const tooltip = `${entry.label} — ${amountStr} (${percentStr})`;
  const amountClass =
    side === 'income'
      ? 'ot-subcategory-ranked__amount ot-subcategory-ranked__amount--income ot-tnum'
      : 'ot-subcategory-ranked__amount ot-subcategory-ranked__amount--expense ot-tnum';

  return (
    <li className="ot-subcategory-ranked__row" title={tooltip}>
      <span
        className="ot-subcategory-ranked__rank"
        style={{ ['--ot-rank-color' as string]: entry.colorVar }}
        aria-hidden="true"
      >
        {rank}
      </span>
      <span className="ot-subcategory-ranked__label">
        <span className="ot-subcategory-ranked__name">{entry.label}</span>
      </span>
      <span className={amountClass}>{amountStr}</span>
      <span className="ot-subcategory-ranked__percent ot-tnum">{percentStr}</span>
      <div
        className="ot-subcategory-ranked__bar-track"
        role="progressbar"
        aria-label={tooltip}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(widthPct)}
      >
        <span
          className={`ot-subcategory-ranked__bar-fill ot-subcategory-ranked__bar-fill--${side}`}
          style={{ width: `${Math.max(widthPct, 0.5)}%`, background: entry.colorVar }}
        />
      </div>
    </li>
  );
}
