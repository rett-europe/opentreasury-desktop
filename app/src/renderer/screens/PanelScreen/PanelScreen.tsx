import { useTranslation } from 'react-i18next';
import { Calendar, Landmark, Plus, TrendingDown, TrendingUp, Calculator } from 'lucide-react';
import { Button } from '../../components/Button/index.js';

/**
 * Panel (Dashboard) stub — renders prototype chrome (page header, section
 * labels, KPI strip, account-card grid, recent-tx placeholder) with no data
 * wiring. This exists so Pedro sees the prototype look across all navigated
 * screens, not a generic "Coming soon" card.
 */
export function PanelScreen(): JSX.Element {
  const { t } = useTranslation('common');

  return (
    <div>
      <header className="ot-page-header">
        <div>
          <h1>{t('panel.title')}</h1>
          <p className="ot-page-header__subtitle">{t('panel.subtitle')}</p>
        </div>
        <div className="ot-page-header__actions">
          <Button variant="secondary" leadingIcon={<Calendar size={16} />} disabled>
            {t('panel.cta.date-range')}
          </Button>
          <Button variant="primary" leadingIcon={<Plus size={16} />} disabled>
            {t('panel.cta.new-movement')}
          </Button>
        </div>
      </header>

      <div className="ot-section-label">{t('panel.sections.accounts')}</div>
      <div className="ot-account-cards">
        {['BBVA', 'Caixa', 'Santander', 'Efectivo', 'PayPal'].map((name) => (
          <div key={name} className="ot-account-card">
            <div className="ot-account-card__head">
              <div className="ot-account-card__icon">
                <Landmark size={18} />
              </div>
              <div>
                <div className="ot-account-card__name">{name}</div>
                <div className="ot-account-card__count">— movimiento(s)</div>
              </div>
            </div>
            <div className="ot-account-card__balance">—</div>
          </div>
        ))}
      </div>

      <div className="ot-section-label">{t('panel.sections.summary')}</div>
      <div className="ot-kpi-strip">
        <div className="ot-kpi">
          <div
            className="ot-kpi__icon"
            style={{ background: 'var(--color-income-bg)', color: 'var(--color-income-default)' }}
          >
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="ot-kpi__label">{t('movements.totals.income')}</div>
            <div className="ot-kpi__value" style={{ color: 'var(--color-income-default)' }}>
              —
            </div>
            <div className="ot-kpi__delta">{t('panel.cta.date-range')}</div>
          </div>
        </div>
        <div className="ot-kpi">
          <div
            className="ot-kpi__icon"
            style={{ background: 'var(--color-expense-bg)', color: 'var(--color-expense-default)' }}
          >
            <TrendingDown size={20} />
          </div>
          <div>
            <div className="ot-kpi__label">{t('movements.totals.expense')}</div>
            <div className="ot-kpi__value" style={{ color: 'var(--color-expense-default)' }}>
              —
            </div>
            <div className="ot-kpi__delta">{t('panel.cta.date-range')}</div>
          </div>
        </div>
        <div className="ot-kpi">
          <div
            className="ot-kpi__icon"
            style={{ background: 'var(--color-brand-surface)', color: 'var(--color-brand-primary)' }}
          >
            <Calculator size={20} />
          </div>
          <div>
            <div className="ot-kpi__label">{t('movements.totals.net')}</div>
            <div className="ot-kpi__value" style={{ color: 'var(--color-brand-primary)' }}>
              —
            </div>
            <div className="ot-kpi__delta">{t('panel.cta.date-range')}</div>
          </div>
        </div>
      </div>

      <div className="ot-section-label">{t('panel.sections.monthly-trend')}</div>
      <div className="ot-skeleton" style={{ minHeight: 180 }}>
        {t('panel.skeleton')}
      </div>

      <div className="ot-section-label">{t('panel.sections.recent')}</div>
      <div className="ot-skeleton" style={{ minHeight: 120 }}>
        {t('panel.skeleton')}
      </div>
    </div>
  );
}
