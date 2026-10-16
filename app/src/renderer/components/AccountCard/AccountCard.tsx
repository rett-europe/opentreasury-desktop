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
  /** Month-end balances, oldest first (last = current month). */
  readonly balanceHistory?: readonly number[];
  readonly onClick?: () => void;
}

const SPARK_W = 100;
const SPARK_H = 28;
const SPARK_PAD = 2;

function sparkGeometry(values: readonly number[]): {
  line: string;
  area: string;
  zeroY: number | null;
} {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const y = (v: number): number =>
    span === 0 ? SPARK_H / 2 : SPARK_PAD + ((max - v) / span) * (SPARK_H - SPARK_PAD * 2);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * SPARK_W, y(v)] as const);
  const line = pts.map(([x, py]) => `${x.toFixed(2)},${py.toFixed(2)}`).join(' ');
  const area = `M0,${SPARK_H} L${pts.map(([x, py]) => `${x.toFixed(2)},${py.toFixed(2)}`).join(' L')} L${SPARK_W},${SPARK_H} Z`;
  return { line, area, zeroY: min < 0 && max > 0 ? y(0) : null };
}

/**
 * Account card for Panel — shows icon, name, tx count, the current balance
 * (neutral, red only when overdrawn), the period net flow (green/red with an
 * arrow), and a 12-month balance line in the account colour.
 */
export function AccountCard({
  shortName,
  color,
  transactionCount,
  balance,
  periodNet,
  balanceHistory,
  onClick,
}: AccountCardProps): JSX.Element {
  const { t } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const isNegative = balance < 0;
  const netTone =
    periodNet === undefined || periodNet === 0
      ? 'neutral'
      : periodNet < 0
        ? 'negative'
        : 'positive';
  const netClass = `ot-account-card__net--${netTone}`;
  const signedNet =
    periodNet === undefined ? '' : `${periodNet > 0 ? '+' : ''}${formatCurrency(periodNet)}`;
  const spark = balanceHistory && balanceHistory.length >= 2 ? sparkGeometry(balanceHistory) : null;

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
          {netTone !== 'neutral' && (
            <span aria-hidden="true" className={`ot-account-card__net-arrow ${netClass}`}>
              {netTone === 'negative' ? '↓' : '↑'}
            </span>
          )}
          <span className={netClass}>{signedNet}</span> {t('panel.card.periodNet')}
        </div>
      )}
      {spark && balanceHistory && (
        <svg
          className="ot-account-card__spark"
          viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={t('panel.card.trendLabel', {
            from: formatCurrency(balanceHistory[0] ?? 0),
            to: formatCurrency(balanceHistory[balanceHistory.length - 1] ?? 0),
          })}
        >
          <path d={spark.area} fill={color} fillOpacity={0.1} stroke="none" />
          {spark.zeroY !== null && (
            <line
              className="ot-account-card__spark-zero"
              x1={0}
              x2={SPARK_W}
              y1={spark.zeroY}
              y2={spark.zeroY}
            />
          )}
          <polyline
            points={spark.line}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}
    </div>
  );
}
