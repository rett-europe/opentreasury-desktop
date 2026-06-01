import { useFormatters } from '../../format/index.js';
import './AccountBarRow.css';

export type AccountBarRowProps = {
  readonly accountId: string;
  readonly accountName: string;
  readonly accountColor: string;
  readonly incomeCents: number;
  readonly expenseCents: number;
  /** Largest |income+expense| value across the sibling rows; drives bar width. */
  readonly maxTotalCents: number;
  readonly currency?: string;
  readonly labels: {
    readonly income: string;
    readonly expense: string;
  };
};

/**
 * Single horizontal stacked bar for the Insights drilldown "POR CUENTA" panel.
 * Layout: [colored account pill] [stacked bar (income+expense)] [income €] [expense €]
 * Stacks vertically below 1024px (see CSS grid-template).
 */
export function AccountBarRow({
  accountId,
  accountName,
  accountColor,
  incomeCents,
  expenseCents,
  maxTotalCents,
  currency = 'EUR',
  labels,
}: AccountBarRowProps): JSX.Element {
  const { formatCurrency } = useFormatters();
  const total = incomeCents + expenseCents;
  const safeMax = maxTotalCents > 0 ? maxTotalCents : 1;
  const totalPct = (total / safeMax) * 100;
  const incomeShare = total > 0 ? (incomeCents / total) * 100 : 0;
  const expenseShare = total > 0 ? (expenseCents / total) * 100 : 0;

  return (
    <div className="ot-account-bar-row" data-account-id={accountId}>
      <span className="ot-account-bar-row__pill" style={{ backgroundColor: accountColor }}>
        <span className="ot-account-bar-row__pill-name">{accountName}</span>
      </span>

      <div
        className="ot-account-bar-row__bar"
        role="img"
        aria-label={`${accountName}: ${labels.income} ${formatCurrency(incomeCents / 100, currency)}, ${labels.expense} ${formatCurrency(expenseCents / 100, currency)}`}
      >
        <div
          className="ot-account-bar-row__bar-track"
          style={{ width: `${Math.min(totalPct, 100)}%` }}
        >
          {incomeCents > 0 ? (
            <span
              className="ot-account-bar-row__seg ot-account-bar-row__seg--income"
              style={{ width: `${incomeShare}%` }}
            />
          ) : null}
          {expenseCents > 0 ? (
            <span
              className="ot-account-bar-row__seg ot-account-bar-row__seg--expense"
              style={{ width: `${expenseShare}%` }}
            />
          ) : null}
        </div>
      </div>

      <div className="ot-account-bar-row__values">
        <span className="ot-account-bar-row__value ot-account-bar-row__value--income ot-tnum">
          {formatCurrency(incomeCents / 100, currency)}
        </span>
        <span className="ot-account-bar-row__value ot-account-bar-row__value--expense ot-tnum">
          {formatCurrency(expenseCents / 100, currency)}
        </span>
      </div>
    </div>
  );
}
