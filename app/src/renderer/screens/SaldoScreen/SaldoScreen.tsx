import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Calculator, Calendar, TrendingDown, TrendingUp } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { GroupedBarChart } from '../../components/GroupedBarChart/index.js';
import { getSaldoComparison } from '../../services/saldoApi.js';
import type {
  SaldoCategoryNet,
  SaldoComparisonResponse,
  SaldoMonthlyBucket,
  SaldoPeriod,
} from '../../../shared/ipc-contracts/saldo.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import './SaldoScreen.css';

/**
 * WI-22 — SaldoScreen, prototype-fidelity redesign.
 *
 * Reference: `.squad/decisions/inbox/panel_saldo.png` + Mouse's spec
 * (`.squad/decisions/inbox/mouse-saldo-redesign-spec.md`).
 *
 * Layout: page-header · period selector + year chip + export · KPI strip
 * (3 cards) · monthly net chart (two-year series) · paired Ingresos/Gastos
 * panels.
 *
 * Server-derived fields (period-level projected totals) are rendered verbatim.
 * Per-category projected deltas are derived client-side from the exposed
 * scale factor (`daysInPeriod / daysElapsed`) — see Neo's adequacy note.
 */

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: SaldoComparisonResponse }
  | { kind: 'error'; message: string };

function resolveLocale(lng: string): string {
  return lng.startsWith('es') ? 'es-ES' : 'en-US';
}

function computeAnchor(period: SaldoPeriod, now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'ano') return `${y}-01-01`;
  if (period === 'trim') {
    const qStart = Math.floor(m / 3) * 3 + 1;
    return `${y}-${String(qStart).padStart(2, '0')}-01`;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function yearFromIso(iso: string): number {
  return Number.parseInt(iso.slice(0, 4), 10);
}

function formatMonthShort(iso: string, locale: string): string {
  const parts = iso.split('-').map((s) => Number.parseInt(s, 10));
  const y = parts[0] ?? 1970;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(date);
}

function formatPct(delta: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    signDisplay: 'exceptZero',
    maximumFractionDigits: 0,
  }).format(delta);
}

type DeltaKind = 'up' | 'down' | 'flat' | 'noPrior';
function classifyDelta(delta: number | null): DeltaKind {
  if (delta === null) return 'noPrior';
  if (Math.abs(delta) < 0.03) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

export function SaldoScreen(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = resolveLocale(i18n.language);
  const [period, setPeriod] = useState<SaldoPeriod>('ano');
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });

  const fetchData = useCallback(async (p: SaldoPeriod): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const anchor = computeAnchor(p, new Date());
      const data = await getSaldoComparison({ period: p, anchor });
      setState({ kind: 'loaded', data });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void fetchData(period);
  }, [period, fetchData]);

  const handleRetry = useCallback((): void => {
    void fetchData(period);
  }, [period, fetchData]);

  const years =
    state.kind === 'loaded'
      ? {
          prior: yearFromIso(state.data.priorPeriod.start),
          current: yearFromIso(state.data.currentPeriod.start),
        }
      : null;

  return (
    <div>
      <header className="ot-page-header">
        <div>
          <h1>{t('saldo.title')}</h1>
          <p className="ot-page-header__subtitle">{t('saldo.subtitle')}</p>
        </div>
        <div className="ot-page-header__actions">
          <PeriodSelector period={period} onChange={setPeriod} />
          {years ? <YearChip priorYear={years.prior} currentYear={years.current} t={t} /> : null}
        </div>
      </header>

      {state.kind === 'loading' ? (
        <div className="ot-skeleton" role="status" style={{ minHeight: 200 }}>
          {t('saldo.states.loading')}
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <EmptyState
          title={t('saldo.states.error.title')}
          body={t('saldo.states.error.body')}
          actions={
            <Button variant="primary" onClick={handleRetry}>
              {t('saldo.states.error.retry')}
            </Button>
          }
        />
      ) : null}

      {state.kind === 'loaded' ? <SaldoLoadedView data={state.data} locale={locale} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Period selector.
// ---------------------------------------------------------------------------

type PeriodSelectorProps = {
  readonly period: SaldoPeriod;
  readonly onChange: (p: SaldoPeriod) => void;
};

function PeriodSelector({ period, onChange }: PeriodSelectorProps): JSX.Element {
  const { t } = useTranslation('common');
  const options: ReadonlyArray<{ value: SaldoPeriod; labelKey: string; srKey: string }> = [
    { value: 'mes', labelKey: 'saldo.period.options.month', srKey: 'saldo.period.srOption.month' },
    {
      value: 'trim',
      labelKey: 'saldo.period.options.quarter',
      srKey: 'saldo.period.srOption.quarter',
    },
    { value: 'ano', labelKey: 'saldo.period.options.year', srKey: 'saldo.period.srOption.year' },
  ];

  return (
    <div
      className="ot-filter-bar"
      role="group"
      aria-label={t('saldo.period.label')}
      data-testid="saldo-period-selector"
    >
      <div className="ot-filter-bar__chips" role="radiogroup" aria-label={t('saldo.period.label')}>
        {options.map((opt) => {
          const active = period === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={t(opt.srKey)}
              className={
                active ? 'ot-filter-bar__chip ot-filter-bar__chip--active' : 'ot-filter-bar__chip'
              }
              onClick={() => onChange(opt.value)}
              data-testid={`saldo-period-${opt.value}`}
            >
              {t(opt.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Year chip — non-interactive context pill (e.g. "📅 2025 vs 2026").
// ---------------------------------------------------------------------------

type YearChipProps = {
  readonly priorYear: number;
  readonly currentYear: number;
  readonly t: TFunction;
};

function YearChip({ priorYear, currentYear, t }: YearChipProps): JSX.Element {
  const label = t('saldo.yearChip.label', { priorYear, currentYear });
  return (
    <span
      className="ot-year-chip"
      role="note"
      aria-label={label}
      data-testid="saldo-year-chip"
      title={label}
    >
      <span className="ot-year-chip__icon" aria-hidden="true">
        <Calendar size={14} />
      </span>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Loaded view.
// ---------------------------------------------------------------------------

type LoadedProps = {
  readonly data: SaldoComparisonResponse;
  readonly locale: string;
};

function SaldoLoadedView({ data, locale }: LoadedProps): JSX.Element {
  const { t } = useTranslation('common');
  const priorYear = yearFromIso(data.priorPeriod.start);
  const currentYear = yearFromIso(data.currentPeriod.start);

  const isFullyEmpty =
    data.currentPeriod.totalIncome === 0 &&
    data.currentPeriod.totalExpense === 0 &&
    data.priorPeriod.totalIncome === 0 &&
    data.priorPeriod.totalExpense === 0;

  if (isFullyEmpty) {
    return (
      <EmptyState
        title={t('saldo.states.emptyBoth.title')}
        body={t('saldo.states.emptyBoth.body')}
      />
    );
  }

  return (
    <>
      <KpiStrip data={data} locale={locale} priorYear={priorYear} currentYear={currentYear} />

      <MonthlyNetChart
        currentSeries={data.monthlySeries}
        priorSeries={data.priorMonthlySeries}
        priorYear={priorYear}
        currentYear={currentYear}
        locale={locale}
      />

      <CategoryPanels
        current={data.currentPeriod.netByCategory}
        prior={data.priorPeriod.netByCategory}
        totalIncome={data.currentPeriod.totalIncome}
        totalExpense={data.currentPeriod.totalExpense}
        daysElapsed={data.currentPeriod.daysElapsed}
        daysInPeriod={data.currentPeriod.daysInPeriod}
        isPartial={data.currentPeriod.isPartial}
        priorYear={priorYear}
        currentYear={currentYear}
        locale={locale}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// KPI strip — 3 cards (Ingresos / Gastos / Saldo neto).
// ---------------------------------------------------------------------------

type KpiStripProps = {
  readonly data: SaldoComparisonResponse;
  readonly locale: string;
  readonly priorYear: number;
  readonly currentYear: number;
};

function KpiStrip({ data, locale, priorYear, currentYear }: KpiStripProps): JSX.Element {
  const { t } = useTranslation('common');
  const { currentPeriod, priorPeriod } = data;
  const projected = currentPeriod.currentProjectedTotal;

  const curIncome = currentPeriod.totalIncome;
  const curExpense = currentPeriod.totalExpense;
  const curNet = curIncome - curExpense;
  const priorIncome = priorPeriod.totalIncome;
  const priorExpense = priorPeriod.totalExpense;
  const priorNet = priorIncome - priorExpense;

  const fmt = (v: number): string => formatCurrency(v, locale, 'EUR');

  const incomeSublabel = projected
    ? t('saldo.kpi.sublabel.priorAndProjected', {
        priorYear,
        priorValue: fmt(priorIncome),
        currentYear,
        projectedValue: fmt(projected.income),
      })
    : t('saldo.kpi.sublabel.priorOnly', {
        priorYear,
        priorValue: fmt(priorIncome),
      });

  const expenseSublabel = projected
    ? t('saldo.kpi.sublabel.priorAndProjected', {
        priorYear,
        priorValue: fmt(priorExpense),
        currentYear,
        projectedValue: fmt(projected.expense),
      })
    : t('saldo.kpi.sublabel.priorOnly', {
        priorYear,
        priorValue: fmt(priorExpense),
      });

  // Per prototype, Saldo Neto card shows only the prior-year sublabel (no
  // projection line).
  const netSublabel = t('saldo.kpi.sublabel.priorOnly', {
    priorYear,
    priorValue: fmt(priorNet),
  });

  return (
    <div className="ot-kpi-strip" role="status" aria-live="polite">
      <div className="ot-kpi ot-kpi--income" data-testid="saldo-kpi-income">
        <div className="ot-kpi__icon">
          <TrendingUp size={20} />
        </div>
        <div>
          <div className="ot-kpi__label">{t('saldo.kpi.income.labelTotal')}</div>
          <div className="ot-kpi__value">{fmt(curIncome)}</div>
          <div className="ot-kpi__sublabel">{incomeSublabel}</div>
        </div>
      </div>

      <div className="ot-kpi ot-kpi--expense" data-testid="saldo-kpi-expense">
        <div className="ot-kpi__icon">
          <TrendingDown size={20} />
        </div>
        <div>
          <div className="ot-kpi__label">{t('saldo.kpi.expense.labelTotal')}</div>
          <div className="ot-kpi__value">{fmt(curExpense)}</div>
          <div className="ot-kpi__sublabel">{expenseSublabel}</div>
        </div>
      </div>

      <div className="ot-kpi ot-kpi--net" data-testid="saldo-kpi-net">
        <div className="ot-kpi__icon">
          <Calculator size={20} />
        </div>
        <div>
          <div className="ot-kpi__label">{t('saldo.kpi.net.labelTotal')}</div>
          <div className="ot-kpi__value">{fmt(curNet)}</div>
          <div className="ot-kpi__sublabel">{netSublabel}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly net chart — two year series fed to GroupedBarChart.
// ---------------------------------------------------------------------------

type MonthlyNetChartProps = {
  readonly currentSeries: ReadonlyArray<SaldoMonthlyBucket>;
  readonly priorSeries: ReadonlyArray<SaldoMonthlyBucket>;
  readonly priorYear: number;
  readonly currentYear: number;
  readonly locale: string;
};

function MonthlyNetChart({
  currentSeries,
  priorSeries,
  priorYear,
  currentYear,
  locale,
}: MonthlyNetChartProps): JSX.Element {
  const { t } = useTranslation('common');

  // Join by month index (both series are same length by contract — the backend
  // emits zero-filled buckets when a period has no prior data).
  const series = useMemo(() => {
    const n = Math.max(currentSeries.length, priorSeries.length);
    const out: Array<{ label: string; values: readonly [number, number] }> = [];
    for (let i = 0; i < n; i += 1) {
      const cur = currentSeries[i];
      const prev = priorSeries[i];
      const curNet = cur ? cur.netIncome - cur.netExpense : 0;
      const priorNet = prev ? prev.netIncome - prev.netExpense : 0;
      const iso = cur?.monthIso ?? prev?.monthIso ?? '1970-01-01';
      out.push({ label: formatMonthShort(iso, locale), values: [curNet, priorNet] as const });
    }
    return out;
  }, [currentSeries, priorSeries, locale]);

  const currentLabel = String(currentYear);
  const priorLabel = String(priorYear);

  return (
    <section className="ot-saldo-chart" aria-labelledby="saldo-chart-title">
      <div className="ot-saldo-chart__header">
        <div>
          <h2 className="ot-saldo-chart__title" id="saldo-chart-title">
            {t('saldo.chart.monthlyNetTitle')}
          </h2>
          <p className="ot-saldo-chart__subtitle">
            {t('saldo.chart.monthlyNetSubtitleYears', { priorYear, currentYear })}
          </p>
        </div>
      </div>
      <GroupedBarChart
        series={series}
        legend={[currentLabel, priorLabel]}
        locale={locale}
        ariaLabel={t('saldo.chart.monthlyNetAriaLabel', { priorYear, currentYear })}
        dataTableCaption={t('saldo.chart.dataTableCaption')}
        emptyLabel={t('saldo.chart.emptyMonth')}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Paired category panels — Ingresos (left) + Gastos (right).
// ---------------------------------------------------------------------------

type CategoryPanelsProps = {
  readonly current: ReadonlyArray<SaldoCategoryNet>;
  readonly prior: ReadonlyArray<SaldoCategoryNet>;
  readonly totalIncome: number;
  readonly totalExpense: number;
  readonly daysElapsed: number;
  readonly daysInPeriod: number;
  readonly isPartial: boolean;
  readonly priorYear: number;
  readonly currentYear: number;
  readonly locale: string;
};

type PanelRow = {
  readonly id: string;
  readonly name: string;
  readonly prior: number;
  readonly current: number;
  readonly projectedCurrent: number;
  readonly delta: number | null;
};

function keyFor(categoryId: string | null): string {
  return categoryId ?? '__uncategorized__';
}

/**
 * Route category-net rows into income / expense panels. A category appears in
 * a panel whenever it has non-zero income (→ ingresos) or non-zero expense
 * (→ gastos) in EITHER period — mirrors the prototype where "Eventos" surfaces
 * on both sides when it carries both sign types.
 */
function buildPanelRows(
  current: ReadonlyArray<SaldoCategoryNet>,
  prior: ReadonlyArray<SaldoCategoryNet>,
  kind: 'income' | 'expense',
  scale: number,
): PanelRow[] {
  const byKey = new Map<
    string,
    { categoryId: string | null; name: string; cur: number; prev: number }
  >();
  const pick = (row: SaldoCategoryNet): number => (kind === 'income' ? row.income : row.expense);

  for (const row of current) {
    if (pick(row) <= 0) continue;
    const k = keyFor(row.categoryId);
    byKey.set(k, {
      categoryId: row.categoryId,
      name: row.categoryName,
      cur: pick(row),
      prev: 0,
    });
  }
  for (const row of prior) {
    if (pick(row) <= 0) continue;
    const k = keyFor(row.categoryId);
    const existing = byKey.get(k);
    if (existing) {
      byKey.set(k, { ...existing, prev: pick(row) });
    } else {
      byKey.set(k, {
        categoryId: row.categoryId,
        name: row.categoryName,
        cur: 0,
        prev: pick(row),
      });
    }
  }

  const rows: PanelRow[] = [];
  for (const [k, v] of byKey) {
    const projectedCurrent = v.cur * scale;
    const delta = v.prev > 0 ? (projectedCurrent - v.prev) / v.prev : null;
    rows.push({
      id: k,
      name: v.name,
      prior: v.prev,
      current: v.cur,
      projectedCurrent,
      delta,
    });
  }
  // Sort by absolute projected-current first (biggest movers up top), then prior, then name.
  rows.sort((a, b) => {
    const byCur = Math.abs(b.projectedCurrent) - Math.abs(a.projectedCurrent);
    if (byCur !== 0) return byCur;
    const byPrev = Math.abs(b.prior) - Math.abs(a.prior);
    if (byPrev !== 0) return byPrev;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function CategoryPanels({
  current,
  prior,
  totalIncome,
  totalExpense,
  daysElapsed,
  daysInPeriod,
  isPartial,
  priorYear,
  currentYear,
  locale,
}: CategoryPanelsProps): JSX.Element {
  const { t } = useTranslation('common');
  const scale = isPartial && daysElapsed > 0 ? daysInPeriod / daysElapsed : 1;

  const incomeRows = useMemo(
    () => buildPanelRows(current, prior, 'income', scale),
    [current, prior, scale],
  );
  const expenseRows = useMemo(
    () => buildPanelRows(current, prior, 'expense', scale),
    [current, prior, scale],
  );

  return (
    <div className="ot-saldo-panels">
      <CategoryPanel
        kind="income"
        title={t('saldo.panel.income.title')}
        subtitle={t('saldo.panel.subtitle')}
        totalLabel={t('saldo.panel.income.totalLabel', { year: currentYear })}
        totalValue={totalIncome}
        rows={incomeRows}
        priorYear={priorYear}
        currentYear={currentYear}
        isPartial={isPartial}
        locale={locale}
      />
      <CategoryPanel
        kind="expense"
        title={t('saldo.panel.expense.title')}
        subtitle={t('saldo.panel.subtitle')}
        totalLabel={t('saldo.panel.expense.totalLabel', { year: currentYear })}
        totalValue={totalExpense}
        rows={expenseRows}
        priorYear={priorYear}
        currentYear={currentYear}
        isPartial={isPartial}
        locale={locale}
      />
    </div>
  );
}

type CategoryPanelProps = {
  readonly kind: 'income' | 'expense';
  readonly title: string;
  readonly subtitle: string;
  readonly totalLabel: string;
  readonly totalValue: number;
  readonly rows: ReadonlyArray<PanelRow>;
  readonly priorYear: number;
  readonly currentYear: number;
  readonly isPartial: boolean;
  readonly locale: string;
};

function CategoryPanel({
  kind,
  title,
  subtitle,
  totalLabel,
  totalValue,
  rows,
  priorYear,
  currentYear,
  isPartial,
  locale,
}: CategoryPanelProps): JSX.Element {
  const { t } = useTranslation('common');
  return (
    <section
      className={`ot-saldo-panel ot-saldo-panel--${kind}`}
      data-testid={`saldo-panel-${kind}`}
      aria-labelledby={`saldo-panel-${kind}-title`}
    >
      <header className="ot-saldo-panel__header">
        <div>
          <h2 className="ot-saldo-panel__title" id={`saldo-panel-${kind}-title`}>
            {title}
          </h2>
          <p className="ot-saldo-panel__subtitle">{subtitle}</p>
        </div>
        <div className="ot-saldo-panel__total">
          <span className="ot-saldo-panel__total-label">{totalLabel}</span>
          <span className="ot-saldo-panel__total-value">
            {formatCurrency(totalValue, locale, 'EUR')}
          </span>
        </div>
      </header>

      {rows.length === 0 ? (
        <div className="ot-saldo-panel__empty" role="status">
          {t('saldo.panel.empty')}
        </div>
      ) : (
        <>
          <div className="ot-saldo-panel__columns" aria-hidden="true">
            <span>{t('saldo.panel.columns.category')}</span>
            <span className="ot-saldo-panel__col--right">{priorYear}</span>
            <span />
            <span className="ot-saldo-panel__col--right">{currentYear}</span>
            <span className="ot-saldo-panel__col--right">Δ</span>
          </div>
          <div className="ot-saldo-panel__rows">
            {rows.map((row) => (
              <CategoryRow
                key={row.id}
                row={row}
                kind={kind}
                isPartial={isPartial}
                priorYear={priorYear}
                locale={locale}
                t={t}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

type CategoryRowProps = {
  readonly row: PanelRow;
  readonly kind: 'income' | 'expense';
  readonly isPartial: boolean;
  readonly priorYear: number;
  readonly locale: string;
  readonly t: TFunction;
};

function CategoryRow({
  row,
  kind,
  isPartial,
  priorYear,
  locale,
  t,
}: CategoryRowProps): JSX.Element {
  const typeLabel = t(`saldo.panel.type.${kind}`);

  const maxVal = Math.max(row.prior, row.projectedCurrent, 1);
  const priorPct = (row.prior / maxVal) * 100;
  const currentPct = (row.projectedCurrent / maxVal) * 100;

  const deltaKind = classifyDelta(row.delta);
  const deltaText =
    deltaKind === 'noPrior'
      ? '—'
      : deltaKind === 'flat'
        ? formatPct(0, locale)
        : formatPct(row.delta as number, locale);

  const deltaSublabel = isPartial
    ? t('saldo.panel.row.projectedVs', { year: priorYear })
    : t('saldo.panel.row.vs', { year: priorYear });

  return (
    <div className="ot-saldo-row" data-testid={`saldo-row-${kind}-${row.id}`}>
      <span className="ot-saldo-row__name">{row.name}</span>
      <span className="ot-saldo-row__type">{typeLabel}</span>
      <span className="ot-saldo-row__prior">{formatCurrency(row.prior, locale, 'EUR')}</span>
      <div
        className="ot-saldo-row__bars"
        role="img"
        aria-label={t('saldo.panel.row.barsAria', {
          priorYear,
          priorValue: formatCurrency(row.prior, locale, 'EUR'),
          currentValue: formatCurrency(row.current, locale, 'EUR'),
        })}
      >
        <div className="ot-saldo-row__bar-track">
          <div
            className="ot-saldo-row__bar-fill ot-saldo-row__bar-fill--prior"
            style={{ width: `${priorPct}%` }}
          />
        </div>
        <div className="ot-saldo-row__bar-track">
          <div
            className="ot-saldo-row__bar-fill ot-saldo-row__bar-fill--current"
            style={{ width: `${currentPct}%` }}
          />
        </div>
      </div>
      <span className="ot-saldo-row__current">{formatCurrency(row.current, locale, 'EUR')}</span>
      <span
        className={`ot-saldo-row__delta ot-saldo-row__delta--${deltaKind}`}
        data-testid={`saldo-row-${kind}-${row.id}-delta`}
      >
        {deltaKind === 'up' ? '↑ ' : deltaKind === 'down' ? '↓ ' : ''}
        {deltaText}
      </span>
      <span className="ot-saldo-row__delta-sublabel">{deltaSublabel}</span>
    </div>
  );
}
