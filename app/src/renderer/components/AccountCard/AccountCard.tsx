import type * as React from 'react';
import { Landmark } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '../../format/index.js';
import './AccountCard.css';

export interface AccountCardProps {
  readonly shortName: string;
  readonly color: string;
  readonly transactionCount: number;
  /** Current account balance: opening balance + every movement. */
  readonly balance: number;
  /** Net flow (income − expense) over the Panel's rolling window. */
  readonly periodNet?: number;
  readonly hasSparkline?: boolean;
  readonly onClick?: () => void;
}

/**
 * Account card for Panel — shows icon, name, tx count, the current balance
 * (neutral, red only when overdrawn), the period net flow (green/red with an
 * arrow), and a sparkline placeholder area.
 */
export function AccountCard({
  shortName,
  color,
  transactionCount,
  balance,
  periodNet,
  hasSparkline = false,
  onClick,
}: AccountCardProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const isNegative = balance < 0;
  const netIsNegative = (periodNet ?? 0) < 0;
  const signedNet =
    periodNet === undefined ? '' : `${periodNet > 0 ? '+' : ''}${formatCurrency(periodNet)}`;

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
      <div className="ot-account-card__caption">{t('panel.card.balance')}</div>
      <div
        className={`ot-account-card__balance ${isNegative ? 'ot-account-card__balance--negative' : 'ot-account-card__balance--neutral'}`}
      >
        {formatCurrency(balance)}
      </div>
      {periodNet !== undefined && (
        <div className="ot-account-card__net">
          <span
            aria-hidden="true"
            className={`ot-account-card__net-arrow ${netIsNegative ? 'ot-account-card__net--negative' : 'ot-account-card__net--positive'}`}
          >
            {netIsNegative ? '↓' : '↑'}
          </span>
          <span
            className={
              netIsNegative ? 'ot-account-card__net--negative' : 'ot-account-card__net--positive'
            }
          >
            {signedNet}
          </span>{' '}
          {t('panel.card.periodNet')}
        </div>
      )}
      {hasSparkline && <div className="ot-account-card__sparkline-placeholder" />}
    </div>
  );
}
