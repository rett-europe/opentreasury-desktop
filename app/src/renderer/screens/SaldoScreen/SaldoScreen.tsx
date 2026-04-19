import { useTranslation } from 'react-i18next';
import { Calculator, Download, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '../../components/Button/index.js';

/**
 * Saldo (Balance) stub — renders prototype chrome (page header, yearly totals
 * KPI strip, monthly-net + income/expense section labels with skeleton cards)
 * with no data wiring. This exists so Pedro sees the prototype look across
 * all navigated screens, not a generic "Coming soon" card.
 */
export function SaldoScreen(): JSX.Element {
  const { t } = useTranslation('common');

  return (
    <div>
      <header className="ot-page-header">
        <div>
          <h1>{t('balance.title')}</h1>
          <p className="ot-page-header__subtitle">{t('balance.subtitle')}</p>
        </div>
        <div className="ot-page-header__actions">
          <Button variant="secondary" leadingIcon={<Download size={16} />} disabled>
            {t('balance.cta.export')}
          </Button>
        </div>
      </header>

      <div className="ot-section-label">{t('balance.sections.summary')}</div>
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
            <div className="ot-kpi__delta">2026</div>
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
            <div className="ot-kpi__delta">2026</div>
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
            <div className="ot-kpi__delta">2026</div>
          </div>
        </div>
      </div>

      <div className="ot-section-label">{t('balance.sections.monthly-net')}</div>
      <div className="ot-skeleton" style={{ minHeight: 200 }}>
        {t('balance.skeleton')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-7)' }}>
        <div>
          <div className="ot-section-label">{t('balance.sections.income')}</div>
          <div className="ot-skeleton" style={{ minHeight: 200 }}>
            {t('balance.skeleton')}
          </div>
        </div>
        <div>
          <div className="ot-section-label">{t('balance.sections.expense')}</div>
          <div className="ot-skeleton" style={{ minHeight: 200 }}>
            {t('balance.skeleton')}
          </div>
        </div>
      </div>
    </div>
  );
}
