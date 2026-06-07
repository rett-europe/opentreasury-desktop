import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, TrendingUp, TrendingDown } from 'lucide-react';
import { SegmentedToggle } from '../../components/SegmentedToggle/index.js';
import { TagCard } from '../../components/TagCard/index.js';
import {
  DateRangePicker,
  type Preset as DateRangePreset,
} from '../../components/DateRangePicker/index.js';
import { getInsightsLandingSummary } from '../../services/insightsApi.js';
import {
  last12Months,
  last3Months,
  lastMonth,
  lastYear,
  thisMonth,
  thisYear,
} from '../../utils/datePresets.js';
import { useFormatters } from '../../format/index.js';
import type { DateRange } from '../../types/movement.js';
import type { InsightsLandingSummaryResponse } from '../../../shared/ipc-contracts/insights.js';
import './InsightsScreen.css';

type DisplayMode = 'volumen' | 'neto' | 'mov';

const isoToDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const dateToIso = (d: Date): string => d.toISOString().slice(0, 10);

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: InsightsLandingSummaryResponse }
  | { kind: 'error'; message: string };

export interface InsightsScreenProps {
  /**
   * Invoked when a TagCard is clicked; the parent navigates to the drilldown
   * route with the chosen `tagId`. Required for spec §4 deep-linking.
   * Optional so legacy mounts (tests) continue to work without crashing.
   */
  readonly onTagSelect?: (tagId: string) => void;
}

/**
 * InsightsScreen — tag-based analytics landing page.
 *
 * Spec: docs/ux/specs/ux-005-insights-final-spec.md §3
 * Layout: KPI strip + segmented toggle + tag card grid + footnote
 */
export function InsightsScreen({ onTagSelect }: InsightsScreenProps = {}): JSX.Element {
  const { t } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [displayMode, setDisplayMode] = useState<DisplayMode>('volumen');

  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const r = last12Months(new Date());
    return { from: isoToDate(r.from), to: isoToDate(r.to) };
  });

  const loadData = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const response = await getInsightsLandingSummary({
        dateWindow: { startISO: dateToIso(dateRange.from), endISO: dateToIso(dateRange.to) },
      });
      setState({ kind: 'loaded', data: response });
    } catch (error) {
      setState({ kind: 'error', message: String(error) });
    }
  }, [dateRange]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const activePresetId = useMemo(() => {
    const today = new Date();
    const fromIso = dateToIso(dateRange.from);
    const toIso = dateToIso(dateRange.to);
    for (const fn of [thisMonth, lastMonth, last3Months, thisYear, lastYear, last12Months]) {
      const r = fn(today);
      if (r.from === fromIso && r.to === toIso) {
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
  }, [dateRange]);

  const pageHeader = (
    <header className="ot-page-header">
      <div>
        <h1>{t('insights.title')}</h1>
        <p className="ot-page-header__subtitle">{t('insights.subtitle')}</p>
      </div>
    </header>
  );

  const dateRangePicker = (
    <DateRangePicker
      value={dateRange}
      onChange={setDateRange}
      presets={presets}
      activePresetId={activePresetId}
      customRangeLayout="popover"
      customTriggerLabel={t('datePresets.custom')}
      customLabels={{
        from: t('saldo.dateRange.from', { defaultValue: 'Desde' }),
        to: t('saldo.dateRange.to', { defaultValue: 'Hasta' }),
        apply: t('saldo.dateRange.apply', { defaultValue: 'Aplicar' }),
        invalidRange: t('saldo.dateRange.invalidRange', { defaultValue: 'Rango inválido' }),
      }}
    />
  );

  if (state.kind === 'loading') {
    return (
      <div className="ot-insights">
        {pageHeader}
        <div className="ot-insights__toolbar">{dateRangePicker}</div>
        <div className="ot-insights__loading">{t('insights.states.loading')}</div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="ot-insights">
        {pageHeader}
        <div className="ot-insights__toolbar">{dateRangePicker}</div>
        <div className="ot-insights__error ot-p-card ot-p-card--padded">
          <p>{t('insights.states.error')}</p>
          <button type="button" onClick={loadData} className="ot-insights__retry">
            {t('common.retry')}
          </button>
        </div>
      </div>
    );
  }

  const { data } = state;
  const { kpis, tags } = data;
  const hasTags = tags.length > 0;

  return (
    <div className="ot-insights">
      {pageHeader}
      <div className="ot-insights__toolbar">
        {dateRangePicker}
        <SegmentedToggle
          options={[
            { value: 'volumen', label: t('insights.displayMode.volume') },
            { value: 'neto', label: t('insights.displayMode.net') },
            { value: 'mov', label: t('insights.displayMode.count') },
          ]}
          value={displayMode}
          onChange={(val) => setDisplayMode(val as DisplayMode)}
          ariaLabel={t('insights.displayMode.ariaLabel')}
        />
      </div>

      <div className="ot-kpi-strip">
        <div className="ot-kpi">
          <div
            className="ot-kpi__icon"
            style={{
              background: 'var(--color-surface-tertiary)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <Tag size={20} aria-hidden="true" />
          </div>
          <div className="ot-kpi__content">
            <div className="ot-kpi__label">{t('insights.kpi.activeTags')}</div>
            <div className="ot-kpi__value">{kpis.etiquetasActivasCount}</div>
            <div className="ot-kpi__sublabel">
              {t('insights.kpi.activeTagsSublabel', { total: kpis.etiquetasTotalesCount })}
            </div>
          </div>
        </div>

        <div className="ot-kpi ot-kpi--income">
          <div className="ot-kpi__icon">
            <TrendingUp size={20} aria-hidden="true" />
          </div>
          <div className="ot-kpi__content">
            <div className="ot-kpi__label">{t('insights.kpi.totalIncome')}</div>
            <div className="ot-kpi__value ot-tnum">
              {formatCurrency(kpis.ingresosEtiquetadosCents / 100)}
            </div>
            <div className="ot-kpi__sublabel">{t('insights.kpi.totalIncomeSublabel')}</div>
          </div>
        </div>

        <div className="ot-kpi ot-kpi--expense">
          <div className="ot-kpi__icon">
            <TrendingDown size={20} aria-hidden="true" />
          </div>
          <div className="ot-kpi__content">
            <div className="ot-kpi__label">{t('insights.kpi.totalExpense')}</div>
            <div className="ot-kpi__value ot-tnum">
              {formatCurrency(kpis.gastosEtiquetadosCents / 100)}
            </div>
            <div className="ot-kpi__sublabel">{t('insights.kpi.totalExpenseSublabel')}</div>
          </div>
        </div>
      </div>

      {!hasTags ? (
        <div className="ot-insights__empty-state ot-p-card ot-p-card--padded">
          <div className="ot-insights__empty-content">
            <svg
              className="ot-insights__empty-icon"
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 3v18h18" />
              <path d="M18 17V9" />
              <path d="M13 17V5" />
              <path d="M8 17v-3" />
            </svg>
            <h2 className="ot-insights__empty-title">{t('insights.states.emptyTags')}</h2>
            <p className="ot-insights__empty-body">{t('insights.states.emptyTagsBody')}</p>
          </div>
        </div>
      ) : (
        <>
          <h2 className="ot-section-label">{t('insights.sectionLabel.tags')}</h2>
          <div className="ot-tag-cards">
            {tags.map((tag) => (
              <TagCard
                key={tag.tagId}
                tagId={tag.tagId}
                name={tag.name}
                {...(tag.color ? { color: tag.color } : {})}
                kpis={{
                  ingresos: tag.ingresosCents / 100,
                  gastos: tag.gastosCents / 100,
                  neto: tag.netoCents / 100,
                  count: tag.movimientosCount,
                }}
                displayMode={displayMode}
                archived={tag.archived}
                topCategorias={tag.topCategorias}
                {...(onTagSelect ? { onClick: () => onTagSelect(tag.tagId) } : {})}
              />
            ))}
          </div>
          <div className="ot-insights__footnote">{t('insights.footnote.multiLabel')}</div>
        </>
      )}
    </div>
  );
}
