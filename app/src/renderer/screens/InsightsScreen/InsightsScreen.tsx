import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, TrendingUp, TrendingDown } from 'lucide-react';
import { SegmentedToggle } from '../../components/SegmentedToggle/index.js';
import { TagCard } from '../../components/TagCard/index.js';
import { getInsightsLandingSummary } from '../../services/insightsApi.js';
import { thisYear } from '../../utils/datePresets.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import type { InsightsLandingSummaryResponse } from '../../../shared/ipc-contracts/insights.js';
import './InsightsScreen.css';

type DisplayMode = 'volumen' | 'neto' | 'mov';

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: InsightsLandingSummaryResponse }
  | { kind: 'error'; message: string };

/**
 * InsightsScreen — tag-based analytics landing page.
 *
 * Spec: docs/ux/specs/ux-005-insights-final-spec.md §3
 * Layout: KPI strip + segmented toggle + tag card grid + footnote
 */
export function InsightsScreen(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [displayMode, setDisplayMode] = useState<DisplayMode>('volumen');

  const loadData = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const today = new Date();
      const { from, to } = thisYear(today);
      const response = await getInsightsLandingSummary({
        dateWindow: { startISO: from, endISO: to },
      });
      setState({ kind: 'loaded', data: response });
    } catch (error) {
      setState({ kind: 'error', message: String(error) });
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (state.kind === 'loading') {
    return (
      <div className="ot-insights">
        <header className="ot-page-header">
          <div>
            <h1>{t('insights.title')}</h1>
            <p className="ot-page-header__subtitle">{t('insights.subtitle')}</p>
          </div>
        </header>
        <div className="ot-insights__loading">{t('insights.states.loading')}</div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="ot-insights">
        <header className="ot-page-header">
          <div>
            <h1>{t('insights.title')}</h1>
            <p className="ot-page-header__subtitle">{t('insights.subtitle')}</p>
          </div>
        </header>
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
      <header className="ot-page-header">
        <div>
          <h1>{t('insights.title')}</h1>
          <p className="ot-page-header__subtitle">{t('insights.subtitle')}</p>
        </div>
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
      </header>

      <div className="ot-kpi-strip">
        <div className="ot-kpi">
          <Tag className="ot-kpi__icon" size={24} aria-hidden="true" />
          <div className="ot-kpi__content">
            <div className="ot-kpi__label">{t('insights.kpi.activeTags')}</div>
            <div className="ot-kpi__value">{kpis.etiquetasActivasCount}</div>
            <div className="ot-kpi__sublabel">
              {t('insights.kpi.activeTagsSublabel', { total: kpis.etiquetasTotalesCount })}
            </div>
          </div>
        </div>

        <div className="ot-kpi ot-kpi--income">
          <TrendingUp className="ot-kpi__icon" size={24} aria-hidden="true" />
          <div className="ot-kpi__content">
            <div className="ot-kpi__label">{t('insights.kpi.totalIncome')}</div>
            <div className="ot-kpi__value ot-tnum">
              {formatCurrency(kpis.ingresosEtiquetadosCents / 100, i18n.language)}
            </div>
            <div className="ot-kpi__sublabel">{t('insights.kpi.totalIncomeSublabel')}</div>
          </div>
        </div>

        <div className="ot-kpi ot-kpi--expense">
          <TrendingDown className="ot-kpi__icon" size={24} aria-hidden="true" />
          <div className="ot-kpi__content">
            <div className="ot-kpi__label">{t('insights.kpi.totalExpense')}</div>
            <div className="ot-kpi__value ot-tnum">
              {formatCurrency(kpis.gastosEtiquetadosCents / 100, i18n.language)}
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
              />
            ))}
          </div>
          <div className="ot-insights__footnote">{t('insights.footnote.multiLabel')}</div>
        </>
      )}
    </div>
  );
}
