import { TrendingUp, TrendingDown, Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../format/index.js';
import './KPIStrip.css';

export interface KPIStripProps {
  readonly income: number;
  readonly expense: number;
  readonly net: number;
  readonly month?: string;
}

/**
 * KPI strip for Panel — shows Income, Expense, and Net for current month.
 * Each metric has icon, label, value (colored), and month caption.
 */
export function KPIStrip({ income, expense, net, month }: KPIStripProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const format = (value: number) => formatCurrency(value);

  return (
    <div className="ot-kpi-strip" role="status" aria-live="polite">
      <div className="ot-kpi ot-kpi--income">
        <div className="ot-kpi__icon">
          <TrendingUp size={20} />
        </div>
        <div>
          <div className="ot-kpi__label">{t('movements.totals.income')}</div>
          <div className="ot-kpi__value">{format(income)}</div>
          {month && <div className="ot-kpi__delta">{month}</div>}
        </div>
      </div>
      <div className="ot-kpi ot-kpi--expense">
        <div className="ot-kpi__icon">
          <TrendingDown size={20} />
        </div>
        <div>
          <div className="ot-kpi__label">{t('movements.totals.expense')}</div>
          <div className="ot-kpi__value">{format(expense)}</div>
          {month && <div className="ot-kpi__delta">{month}</div>}
        </div>
      </div>
      <div className="ot-kpi ot-kpi--net">
        <div className="ot-kpi__icon">
          <Calculator size={20} />
        </div>
        <div>
          <div className="ot-kpi__label">{t('movements.totals.net')}</div>
          <div className="ot-kpi__value">{format(net)}</div>
          {month && <div className="ot-kpi__delta">{month}</div>}
        </div>
      </div>
    </div>
  );
}
