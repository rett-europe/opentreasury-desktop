import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Award, Calculator, Download, TrendingDown, TrendingUp } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { GroupedBarChart } from '../../components/GroupedBarChart/index.js';
import { getSaldoComparison } from '../../services/saldoApi.js';
import type {
  SaldoComparisonResponse,
  SaldoKpis,
  SaldoPeriod,
} from '../../../shared/ipc-contracts/saldo.js';
import { formatCurrency } from '../../utils/numberFormat.js';

/**
 * WI-22 S5 — SaldoScreen.
 *
 * Replaces the legacy `balance.*`-keyed stub with the real screen wired to
 * the frozen `saldo:get-comparison` IPC (Zod contract in
 * `shared/ipc-contracts/saldo.ts`). All server-derived fields (projections,
 * deltas) are rendered verbatim — no local recompute (Neo's
 * `server-derived-fields` pattern).
 *
 * Layout follows Niobe's UX spec (.squad/agents/niobe/wi-22-saldo-ux.md):
 *   header · period selector · KPI strip · monthly chart · category tables.
 */

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: SaldoComparisonResponse }
  | { kind: 'error'; message: string };

// Locale resolver — mirrors the pattern used by KPIStrip / MovementsScreen.
// Never `navigator.language`; always `i18n.language`.
function resolveLocale(lng: string): string {
  return lng.startsWith('es') ? 'es-ES' : 'en-US';
}

// Anchor = first day of the current period (UTC-safe, YYYY-MM-DD).
function computeAnchor(period: SaldoPeriod, now: Date): string {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  if (period === 'ano') return `${y}-01-01`;
  if (period === 'trim') {
    const qStart = Math.floor(m / 3) * 3 + 1; // 1|4|7|10
    return `${y}-${String(qStart).padStart(2, '0')}-01`;
  }
  return `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

function yearFromIso(iso: string): number {
  return Number.parseInt(iso.slice(0, 4), 10);
}

function formatMonthShort(iso: string, locale: string): string {
  // iso is YYYY-MM-DD. Parse in UTC to dodge TZ drift.
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

// Δ semantics per UX spec: |Δ| < 3% → flat.
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

  return (
    <div>
      <header className="ot-page-header">
        <div>
          <h1>{t('saldo.title')}</h1>
          <p className="ot-page-header__subtitle">{t('saldo.subtitle')}</p>
        </div>
        <div className="ot-page-header__actions">
          <Button variant="secondary" leadingIcon={<Download size={16} />} disabled>
            {t('balance.cta.export')}
          </Button>
        </div>
      </header>

      <PeriodSelector period={period} onChange={setPeriod} />

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
// Period selector (radiogroup) — matches Movements type-filter chip pattern.
// ---------------------------------------------------------------------------

type PeriodSelectorProps = {
  readonly period: SaldoPeriod;
  readonly onChange: (p: SaldoPeriod) => void;
};

function PeriodSelector({ period, onChange }: PeriodSelectorProps): JSX.Element {
  const { t } = useTranslation('common');
  const options: ReadonlyArray<{ value: SaldoPeriod; labelKey: string; srKey: string }> = [
    { value: 'ano', labelKey: 'saldo.period.options.year', srKey: 'saldo.period.srOption.year' },
    {
      value: 'trim',
      labelKey: 'saldo.period.options.quarter',
      srKey: 'saldo.period.srOption.quarter',
    },
    { value: 'mes', labelKey: 'saldo.period.options.month', srKey: 'saldo.period.srOption.month' },
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
// Loaded view — KPI strip + disclosure + chart + category table.
// ---------------------------------------------------------------------------

type LoadedProps = {
  readonly data: SaldoComparisonResponse;
  readonly locale: string;
};

function SaldoLoadedView({ data, locale }: LoadedProps): JSX.Element {
  const { t } = useTranslation('common');

  const priorYear = yearFromIso(data.priorPeriod.start);
  const comparisonSublabel = t('saldo.comparison.vsYear', { year: priorYear });

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
      {data.currentPeriod.isPartial ? (
        <PartialPeriodBadge
          daysElapsed={data.currentPeriod.daysElapsed}
          daysInPeriod={data.currentPeriod.daysInPeriod}
        />
      ) : null}

      <KpiStrip
        kpis={data.kpis}
        currentIncome={data.currentPeriod.totalIncome}
        currentExpense={data.currentPeriod.totalExpense}
        projected={data.currentPeriod.currentProjectedTotal}
        comparisonSublabel={comparisonSublabel}
        locale={locale}
      />

      <section aria-labelledby="saldo-chart-title">
        <div className="ot-section-label" id="saldo-chart-title">
          {t('saldo.chart.monthlyNetTitle')}
        </div>
        <p className="ot-page-header__subtitle">{t('saldo.chart.monthlyNetSubtitle')}</p>
        <GroupedBarChart
          series={data.monthlySeries.map((b) => ({
            label: formatMonthShort(b.monthIso, locale),
            values: [b.netIncome, b.netExpense] as const,
          }))}
          legend={[t('saldo.table.columns.income'), t('saldo.table.columns.expense')]}
          locale={locale}
          ariaLabel={t('saldo.chart.monthlyNetAriaLabel')}
          dataTableCaption={t('saldo.chart.dataTableCaption')}
          emptyLabel={t('saldo.chart.emptyMonth')}
        />
      </section>

      <CategoryTable
        current={data.currentPeriod.netByCategory}
        prior={data.priorPeriod.netByCategory}
        locale={locale}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Partial-period disclosure badge.
// ---------------------------------------------------------------------------

type PartialPeriodBadgeProps = {
  readonly daysElapsed: number;
  readonly daysInPeriod: number;
};

function PartialPeriodBadge({ daysElapsed, daysInPeriod }: PartialPeriodBadgeProps): JSX.Element {
  const { t } = useTranslation('common');
  const tooltip = t('saldo.projection.tooltip', { daysElapsed, daysInPeriod });
  return (
    <div
      className="ot-badge ot-badge--pending"
      role="note"
      title={tooltip}
      aria-label={t('saldo.projection.ariaHint')}
      data-testid="saldo-projection-badge"
      style={{ display: 'inline-block', marginTop: 'var(--space-3)' }}
    >
      {t('saldo.projection.badge')}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KPI strip — 4 KPIs, server-computed deltas rendered verbatim.
// ---------------------------------------------------------------------------

type KpiStripProps = {
  readonly kpis: SaldoKpis;
  readonly currentIncome: number;
  readonly currentExpense: number;
  readonly projected: { readonly income: number; readonly expense: number } | null;
  readonly comparisonSublabel: string;
  readonly locale: string;
};

function KpiStrip({
  kpis,
  currentIncome,
  currentExpense,
  projected,
  comparisonSublabel,
  locale,
}: KpiStripProps): JSX.Element {
  const { t } = useTranslation('common');

  const effectiveIncome = projected ? projected.income : currentIncome;
  const effectiveExpense = projected ? projected.expense : currentExpense;
  const effectiveNet = effectiveIncome - effectiveExpense;

  const biggest = kpis.biggestCategoryGrowth;

  return (
    <div className="ot-kpi-strip" role="status" aria-live="polite">
      <KpiCard
        icon={<Calculator size={20} />}
        iconBg="var(--color-brand-surface)"
        iconColor="var(--color-brand-primary)"
        label={t('saldo.kpi.net.label')}
        value={formatCurrency(effectiveNet, locale)}
        valueColor="var(--color-brand-primary)"
        delta={kpis.netDelta}
        projected={projected !== null}
        sublabel={comparisonSublabel}
        locale={locale}
        testId="saldo-kpi-net"
      />
      <KpiCard
        icon={<TrendingUp size={20} />}
        iconBg="var(--color-income-bg)"
        iconColor="var(--color-income-default)"
        label={t('saldo.kpi.income.label')}
        value={formatCurrency(effectiveIncome, locale)}
        valueColor="var(--color-income-default)"
        delta={kpis.incomeDelta}
        projected={projected !== null}
        sublabel={comparisonSublabel}
        locale={locale}
        testId="saldo-kpi-income"
      />
      <KpiCard
        icon={<TrendingDown size={20} />}
        iconBg="var(--color-expense-bg)"
        iconColor="var(--color-expense-default)"
        label={t('saldo.kpi.expense.label')}
        value={formatCurrency(effectiveExpense, locale)}
        valueColor="var(--color-expense-default)"
        delta={kpis.expenseDelta}
        projected={projected !== null}
        sublabel={comparisonSublabel}
        locale={locale}
        testId="saldo-kpi-expense"
      />
      <KpiCard
        icon={<Award size={20} />}
        iconBg="var(--color-brand-surface)"
        iconColor="var(--color-brand-primary)"
        label={t('saldo.kpi.biggestGrowth.label')}
        value={
          biggest
            ? t('saldo.kpi.biggestGrowth.value', {
                category: biggest.categoryName,
                delta: formatPct(biggest.deltaPct, locale),
              })
            : t('saldo.kpi.biggestGrowth.empty')
        }
        valueColor="var(--color-brand-primary)"
        delta={null}
        projected={false}
        sublabel={comparisonSublabel}
        locale={locale}
        testId="saldo-kpi-biggest-growth"
      />
    </div>
  );
}

type KpiCardProps = {
  readonly icon: JSX.Element;
  readonly iconBg: string;
  readonly iconColor: string;
  readonly label: string;
  readonly value: string;
  readonly valueColor: string;
  readonly delta: number | null;
  readonly projected: boolean;
  readonly sublabel: string;
  readonly locale: string;
  readonly testId: string;
};

function KpiCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  valueColor,
  delta,
  projected,
  sublabel,
  locale,
  testId,
}: KpiCardProps): JSX.Element {
  const { t } = useTranslation('common');
  const kind = classifyDelta(delta);
  const deltaText =
    kind === 'noPrior'
      ? '—'
      : kind === 'flat'
        ? formatPct(0, locale)
        : formatPct(delta as number, locale);
  const deltaAriaLabel = t(`saldo.kpi.delta.${kind}`);

  return (
    <div className="ot-kpi" data-testid={testId}>
      <div className="ot-kpi__icon" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div>
        <div className="ot-kpi__label">{label}</div>
        <div className="ot-kpi__value" style={{ color: valueColor }}>
          {value}
        </div>
        <div className="ot-kpi__delta">
          <span aria-label={deltaAriaLabel}>{deltaText}</span>
          <span> · </span>
          <span>{sublabel}</span>
        </div>
        {projected ? (
          <div
            className="ot-kpi__delta"
            data-testid={`${testId}-projected`}
            title={t('saldo.projection.rowTooltip')}
          >
            {t('saldo.projection.sublabel')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category table — current vs prior net per category, with delta pill.
// ---------------------------------------------------------------------------

type CategoryTableProps = {
  readonly current: SaldoComparisonResponse['currentPeriod']['netByCategory'];
  readonly prior: SaldoComparisonResponse['priorPeriod']['netByCategory'];
  readonly locale: string;
};

type MergedRow = {
  readonly id: string;
  readonly categoryId: string | null;
  readonly categoryName: string;
  readonly currentNet: number;
  readonly priorNet: number;
  readonly droppedThisPeriod: boolean;
};

function keyFor(categoryId: string | null): string {
  return categoryId ?? '__uncategorized__';
}

function mergeRows(
  current: CategoryTableProps['current'],
  prior: CategoryTableProps['prior'],
): MergedRow[] {
  const byKey = new Map<string, MergedRow>();
  for (const row of current) {
    const k = keyFor(row.categoryId);
    byKey.set(k, {
      id: k,
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      currentNet: row.income - row.expense,
      priorNet: 0,
      droppedThisPeriod: false,
    });
  }
  for (const row of prior) {
    const k = keyFor(row.categoryId);
    const existing = byKey.get(k);
    const priorNet = row.income - row.expense;
    if (existing) {
      byKey.set(k, { ...existing, priorNet });
    } else {
      byKey.set(k, {
        id: k,
        categoryId: row.categoryId,
        categoryName: row.categoryName,
        currentNet: 0,
        priorNet,
        droppedThisPeriod: priorNet !== 0,
      });
    }
  }
  return [...byKey.values()].sort((a, b) => {
    // Absolute current first, then prior, then name.
    const absDiff = Math.abs(b.currentNet) - Math.abs(a.currentNet);
    if (absDiff !== 0) return absDiff;
    const priorDiff = Math.abs(b.priorNet) - Math.abs(a.priorNet);
    if (priorDiff !== 0) return priorDiff;
    return a.categoryName.localeCompare(b.categoryName);
  });
}

function computeRowDelta(currentNet: number, priorNet: number): number | null {
  if (priorNet === 0) return null;
  return (currentNet - priorNet) / Math.abs(priorNet);
}

function CategoryTable({ current, prior, locale }: CategoryTableProps): JSX.Element {
  const { t } = useTranslation('common');
  const rows = useMemo(() => mergeRows(current, prior), [current, prior]);

  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('saldo.states.emptyCurrent.title')}
        body={t('saldo.states.emptyCurrent.body')}
      />
    );
  }

  return (
    <section aria-labelledby="saldo-table-caption">
      <div className="ot-section-label" id="saldo-table-caption">
        {t('saldo.table.caption')}
      </div>
      <table className="ot-table" data-testid="saldo-category-table">
        <thead>
          <tr>
            <th scope="col">{t('saldo.table.columns.category')}</th>
            <th scope="col" style={{ textAlign: 'right' }}>
              {t('saldo.chart.series.current')}
            </th>
            <th scope="col" style={{ textAlign: 'right' }}>
              {t('saldo.chart.series.prior')}
            </th>
            <th scope="col" style={{ textAlign: 'right' }}>
              {t('saldo.table.columns.delta')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const delta = computeRowDelta(row.currentNet, row.priorNet);
            const kind = classifyDelta(delta);
            const deltaText =
              kind === 'noPrior'
                ? '—'
                : kind === 'flat'
                  ? formatPct(0, locale)
                  : formatPct(delta as number, locale);
            const deltaTitle =
              kind === 'noPrior'
                ? t('saldo.table.noPrior')
                : kind === 'flat'
                  ? t('saldo.table.flat')
                  : t(`saldo.kpi.delta.${kind}`);
            const displayName =
              row.categoryId === null ? t('saldo.table.uncategorized') : row.categoryName;
            return (
              <tr key={row.id} data-testid={`saldo-row-${row.id}`}>
                <td>
                  {displayName}
                  {row.droppedThisPeriod ? (
                    <div className="ot-kpi__delta" data-testid={`saldo-row-${row.id}-dropped`}>
                      {t('saldo.table.dropped')}
                    </div>
                  ) : null}
                </td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(row.currentNet, locale)}</td>
                <td style={{ textAlign: 'right' }}>{formatCurrency(row.priorNet, locale)}</td>
                <td style={{ textAlign: 'right' }} title={deltaTitle}>
                  {deltaText}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
