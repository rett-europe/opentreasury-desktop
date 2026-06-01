import type * as React from 'react';
import { Landmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../format/index.js';
import './AccountCard.css';

export interface AccountCardProps {
  readonly shortName: string;
  readonly color: string;
  readonly transactionCount: number;
  readonly balance: number;
  readonly hasSparkline?: boolean;
  readonly onClick?: () => void;
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
  onClick,
}: AccountCardProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const isNegative = balance < 0;

  const handleClick = (): void => {
    if (onClick) {
      onClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const isClickable = Boolean(onClick);

  return (
    <div
      className={`ot-account-card ${isClickable ? 'ot-account-card--clickable' : ''}`}
      onClick={isClickable ? handleClick : undefined}
      onKeyDown={isClickable ? handleKeyDown : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      aria-label={
        isClickable
          ? t('panel.card.clickLabel', {
              defaultValue: 'View {{name}} transactions',
              name: shortName,
            })
          : undefined
      }
    >
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
        className={`ot-account-card__balance ${isNegative ? 'ot-account-card__balance--negative' : 'ot-account-card__balance--positive'}`}
      >
        {formatCurrency(balance)}
      </div>
      {hasSparkline && <div className="ot-account-card__sparkline-placeholder" />}
    </div>
  );
}
