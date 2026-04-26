import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, TrendingUp, TrendingDown } from 'lucide-react';
import { SegmentedToggle } from '../../components/SegmentedToggle/index.js';
import { getInsightsLandingSummary } from '../../services/insightsApi.js';
import { thisYear } from '../../utils/datePresets.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import type {
  InsightsLandingSummaryResponse,
  TagSummary,
} from '../../../shared/ipc-contracts/insights.js';
import './InsightsScreen.css';

type DisplayMode = 'volume' | 'net' | 'count';

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'loaded'; data: InsightsLandingSummaryResponse }
  | { kind: 'error'; message: string };

/**
 * InsightsScreen — tag-based analytics landing page.
 *
 * Spec: docs/ux/specs/ux-005-insights-final-spec.md §3
 * Layout: KPI strip + segmented toggle + tag card grid + footnote
 * Data: Mocked until Mouse's PR #100 lands (insights:landing-summary handler)
 */
export function InsightsScreen(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [displayMode, setDisplayMode] = useState<DisplayMode>('volume');

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
            { value: 'volume', label: t('insights.displayMode.volume') },
            { value: 'net', label: t('insights.displayMode.net') },
            { value: 'count', label: t('insights.displayMode.count') },
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
              <TagCard key={tag.tagId} tag={tag} displayMode={displayMode} locale={i18n.language} />
            ))}
          </div>
          <div className="ot-insights__footnote">{t('insights.footnote.multiLabel')}</div>
        </>
      )}
    </div>
  );
}

interface TagCardProps {
  tag: TagSummary;
  displayMode: DisplayMode;
  locale: string;
}

/**
 * TagCard — placeholder until Mouse's component lands.
 * Matches the visual spec from ux-005 §3.2.
 */
function TagCard({ tag, displayMode, locale }: TagCardProps): JSX.Element {
  const showVolume = displayMode === 'volume';
  const showNet = displayMode === 'net';
  const showCount = displayMode === 'count';

  const hasSparkline = tag.sparklineNetCents && tag.sparklineNetCents.length >= 3;
  const topCatText =
    tag.topCategorias.length > 0 ? `Top: ${tag.topCategorias.map((c) => c.name).join(', ')}` : '';

  return (
    <div className="ot-tag-card ot-p-card" role="button" tabIndex={0}>
      <div className="ot-tag-card__header">
        <span
          className="ot-tag-card__color-dot"
          style={{ backgroundColor: tag.color }}
          aria-hidden="true"
        />
        <span className="ot-tag-card__name">{tag.name}</span>
        <span className="ot-tag-card__badge">{tag.movimientosCount} mov.</span>
      </div>

      {showVolume && (
        <div className="ot-tag-card__metrics ot-tag-card__metrics--volume">
          <div className="ot-tag-card__metric">
            <div className="ot-tag-card__metric-label">INGRESOS</div>
            <div className="ot-tag-card__metric-value ot-tnum">
              {formatCurrency(tag.ingresosCents / 100, locale)}
            </div>
          </div>
          <div className="ot-tag-card__metric">
            <div className="ot-tag-card__metric-label">GASTOS</div>
            <div className="ot-tag-card__metric-value ot-tnum">
              {formatCurrency(tag.gastosCents / 100, locale)}
            </div>
          </div>
          <div className="ot-tag-card__metric">
            <div className="ot-tag-card__metric-label">NETO</div>
            <div className="ot-tag-card__metric-value ot-tnum">
              {formatCurrency(tag.netoCents / 100, locale)}
            </div>
          </div>
        </div>
      )}

      {showNet && (
        <div className="ot-tag-card__metrics ot-tag-card__metrics--net">
          <div className="ot-tag-card__metric ot-tag-card__metric--hero">
            <div className="ot-tag-card__metric-label">NETO</div>
            <div className="ot-tag-card__metric-value ot-tag-card__metric-value--hero ot-tnum">
              {formatCurrency(tag.netoCents / 100, locale)}
            </div>
          </div>
        </div>
      )}

      {showCount && (
        <div className="ot-tag-card__metrics ot-tag-card__metrics--count">
          <div className="ot-tag-card__metric ot-tag-card__metric--hero">
            <div className="ot-tag-card__metric-label"># MOVIMIENTOS</div>
            <div className="ot-tag-card__metric-value ot-tag-card__metric-value--hero">
              {tag.movimientosCount}
            </div>
          </div>
        </div>
      )}

      {hasSparkline && (
        <div className="ot-tag-card__sparkline" aria-hidden="true">
          <SimpleSpark data={tag.sparklineNetCents!} />
        </div>
      )}

      {topCatText && <div className="ot-tag-card__footer">{topCatText}</div>}
    </div>
  );
}

/**
 * SimpleSpark — minimal inline sparkline (placeholder until real component).
 * Heights proportional to data range, all positive rendering.
 */
function SimpleSpark({ data }: { data: readonly number[] }): JSX.Element {
  const max = Math.max(...data.map(Math.abs));
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 100 - ((val - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg className="ot-sparkline" viewBox="0 0 100 32" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
