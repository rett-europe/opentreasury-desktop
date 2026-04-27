import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../Button/index.js';
import './BulkApproveConfirmModal.css';

export interface BulkApproveConfirmModalProps {
  readonly isOpen: boolean;
  /** Number of selected transactions that are NOT yet approved (the count
   *  the IPC will actually mutate). */
  readonly pendingCount: number;
  /** Number of selected transactions already in `approved` status — shown
   *  as an inline skip notice so the user understands the discrepancy
   *  between selection size and the count being approved. */
  readonly skippedCount: number;
  readonly onClose: () => void;
  /** Mutation invoker. Throws on transport failure; resolves with no value
   *  on success. The component itself surfaces any error message. */
  readonly onConfirm: () => Promise<void>;
}

/**
 * BulkApproveConfirmModal — compact bulk-approve confirmation card.
 *
 * Intentionally minimal: title (the question), an optional subtle skip-notice
 * line, and Cancel/Approve actions. No header strip, no descriptive body
 * paragraph, no full-modal shell — this is a yes/no decision, not a form.
 */
export function BulkApproveConfirmModal({
  isOpen,
  pendingCount,
  skippedCount,
  onClose,
  onConfirm,
}: BulkApproveConfirmModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setIsSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      if (!isSubmitting) onClose();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog && !isSubmitting) onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose, isSubmitting]);

  const handleConfirm = useCallback(async () => {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('movements.bulk.approve.errorToast'));
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, onConfirm, t]);

  const title = t('movements.bulk.approve.confirmTitle', { count: pendingCount });
  const skipNotice =
    skippedCount > 0 ? t('movements.bulk.approve.skipNotice', { count: skippedCount }) : null;

  return (
    <dialog
      ref={dialogRef}
      className="ot-bulk-approve-confirm"
      aria-labelledby={titleId}
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-bulk-approve-confirm__content">
        <h2 id={titleId} className="ot-bulk-approve-confirm__title">
          {title}
        </h2>
        {skipNotice && <p className="ot-bulk-approve-confirm__skip-notice">{skipNotice}</p>}
        {error && (
          <p className="ot-bulk-approve-confirm__error" role="alert">
            {error}
          </p>
        )}
        <div className="ot-bulk-approve-confirm__actions">
          <Button type="button" variant="ghost" size="md" onClick={onClose} disabled={isSubmitting}>
            {t('movements.bulk.cancel')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting || pendingCount === 0}
          >
            {isSubmitting ? t('common.saving') : t('movements.bulk.approve.confirmCta')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
