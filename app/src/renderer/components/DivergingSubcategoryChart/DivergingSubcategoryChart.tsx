import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { SubcategoryRow } from '../../../shared/ipc-contracts/insights.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import './DivergingSubcategoryChart.css';

/**
 * Diverging horizontal bar chart for the Insights drilldown.
 *
 * One unified chart: gastos extend LEFT from the central zero baseline and
 * ingresos extend RIGHT. Each side is sorted by magnitude (largest farthest
 * from zero). Labels use the breadcrumb format `Category › Subcategory` so
 * subcategory names that recur under multiple parents (e.g. "Calendario")
 * remain unambiguous.
 *
 * The companion donuts above use a separate per-view colour cycle (one for
 * gastos, one for ingresos); each row's pill picks the parent category's
 * donut colour from the appropriate map so the rows align visually with the
 * slices above.
 */

export type DivergingSubcategoryChartProps = {
  readonly rows: ReadonlyArray<SubcategoryRow>;
  /**
   * Maps `categoryId` (or `__uncat__`) to a CSS colour for gastos rows. Should
   * mirror the donut's per-view colour cycle.
   */
  readonly expenseCategoryColorMap: ReadonlyMap<string, string>;
  /**
   * Maps `categoryId` (or `__uncat__`) to a CSS colour for ingresos rows.
   */
  readonly incomeCategoryColorMap: ReadonlyMap<string, string>;
  /**
   * When set, both sides are filtered to subcategories of that category and
   * percentages are computed within the filtered total.
   */
  readonly selectedCategoryId: string | null;
  readonly selectedCategoryName?: string | null;
  readonly onClearSelection: () => void;
  readonly locale: string;
  readonly title: string;
  readonly emptyLabel: string;
  readonly showAllLabel: string;
  readonly showLessLabel: string;
  readonly chipClearAriaLabel: string;
  readonly chipPrefixLabel: string;
  readonly expenseSideLabel: string;
  readonly incomeSideLabel: string;
  /**
   * How many rows to show **per side** before the show-all toggle reveals the
   * rest. Defaults to 10.
   */
  readonly topN?: number;
};

const UNCAT = '__uncat__';
const CHEVRON = '\u203A'; // U+203A SINGLE RIGHT-POINTING ANGLE QUOTATION MARK

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

export function DivergingSubcategoryChart({
  rows,
  expenseCategoryColorMap,
  incomeCategoryColorMap,
  selectedCategoryId,
  selectedCategoryName,
  onClearSelection,
  locale,
  title,
  emptyLabel,
  showAllLabel,
  showLessLabel,
  chipClearAriaLabel,
  chipPrefixLabel,
  expenseSideLabel,
  incomeSideLabel,
  topN = 10,
}: DivergingSubcategoryChartProps): JSX.Element {
  const [showAll, setShowAll] = useState(false);

  const expenseRows = useMemo(
    () => rankSide(rows, 'gastos', selectedCategoryId, expenseCategoryColorMap),
    [rows, selectedCategoryId, expenseCategoryColorMap],
  );
  const incomeRows = useMemo(
    () => rankSide(rows, 'ingresos', selectedCategoryId, incomeCategoryColorMap),
    [rows, selectedCategoryId, incomeCategoryColorMap],
  );

  // Each side scales relative to the larger side's max so the bar widths are
  // comparable across the zero baseline. (If gastos has a 1000 € bar and
  // ingresos a 500 € bar, the gastos bar should be twice as long.)
  const maxAbs = useMemo(() => {
    const a = expenseRows[0]?.cents ?? 0;
    const b = incomeRows[0]?.cents ?? 0;
    return Math.max(a, b, 1);
  }, [expenseRows, incomeRows]);

  const visibleExpense = showAll ? expenseRows : expenseRows.slice(0, topN);
  const visibleIncome = showAll ? incomeRows : incomeRows.slice(0, topN);
  const hasMore = expenseRows.length > topN || incomeRows.length > topN;

  const isEmpty = expenseRows.length === 0 && incomeRows.length === 0;

  // Pair rows side-by-side per visible index so the diverging pair shares one
  // grid row; missing rows on either side render an empty cell.
  const rowCount = Math.max(visibleExpense.length, visibleIncome.length);

  return (
    <section
      className="ot-diverging-chart ot-p-card ot-p-card--padded"
      aria-labelledby="ot-diverging-chart-title"
    >
      <header className="ot-diverging-chart__header">
        <h3 id="ot-diverging-chart-title" className="ot-diverging-chart__title">
          {title}
        </h3>
        {selectedCategoryId != null ? (
          <button
            type="button"
            className="ot-diverging-chart__chip"
            onClick={onClearSelection}
            aria-label={chipClearAriaLabel}
          >
            <span className="ot-diverging-chart__chip-text">
              {chipPrefixLabel}: {selectedCategoryName ?? ''}
            </span>
            <X size={12} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {isEmpty ? (
        <p className="ot-diverging-chart__empty">{emptyLabel}</p>
      ) : (
        <>
          <div
            className="ot-diverging-chart__legend"
            aria-hidden="true"
            data-testid="ot-diverging-legend"
          >
            <span className="ot-diverging-chart__legend-side ot-diverging-chart__legend-side--expense">
              {expenseSideLabel}
            </span>
            <span className="ot-diverging-chart__axis-zero" />
            <span className="ot-diverging-chart__legend-side ot-diverging-chart__legend-side--income">
              {incomeSideLabel}
            </span>
          </div>

          <ul className="ot-diverging-chart__list" role="list">
            {Array.from({ length: rowCount }).map((_, i) => {
              const exp = visibleExpense[i];
              const inc = visibleIncome[i];
              return (
                <li
                  key={`${exp?.key ?? '_'}|${inc?.key ?? '_'}`}
                  className="ot-diverging-chart__row"
                >
                  <DivergingCell side="expense" entry={exp} maxAbs={maxAbs} locale={locale} />
                  <span className="ot-diverging-chart__axis" aria-hidden="true" />
                  <DivergingCell side="income" entry={inc} maxAbs={maxAbs} locale={locale} />
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className="ot-diverging-chart__footer">
              <button
                type="button"
                className="ot-diverging-chart__show-all"
                onClick={() => setShowAll((prev) => !prev)}
              >
                {showAll ? showLessLabel : showAllLabel}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function DivergingCell({
  side,
  entry,
  maxAbs,
  locale,
}: {
  readonly side: 'expense' | 'income';
  readonly entry: RankedRow | undefined;
  readonly maxAbs: number;
  readonly locale: string;
}): JSX.Element {
  if (!entry) {
    return (
      <div
        className={`ot-diverging-chart__cell ot-diverging-chart__cell--${side}`}
        aria-hidden="true"
      />
    );
  }
  const pct = (entry.cents / maxAbs) * 100;
  const amountStr = formatCurrency(entry.cents / 100, locale);
  const tooltip = `${entry.label} — ${amountStr}`;
  const valueClass =
    side === 'income'
      ? 'ot-diverging-chart__amount ot-diverging-chart__amount--income ot-tnum'
      : 'ot-diverging-chart__amount ot-diverging-chart__amount--expense ot-tnum';
  return (
    <div className={`ot-diverging-chart__cell ot-diverging-chart__cell--${side}`} title={tooltip}>
      <span className="ot-diverging-chart__label" data-side={side}>
        <span
          className="ot-diverging-chart__pill"
          style={{ background: entry.colorVar }}
          aria-hidden="true"
        />
        <span className="ot-diverging-chart__name">{entry.label}</span>
      </span>
      <div
        className="ot-diverging-chart__bar-track"
        data-side={side}
        role="progressbar"
        aria-label={tooltip}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <span
          className={`ot-diverging-chart__bar-fill ot-diverging-chart__bar-fill--${side}`}
          style={{ width: `${Math.max(pct, 0.5)}%`, background: entry.colorVar }}
        />
      </div>
      <span className={valueClass}>{amountStr}</span>
    </div>
  );
}
