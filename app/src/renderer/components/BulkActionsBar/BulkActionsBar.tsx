import { useTranslation } from 'react-i18next';
import { Button } from '../Button/index.js';
import './BulkActionsBar.css';

export interface BulkActionsBarProps {
  /** Current selection size. The bar hides itself when this is 0. */
  readonly selectedCount: number;
  /** Opens the classify modal. */
  readonly onClassify: () => void;
  /** Clears the current selection (no modal). */
  readonly onCancel: () => void;
}

/**
 * BulkActionsBar — WI-31b.
 *
 * Thin action bar that surfaces between the page header and the filter bar
 * whenever the user has selected one or more movements in the table. Keeps
 * the count live-announced for screen readers, and is fully keyboard
 * reachable. Visual parity with the Movements/Detail design language:
 * rounded card, pill buttons, uppercase-tracking labels.
 *
 * v1 only exposes `Clasificar` (category/subcategory). Additional bulk
 * actions (Tags, Status, Delete) are tracked on #31.
 */
export function BulkActionsBar({
  selectedCount,
  onClassify,
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
         *  update as selections change without duplicating the visible pill. */}
        <span className="ot-visually-hidden" aria-live="polite">
          {countLabel}
        </span>
      </div>
      <div className="ot-bulk-actions-bar__right">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {t('movements.bulk.cancel')}
        </Button>
        <Button variant="primary" size="sm" onClick={onClassify}>
          {t('movements.bulk.classify.cta')}
        </Button>
      </div>
    </div>
  );
}
