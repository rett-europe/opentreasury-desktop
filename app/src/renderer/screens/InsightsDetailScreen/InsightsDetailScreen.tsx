import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Calculator,
  ChevronRight,
  Layers,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';

import { DonutChart, donutColorIndex } from '../../components/DonutChart/index.js';
import { GroupedBarChart } from '../../components/GroupedBarChart/index.js';
import { SubcategoryRankedTable } from '../../components/SubcategoryRankedTable/index.js';
import {
  TagCombinerDropdown,
  type TagCombinerOption,
} from '../../components/TagCombinerDropdown/index.js';
import { AccountBarRow } from '../../components/AccountBarRow/index.js';
import {
  DateRangePicker,
  type Preset as DateRangePreset,
} from '../../components/DateRangePicker/index.js';
import { listTags } from '../../services/tagsApi.js';
import {
  getInsightsLabelByAccount,
  getInsightsLabelByCategory,
  getInsightsLabelBySubcategory,
  getInsightsLabelMonthlyEvolution,
  getInsightsLabelSummary,
} from '../../services/insightsDrilldownApi.js';
import { categoryColor } from '../../utils/colorHash.js';
import { useFormatters } from '../../format/index.js';
import {
  last12Months,
  last3Months,
  lastMonth,
  lastYear,
  thisMonth,
  thisYear,
} from '../../utils/datePresets.js';
import type { TagRecord } from '../../types/config.js';
import type {
  AccountBucket,
  CategorySlice,
  InsightsLabelSummaryResponse,
  MonthBucket,
  SubcategoryRow,
} from '../../../shared/ipc-contracts/insights.js';
import type { DateRange } from '../../types/movement.js';
import './InsightsDetailScreen.css';

type DrilldownWindow = {
  readonly windowStart: string; // YYYY-MM-DD
  readonly windowEnd: string; // YYYY-MM-DD
};

export type InsightsDetailScreenProps = {
  readonly tagIds: ReadonlyArray<string>;
  readonly initialWindow: DrilldownWindow;
  readonly onBack: () => void;
  readonly onTagsChange: (next: ReadonlyArray<string>) => void;
  readonly onSeeAllMovements: (filters: {
    readonly tagIds: ReadonlyArray<string>;
    readonly windowStart: string;
    readonly windowEnd: string;
  }) => void;
};

type DetailData = {
  readonly summary: InsightsLabelSummaryResponse;
  readonly categories: ReadonlyArray<CategorySlice>;
  readonly subcategories: ReadonlyArray<SubcategoryRow>;
  readonly months: ReadonlyArray<MonthBucket>;
  readonly accounts: ReadonlyArray<AccountBucket>;
};

type ScreenState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly data: DetailData }
  | { readonly kind: 'error'; readonly message: string };

const isoToDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);

const dateToIso = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * InsightsDetailScreen — drilldown view (UX-005 final spec §4, PR 4b/4).
 *
 * Mounts with a non-empty `tagIds` array (1+ tag IDs, OR semantics inside the
 * IPC layer per Morpheus's contract). Local state holds the active date
 * window; users can change it with a Saldo-parity `DateRangePicker`. All five
 * `insights:label-*` IPC calls fan out in parallel on every tag/window
 * change. URL/router state is mocked at the App.tsx level for now (no real
 * router); see decision drop in `.squad/decisions/inbox/`.
 */
export function InsightsDetailScreen({
  tagIds,
  initialWindow,
  onBack,
  onTagsChange,
  onSeeAllMovements,
}: InsightsDetailScreenProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatCurrency, formatMonth } = useFormatters();

  const [windowState, setWindowState] = useState<DrilldownWindow>(initialWindow);
  const [allTags, setAllTags] = useState<ReadonlyArray<TagRecord>>([]);
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  // ---- Tag list fetch (once) -------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    listTags()
      .then((resp) => {
        if (!cancelled) setAllTags(resp.tags);
      })
      .catch(() => {
        // Tag list failure is non-fatal — combiner just hides.
        if (!cancelled) setAllTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Detail data fetch ----------------------------------------------------

  const loadDetail = useCallback(async () => {
    if (tagIds.length === 0) return;
    const reqId = reqIdRef.current + 1;
    reqIdRef.current = reqId;
    setState({ kind: 'loading' });
    const req = {
      tagIds: tagIds.slice(),
      windowStart: windowState.windowStart,
      windowEnd: windowState.windowEnd,
    };
    try {
      const [summary, categoriesResp, subcategoriesResp, monthsResp, accountsResp] =
        await Promise.all([
          getInsightsLabelSummary(req),
          getInsightsLabelByCategory(req),
          getInsightsLabelBySubcategory(req),
          getInsightsLabelMonthlyEvolution(req),
          getInsightsLabelByAccount(req),
        ]);
      if (reqId !== reqIdRef.current) return; // stale
      setState({
        kind: 'loaded',
        data: {
          summary,
          categories: categoriesResp.categories,
          subcategories: subcategoriesResp.rows,
          months: monthsResp.months,
          accounts: accountsResp.accounts,
        },
      });
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setState({ kind: 'error', message: String(err) });
    }
  }, [tagIds, windowState.windowStart, windowState.windowEnd]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  // Reset cross-donut selection whenever the underlying data window changes.
  useEffect(() => {
    setSelectedCategoryId(null);
  }, [tagIds, windowState.windowStart, windowState.windowEnd]);

  // ---- Date range picker wiring (Saldo parity) -----------------------------

  const presets: ReadonlyArray<DateRangePreset> = useMemo(() => {
    const now = new Date();
    const make = (id: string, labelKey: string, fn: typeof thisMonth): DateRangePreset => ({
      id,
      label: t(labelKey),
      range: () => {
        const r = fn(now);
        return { from: isoToDate(r.from), to: isoToDate(r.to) };
      },
    });
    return [
      make('this-month', 'datePresets.thisMonth', thisMonth),
      make('last-month', 'datePresets.lastMonth', lastMonth),
      make('last-3-months', 'datePresets.last3Months', last3Months),
      make('this-year', 'datePresets.thisYear', thisYear),
      make('last-year', 'datePresets.lastYear', lastYear),
      make('last-12-months', 'datePresets.last12Months', last12Months),
    ];
  }, [t]);

  const dateValue: DateRange = useMemo(
    () => ({
      from: isoToDate(windowState.windowStart),
      to: isoToDate(windowState.windowEnd),
    }),
    [windowState],
  );

  const activePresetId = useMemo(() => {
    const today = new Date();
    for (const fn of [thisMonth, lastMonth, last3Months, thisYear, lastYear, last12Months]) {
      const r = fn(today);
      if (r.from === windowState.windowStart && r.to === windowState.windowEnd) {
        // Map factory back to preset id.
        const idx = [thisMonth, lastMonth, last3Months, thisYear, lastYear, last12Months].indexOf(
          fn,
        );
        return (
          ['this-month', 'last-month', 'last-3-months', 'this-year', 'last-year', 'last-12-months'][
            idx
          ] ?? null
        );
      }
    }
    return null;
  }, [windowState]);

  const onDateRangeChange = useCallback((next: DateRange) => {
    setWindowState({ windowStart: dateToIso(next.from), windowEnd: dateToIso(next.to) });
    setSelectedCategoryId(null);
  }, []);

  // ---- Tag combiner ---------------------------------------------------------

  const tagById = useMemo(() => {
    const m = new Map<string, TagRecord>();
    for (const tag of allTags) m.set(tag.id, tag);
    return m;
  }, [allTags]);

  const selectedTags = useMemo(
    () =>
      tagIds.map((id) => {
        const tag = tagById.get(id);
        return {
          id,
          name: tag?.name ?? id,
          color: tag?.color ?? categoryColor(id),
        };
      }),
    [tagIds, tagById],
  );

  const combinerOptions: ReadonlyArray<TagCombinerOption> = useMemo(
    () =>
      allTags
        .filter((tag) => !tag.archivedAt)
        .map((tag) => ({
          id: tag.id,
          name: tag.name,
          color: tag.color ?? categoryColor(tag.id),
        })),
    [allTags],
  );

  const onAddTag = useCallback(
    (id: string) => {
      if (tagIds.includes(id)) return;
      onTagsChange([...tagIds, id]);
    },
    [tagIds, onTagsChange],
  );

  const onRemoveTag = useCallback(
    (id: string) => {
      if (tagIds.length <= 1) return; // last-tag removal handled by caller
      onTagsChange(tagIds.filter((x) => x !== id));
    },
    [tagIds, onTagsChange],
  );

  const headerTitle = useMemo(() => selectedTags.map((t) => t.name).join(' ∩ '), [selectedTags]);

  // ---- Render ---------------------------------------------------------------

  if (state.kind === 'loading') {
    return (
      <div className="ot-insights-detail">
        <DetailHeader
          title={t('insights.detail.loadingTitle')}
          onBack={onBack}
          backLabel={t('insights.detail.back')}
        />
        <div className="ot-insights-detail__loading" role="status">
          {t('insights.detail.loading')}
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="ot-insights-detail">
        <DetailHeader
          title={headerTitle || t('insights.detail.loadingTitle')}
          onBack={onBack}
          backLabel={t('insights.detail.back')}
        />
        <div className="ot-insights-detail__error ot-p-card ot-p-card--padded" role="alert">
          <p>{t('insights.detail.error')}</p>
          <button
            type="button"
            className="ot-insights-detail__retry"
            onClick={() => {
              void loadDetail();
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const { data } = state;
  const incomeSlices = data.categories
    .filter((c) => c.incomeCents > 0)
    .map((c) => ({
      label: c.categoryName,
      value: c.incomeCents / 100,
      categoryId: c.categoryId ?? '__uncat__',
    }));
  const expenseSlices = data.categories
    .filter((c) => c.expenseCents > 0)
    .map((c) => ({
      label: c.categoryName,
      value: c.expenseCents / 100,
      categoryId: c.categoryId ?? '__uncat__',
    }));

  const incomeTotal = data.summary.incomeCents / 100;
  const expenseTotal = data.summary.expenseCents / 100;

  // Monthly evolution as grouped bars (income + expense per month).
  const monthLabels = data.months.map((m) => formatMonth(m.monthIso));
  const groupedSeries = data.months.map((m, idx) => ({
    label: monthLabels[idx] ?? m.monthIso,
    values: [m.incomeCents / 100, m.expenseCents / 100],
    barClassNames: ['ot-bar--income', 'ot-bar--expense'],
  }));

  const accountMaxTotalCents = data.accounts.reduce(
    (max, a) => Math.max(max, a.incomeCents + a.expenseCents),
    0,
  );

  // Build per-side category → donut colour map so the diverging chart's row
  // pills inherit the parent slice's colour. Each side orders categories
  // independently (matching the donut above it).
  const incomeColorMap = buildColorMap(incomeSlices.map((s) => s.categoryId));
  const expenseColorMap = buildColorMap(expenseSlices.map((s) => s.categoryId));

  const selectedCategoryName = selectedCategoryId
    ? (data.categories.find((c) => (c.categoryId ?? '__uncat__') === selectedCategoryId)
        ?.categoryName ?? null)
    : null;

  const onCategorySelect = (categoryId: string) => {
    setSelectedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  return (
    <div className="ot-insights-detail">
      <DetailHeader title={headerTitle} onBack={onBack} backLabel={t('insights.detail.back')} />

      {/* Tag combiner: chip(s) + add dropdown */}
      <div
        className="ot-insights-detail__combiner-row"
        aria-label={t('insights.detail.combinerAria')}
      >
        <ul
          className="ot-insights-detail__chips"
          aria-label={t('insights.detail.selectedTagsAria')}
        >
          {selectedTags.map((tag) => (
            <li key={tag.id} className="ot-insights-detail__chip">
              <span
                className="ot-insights-detail__chip-dot"
                style={{ backgroundColor: tag.color }}
                aria-hidden="true"
              />
              <span className="ot-insights-detail__chip-name">{tag.name}</span>
              {tagIds.length > 1 ? (
                <button
                  type="button"
                  className="ot-insights-detail__chip-remove"
                  aria-label={t('insights.detail.removeTagAria', { name: tag.name })}
                  onClick={() => onRemoveTag(tag.id)}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <TagCombinerDropdown
          availableTags={combinerOptions}
          selectedIds={tagIds}
          onAdd={onAddTag}
          labels={{
            trigger: t('insights.detail.combinerTrigger'),
            searchPlaceholder: t('insights.detail.combinerSearchPlaceholder'),
            empty: t('insights.detail.combinerEmpty'),
            listAriaLabel: t('insights.detail.combinerListAria'),
          }}
        />
      </div>

      <header className="ot-page-header">
        <div>
          <h1>{headerTitle}</h1>
          <p className="ot-page-header__subtitle">{t('insights.detail.subtitle')}</p>
        </div>
        <DateRangePicker
          value={dateValue}
          onChange={onDateRangeChange}
          presets={presets}
          activePresetId={activePresetId}
          customLabels={{
            from: t('saldo.dateRange.from', { defaultValue: 'Desde' }),
            to: t('saldo.dateRange.to', { defaultValue: 'Hasta' }),
            apply: t('saldo.dateRange.apply', { defaultValue: 'Aplicar' }),
            invalidRange: t('saldo.dateRange.invalidRange', {
              defaultValue: 'Rango inválido',
            }),
          }}
        />
      </header>

      {/* KPI strip */}
      <div className="ot-kpi-strip" role="status" aria-live="polite">
        <div className="ot-kpi ot-kpi--income">
          <div className="ot-kpi__icon">
            <TrendingUp size={20} aria-hidden="true" />
          </div>
          <div>
            <div className="ot-kpi__label">{t('insights.detail.kpi.income')}</div>
            <div className="ot-kpi__value ot-tnum">{formatCurrency(incomeTotal)}</div>
            <div className="ot-kpi__delta">
              {t('insights.detail.kpi.categoryCount', { count: data.summary.categoryCount })}
            </div>
          </div>
        </div>
        <div className="ot-kpi ot-kpi--expense">
          <div className="ot-kpi__icon">
            <TrendingDown size={20} aria-hidden="true" />
          </div>
          <div>
            <div className="ot-kpi__label">{t('insights.detail.kpi.expense')}</div>
            <div className="ot-kpi__value ot-tnum">{formatCurrency(expenseTotal)}</div>
            <div className="ot-kpi__delta">
              {t('insights.detail.kpi.categoryCount', { count: data.summary.categoryCount })}
            </div>
          </div>
        </div>
        <div className="ot-kpi ot-kpi--net">
          <div className="ot-kpi__icon">
            <Calculator size={20} aria-hidden="true" />
          </div>
          <div>
            <div className="ot-kpi__label">{t('insights.detail.kpi.net')}</div>
            <div className="ot-kpi__value ot-tnum">
              {formatCurrency(data.summary.netCents / 100)}
            </div>
            <div className="ot-kpi__delta">
              {t('insights.detail.kpi.txCount', { count: data.summary.txCount })}
            </div>
          </div>
        </div>
      </div>

      {/* Donut row */}
      <h2 className="ot-section-label">{t('insights.detail.section.distribution')}</h2>
      <div className="ot-insights-detail__donut-row">
        <DonutPanel
          title={t('insights.detail.donut.incomeTitle')}
          slices={incomeSlices}
          total={incomeTotal}
          emptyLabel={t('insights.detail.donut.incomeEmpty')}
          ariaLabel={t('insights.detail.donut.incomeAria')}
          selectedCategoryId={selectedCategoryId}
          onCategoryClick={onCategorySelect}
        />
        <DonutPanel
          title={t('insights.detail.donut.expenseTitle')}
          slices={expenseSlices}
          total={expenseTotal}
          emptyLabel={t('insights.detail.donut.expenseEmpty')}
          ariaLabel={t('insights.detail.donut.expenseAria')}
          selectedCategoryId={selectedCategoryId}
          onCategoryClick={onCategorySelect}
        />
      </div>

      {/*
        Subcategory ranked tables (Concept A — Neo's decision 2026-05-04).
        Two independent ranked lists side-by-side: gastos (left) and ingresos
        (right), each with its own scale, sort, and "% of side total" column.
        Replaces the previous diverging-bar chart, which implied a paired
        comparison that does not exist (the two sides share no subcategory
        keys). See `docs/ux/insights-subcategory-decision.md` for the
        rationale and `docs/ux/insights-subcategory-concept.md` §3 Concept A
        for the visual spec.
      */}
      <h2 className="ot-section-label">{t('insights.distribution.subcategory.title')}</h2>
      <SubcategoryRankedTable
        rows={data.subcategories}
        expenseCategoryColorMap={expenseColorMap}
        incomeCategoryColorMap={incomeColorMap}
        selectedCategoryId={selectedCategoryId}
        selectedCategoryName={selectedCategoryName}
        onClearSelection={() => setSelectedCategoryId(null)}
        title={t('insights.distribution.subcategory.panelHeading')}
        emptyLabel={t('insights.distribution.subcategory.empty')}
        sideEmptyLabel={t('insights.distribution.subcategory.sideEmpty')}
        showAllLabel={t('insights.distribution.subcategory.showAll')}
        showLessLabel={t('insights.distribution.subcategory.showLess')}
        chipClearAriaLabel={t('insights.distribution.subcategory.clearSelectionAria')}
        chipPrefixLabel={t('insights.distribution.subcategory.filteredBy')}
        amountColumnLabel={t('insights.distribution.subcategory.amountColumn')}
        percentColumnLabel={t('insights.distribution.subcategory.percentColumn')}
        expenseSideLabel={t('insights.detail.legend.expense')}
        incomeSideLabel={t('insights.detail.legend.income')}
      />

      {/* Subcategory table */}
      <h2 className="ot-section-label">{t('insights.detail.section.subcategories')}</h2>
      {data.subcategories.length === 0 ? (
        <p className="ot-insights-detail__empty">{t('insights.detail.subcategoryTable.empty')}</p>
      ) : (
        <SubcategoryTable rows={data.subcategories} t={t} />
      )}

      {/* Monthly evolution */}
      <h2 className="ot-section-label">{t('insights.detail.section.monthly')}</h2>
      {data.months.length === 0 ? (
        <p className="ot-insights-detail__empty">{t('insights.detail.monthly.empty')}</p>
      ) : (
        <div className="ot-insights-detail__chart-card ot-p-card ot-p-card--padded">
          <GroupedBarChart
            series={groupedSeries}
            legend={[
              { label: t('insights.detail.legend.income'), className: 'ot-bar--income' },
              { label: t('insights.detail.legend.expense'), className: 'ot-bar--expense' },
            ]}
            ariaLabel={t('insights.detail.monthly.ariaLabel')}
            dataTableCaption={t('insights.detail.monthly.tableCaption')}
            emptyLabel={t('insights.detail.monthly.empty')}
          />
        </div>
      )}

      {/* Per-account bars */}
      <h2 className="ot-section-label">{t('insights.detail.section.accounts')}</h2>
      {data.accounts.length === 0 ? (
        <p className="ot-insights-detail__empty">{t('insights.detail.accounts.empty')}</p>
      ) : (
        <div className="ot-insights-detail__accounts ot-p-card ot-p-card--padded">
          {data.accounts.map((acc) => (
            <AccountBarRow
              key={acc.accountId}
              accountId={acc.accountId}
              accountName={acc.accountName}
              accountColor={acc.accountColor}
              incomeCents={acc.incomeCents}
              expenseCents={acc.expenseCents}
              maxTotalCents={accountMaxTotalCents}
              labels={{
                income: t('insights.detail.legend.income'),
                expense: t('insights.detail.legend.expense'),
              }}
            />
          ))}
        </div>
      )}

      {/* Footer link */}
      <div className="ot-insights-detail__footer">
        <button
          type="button"
          className="ot-insights-detail__see-all"
          onClick={() =>
            onSeeAllMovements({
              tagIds: tagIds.slice(),
              windowStart: windowState.windowStart,
              windowEnd: windowState.windowEnd,
            })
          }
        >
          <Layers size={14} aria-hidden="true" />
          <span>{t('insights.detail.seeAllMovements')}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function DetailHeader({
  title,
  onBack,
  backLabel,
}: {
  readonly title: string;
  readonly onBack: () => void;
  readonly backLabel: string;
}): JSX.Element {
  return (
    <button type="button" className="ot-insights-detail__back" onClick={onBack} aria-label={title}>
      <ArrowLeft size={14} aria-hidden="true" />
      <span>{backLabel}</span>
    </button>
  );
}

function DonutPanel({
  title,
  slices,
  total,
  emptyLabel,
  ariaLabel,
  selectedCategoryId,
  onCategoryClick,
}: {
  readonly title: string;
  readonly slices: ReadonlyArray<{
    readonly label: string;
    readonly value: number;
    readonly categoryId: string;
  }>;
  readonly total: number;
  readonly emptyLabel: string;
  readonly ariaLabel: string;
  readonly selectedCategoryId?: string | null;
  readonly onCategoryClick?: (categoryId: string) => void;
}): JSX.Element {
  const { formatCurrency } = useFormatters();

  return (
    <div className="ot-donut-panel ot-p-card ot-p-card--padded">
      <h3 className="ot-donut-panel__title">{title}</h3>
      <div className="ot-donut-panel__body">
        <DonutChart slices={slices} total={total} ariaLabel={ariaLabel} emptyLabel={emptyLabel} />
        {slices.length > 0 ? (
          <ul className="ot-donut-panel__legend">
            {slices.map((s, idx) => {
              const pct = total > 0 ? (s.value / total) * 100 : 0;
              const isSelected = selectedCategoryId === s.categoryId;
              const className = `ot-donut-panel__legend-item${
                onCategoryClick ? ' ot-donut-panel__legend-item--clickable' : ''
              }${isSelected ? ' ot-donut-panel__legend-item--selected' : ''}`;
              const swatch = (
                <span
                  className="ot-donut-panel__legend-swatch"
                  style={{
                    background: `var(--color-donut-${donutColorIndex(idx, slices.length)})`,
                  }}
                  aria-hidden="true"
                />
              );
              const content = (
                <>
                  {swatch}
                  <span className="ot-donut-panel__legend-name">{s.label}</span>
                  <span className="ot-donut-panel__legend-value ot-tnum">
                    {formatCurrency(s.value)}
                  </span>
                  <span className="ot-donut-panel__legend-pct ot-tnum">{pct.toFixed(0)}%</span>
                </>
              );
              return (
                <li key={s.categoryId} className={className}>
                  {onCategoryClick ? (
                    <button
                      type="button"
                      className="ot-donut-panel__legend-button"
                      aria-pressed={isSelected}
                      onClick={() => onCategoryClick(s.categoryId)}
                    >
                      {content}
                    </button>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Maps each `categoryId` to its donut slice colour CSS variable. Uses the
 * same `donutColorIndex` stride helper as the donut chart so the bar list,
 * legend, and donut slices all align visually — a 3-category dataset gets
 * 3 visually distinct slots (0/2/5 — blue/green/red) instead of three
 * adjacent cool-end slots (0/1/2 — blue/cyan/green).
 */
function buildColorMap(categoryIds: ReadonlyArray<string>): Map<string, string> {
  const map = new Map<string, string>();
  const uniqueIds: string[] = [];
  for (const id of categoryIds) {
    if (!map.has(id)) {
      map.set(id, '');
      uniqueIds.push(id);
    }
  }
  uniqueIds.forEach((id, idx) => {
    map.set(id, `var(--color-donut-${donutColorIndex(idx, uniqueIds.length)})`);
  });
  return map;
}

function SubcategoryTable({
  rows,
  t,
}: {
  readonly rows: ReadonlyArray<SubcategoryRow>;
  readonly t: (key: string) => string;
}): JSX.Element {
  const { formatCurrency } = useFormatters();

  return (
    <div className="ot-insights-detail__subcat-table ot-p-card ot-p-card--padded">
      <table>
        <thead>
          <tr>
            <th scope="col">{t('insights.detail.subcategoryTable.category')}</th>
            <th scope="col">{t('insights.detail.subcategoryTable.subcategory')}</th>
            <th scope="col" className="ot-insights-detail__num">
              {t('insights.detail.subcategoryTable.income')}
            </th>
            <th scope="col" className="ot-insights-detail__num">
              {t('insights.detail.subcategoryTable.expense')}
            </th>
            <th scope="col" className="ot-insights-detail__num">
              {t('insights.detail.subcategoryTable.net')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const net = row.incomeCents - row.expenseCents;
            const key = `${row.categoryId ?? '__uncat__'}::${row.subcategoryId ?? '__uncat__'}`;
            return (
              <tr key={key}>
                <td>{row.categoryName}</td>
                <td>{row.subcategoryName}</td>
                <td className="ot-insights-detail__num ot-tnum">
                  {formatCurrency(row.incomeCents / 100)}
                </td>
                <td className="ot-insights-detail__num ot-tnum">
                  {formatCurrency(row.expenseCents / 100)}
                </td>
                <td
                  className={
                    net >= 0
                      ? 'ot-insights-detail__num ot-insights-detail__num--income ot-tnum'
                      : 'ot-insights-detail__num ot-insights-detail__num--expense ot-tnum'
                  }
                >
                  {formatCurrency(net / 100)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
