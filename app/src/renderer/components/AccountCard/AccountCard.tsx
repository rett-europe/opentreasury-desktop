import { Landmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './AccountCard.css';

export interface AccountCardProps {
  readonly shortName: string;
  readonly color: string;
  readonly transactionCount: number;
  readonly balance: number;
  readonly hasSparkline?: boolean;
}

/**
 * Account card for Panel — shows icon, name, tx count, balance, and
 * a sparkline placeholder area. Balance is signed and colored.
 */
export function AccountCard({
  shortName,
  color,
  transactionCount,
  balance,
  hasSparkline = false,
}: AccountCardProps): JSX.Element {
  const { t } = useTranslation('common');
  const isNegative = balance < 0;

  return (
    <div className="ot-account-card">
      <div className="ot-account-card__head">
        <div className="ot-account-card__icon" style={{ background: color }}>
          <Landmark size={18} />
        </div>
        <div>
          <div className="ot-account-card__name">{shortName}</div>
          <div className="ot-account-card__count">
            {t('panel.card.count', { count: transactionCount })}
          </div>
        </div>
      </div>
      <div
        className={`ot-account-card__balance ${isNegative ? 'ot-account-card__balance--negative' : ''}`}
      >
        {new Intl.NumberFormat(navigator.language, {
          style: 'currency',
          currency: 'EUR',
          signDisplay: 'auto',
        }).format(balance)}
      </div>
      {hasSparkline && <div className="ot-account-card__sparkline-placeholder" />}
    </div>
  );
}
