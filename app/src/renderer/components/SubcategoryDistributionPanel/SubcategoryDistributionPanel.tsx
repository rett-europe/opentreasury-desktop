import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { SubcategoryRow } from '../../../shared/ipc-contracts/insights.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import './SubcategoryDistributionPanel.css';

export type SubcategoryDistributionView = 'gastos' | 'ingresos';

export type SubcategoryDistributionPanelProps = {
  readonly rows: ReadonlyArray<SubcategoryRow>;
  readonly view: SubcategoryDistributionView;
  /**
   * Maps `categoryId` (or `__uncat__`) to a CSS color (typically a
   * `var(--color-donut-N)`) so the row pills match the donut slice colours.
   */
  readonly categoryColorMap: ReadonlyMap<string, string>;
  /**
   * When set, the bar list is filtered to subcategories of that category and
   * percentages are computed within the category's total.
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
  /**
   * How many rows to show before the "show all" toggle reveals the rest.
   * Defaults to 10.
   */
  readonly topN?: number;
};

const UNCAT = '__uncat__';

/**
 * Companion ranked bar list for the category donut on the Insights drilldown.
 *
 * Renders one row per subcategory (filtered by view + optional category
 * selection), sorted by absolute amount desc. Each row shows a colour pill
 * inheriting the parent category's donut colour, the subcategory name,
 * a horizontal weight bar, and the locale-formatted amount (right-aligned,
 * never truncated — Saldo grid pattern).
 */
export function SubcategoryDistributionPanel({
  rows,
  view,
  categoryColorMap,
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
  topN = 10,
}: SubcategoryDistributionPanelProps): JSX.Element {
  const [showAll, setShowAll] = useState(false);

  const ranked = useMemo(() => {
    const filtered = rows
      .filter((r) => (view === 'ingresos' ? r.incomeCents > 0 : r.expenseCents > 0))
      .filter((r) =>
        selectedCategoryId == null ? true : (r.categoryId ?? UNCAT) === selectedCategoryId,
      )
      .map((r) => {
        const cents = view === 'ingresos' ? r.incomeCents : r.expenseCents;
        return {
          row: r,
          cents,
          key: `${r.categoryId ?? UNCAT}::${r.subcategoryId ?? UNCAT}`,
          colorVar: categoryColorMap.get(r.categoryId ?? UNCAT) ?? 'var(--color-donut-otras)',
        };
      });
    filtered.sort((a, b) => b.cents - a.cents);
    return filtered;
  }, [rows, view, selectedCategoryId, categoryColorMap]);

  const total = useMemo(() => ranked.reduce((sum, r) => sum + r.cents, 0), [ranked]);

  const visible = showAll ? ranked : ranked.slice(0, topN);
  const hasMore = ranked.length > topN;

  return (
    <section
      className="ot-subcat-dist ot-p-card ot-p-card--padded"
      aria-labelledby="ot-subcat-dist-title"
    >
      <header className="ot-subcat-dist__header">
        <h3 id="ot-subcat-dist-title" className="ot-subcat-dist__title">
          {title}
        </h3>
        {selectedCategoryId != null ? (
          <button
            type="button"
            className="ot-subcat-dist__chip"
            onClick={onClearSelection}
            aria-label={chipClearAriaLabel}
          >
            <span className="ot-subcat-dist__chip-text">
              {chipPrefixLabel}: {selectedCategoryName ?? ''}
            </span>
            <X size={12} aria-hidden="true" />
          </button>
        ) : null}
      </header>

      {ranked.length === 0 ? (
        <p className="ot-subcat-dist__empty">{emptyLabel}</p>
      ) : (
        <>
          <ul className="ot-subcat-dist__list" role="list">
            {visible.map(({ row, cents, key, colorVar }) => {
              const pct = total > 0 ? (cents / total) * 100 : 0;
              const amountStr = formatCurrency(cents / 100, locale);
              const tooltip = `${row.subcategoryName} — ${amountStr} (${pct.toFixed(1)}%)`;
              const valueClass =
                view === 'ingresos'
                  ? 'ot-subcat-dist__amount ot-subcat-dist__amount--income ot-tnum'
                  : 'ot-subcat-dist__amount ot-subcat-dist__amount--expense ot-tnum';
              return (
                <li key={key} className="ot-subcat-dist__row" title={tooltip}>
                  <div className="ot-subcat-dist__label">
                    <span
                      className="ot-subcat-dist__pill"
                      style={{ background: colorVar }}
                      aria-hidden="true"
                    />
                    <span className="ot-subcat-dist__name">{row.subcategoryName}</span>
                  </div>
                  <div
                    className="ot-subcat-dist__bar-track"
                    role="progressbar"
                    aria-label={tooltip}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(pct)}
                  >
                    <span
                      className="ot-subcat-dist__bar-fill"
                      style={{ width: `${Math.max(pct, 0.5)}%`, background: colorVar }}
                    />
                  </div>
                  <span className={valueClass}>{amountStr}</span>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className="ot-subcat-dist__footer">
              <button
                type="button"
                className="ot-subcat-dist__show-all"
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
