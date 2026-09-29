import { useTranslation } from 'react-i18next';
import { Button } from '../Button/index.js';
import './BulkActionsBar.css';

export interface BulkActionsBarProps {
  /** Current selection size. The bar hides itself when this is 0. */
  readonly selectedCount: number;
  /** Opens the classify modal. */
  readonly onClassify: () => void;
  /** Triggers the bulk-approve confirmation flow. Optional for
   *  backwards-compatibility — callers that don't supply it simply hide
   *  the Approve button. */
  readonly onApprove?: () => void;
  /** Opens the bulk add-label modal. Optional — callers that don't supply
   *  it hide the "Etiquetar" button. */
  readonly onAddLabel?: () => void;
  /** Sets the type (income/expense) of every selected movement. Optional. */
  readonly onSetType?: (type: 'income' | 'expense') => void;
  /** Deletes every selected movement (after confirmation). Optional. */
  readonly onDelete?: () => void;
  /** Clears the current selection (no modal). */
  readonly onCancel: () => void;
}

/**
 * BulkActionsBar — WI-31b / bulk-approve.
 *
 * Thin action bar that surfaces between the page header and the filter bar
 * whenever the user has selected one or more movements in the table. Keeps
 * the count live-announced for screen readers, and is fully keyboard
 * reachable. Visual parity with the Movements/Detail design language:
 * rounded card, pill buttons, uppercase-tracking labels.
 *
 * Exposes `Clasificar` (category/subcategory) and `Aprobar` (status flip
 * pending → approved). Classify keeps the `primary` slot (it's the most
 * common bulk action); Approve uses `secondary` to keep visual hierarchy
 * from competing. Tags / Delete bulk actions remain tracked on #31.
 */
export function BulkActionsBar({
  selectedCount,
  onClassify,
  onApprove,
  onAddLabel,
  onSetType,
  onDelete,
  onCancel,
}: BulkActionsBarProps): JSX.Element | null {
  const { t } = useTranslation('common');

  if (selectedCount <= 0) return null;

  const countLabel = t('movements.bulk.selectedCount', { count: selectedCount });

  return (
    <div role="region" aria-label={t('movements.bulk.aria')} className="ot-bulk-actions-bar">
      <div className="ot-bulk-actions-bar__left">
        <span className="ot-bulk-actions-bar__count" aria-hidden="true">
          {countLabel}
        </span>
        {/* Visually-hidden live region so screen readers announce the count
         *  update as selections change without duplicating the visible pill.
         *  `role="status"` gives the element an implicit `aria-live="polite"`
         *  and an implicit `aria-atomic="true"`, so assistive tech re-reads
         *  the full count on every change. It also makes the region
         *  queryable via `getByRole('status')` in tests (WI-31c). */}
        <span className="ot-visually-hidden" role="status">
          {countLabel}
        </span>
      </div>
      <div className="ot-bulk-actions-bar__right">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('movements.bulk.cancel')}
        </Button>
        {onDelete && (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            {t('movements.bulk.delete.cta')}
          </Button>
        )}
        {onSetType && (
          <>
            <Button variant="secondary" size="sm" onClick={() => onSetType('expense')}>
              {t('movements.bulk.setType.expense')}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onSetType('income')}>
              {t('movements.bulk.setType.income')}
            </Button>
          </>
        )}
        {onApprove && (
          <Button variant="secondary" size="sm" onClick={onApprove}>
            {t('movements.bulk.approve.cta')}
          </Button>
        )}
        {onAddLabel && (
          <Button variant="secondary" size="sm" onClick={onAddLabel}>
            {t('movements.bulk.addLabel.cta')}
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={onClassify}>
          {t('movements.bulk.classify.cta')}
        </Button>
      </div>
    </div>
  );
}
