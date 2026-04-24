import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import { CategoryPickerRows } from '../CategoryPickerRows/index.js';
import type {
  BulkUpdateTransactionFailure,
  BulkUpdateTransactionRequest,
  BulkUpdateTransactionResponse,
} from '../../../shared/ipc-contracts/transaction.js';
import type { CategoryRecord } from '../../types/config.js';
import { newUlid } from '../../utils/ulid.js';
// Reuse the detail-modal shell — same dialog styling as view / add / edit.
import '../TransactionDetailModal/TransactionDetailModal.css';
import './BulkClassifyModal.css';

export interface BulkClassifyModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly selectedIds: readonly string[];
  readonly categories?: readonly CategoryRecord[];
  /** Mutation invoker — injected so the modal can be tested without the
   *  global `window.opentreasury` bridge. Must call the IPC and return the
   *  typed response. */
  readonly onBulkUpdate: (
    input: BulkUpdateTransactionRequest,
  ) => Promise<BulkUpdateTransactionResponse>;
  /** Called after a fully-successful bulk update so the host can clear
   *  selection and re-run panel/movements queries. */
  readonly onSuccess: () => void | Promise<void>;
}

/**
 * BulkClassifyModal — WI-31b.
 *
 * Assigns a Category (+ optional Subcategory) to every selected movement in
 * a single IPC round-trip. Visual parity with `TransactionDetailModal`'s
 * edit mode: same dialog shell (`ot-transaction-detail-modal--edit`), same
 * TransactionFormFields picker rows, same footer buttons.
 *
 * Outcomes:
 *  - IPC returns `{ ok: true }`  → call `onSuccess`, close modal.
 *  - IPC returns `{ ok: false, failures }` → keep modal open, render the
 *    per-id failure list in a panel inside the modal. Selection is not
 *    cleared (v1 gives users a chance to inspect / retry).
 */
export function BulkClassifyModal({
  isOpen,
  onClose,
  selectedIds,
  categories = [],
  onBulkUpdate,
  onSuccess,
}: BulkClassifyModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [categoryId, setCategoryId] = useState<string>('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failures, setFailures] = useState<readonly BulkUpdateTransactionFailure[] | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Drive the native <dialog> open state off the React prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Reset form + error state each time the modal re-opens so stale failures
  // from a previous attempt never leak across openings.
  useEffect(() => {
    if (isOpen) {
      setCategoryId('');
      setSubcategoryId('');
      setFailures(null);
      setGeneralError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  // Escape + backdrop-click close. Submitting locks the modal to avoid
  // racing the IPC round-trip mid-flight.
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;
      setGeneralError(null);
      setFailures(null);
      setIsSubmitting(true);

      try {
        // Category is optional at the wire level (null = clear, undefined =
        // don't touch). Here we only submit what the user picked. If the
        // user left category empty, we pass `null` meaning "clear category".
        const categoryPatch = categoryId === '' ? null : categoryId;
        const subcategoryPatch = subcategoryId === '' ? null : subcategoryId;

        const input: BulkUpdateTransactionRequest = {
          ids: [...selectedIds],
          categoryId: categoryPatch,
          // Only send subcategoryId when a category is set — clearing the
          // category implicitly clears the subcategory server-side.
          subcategoryId: categoryPatch == null ? null : subcategoryPatch,
          correlationId: newUlid(),
        };

        const result = await onBulkUpdate(input);
        if (result.ok) {
          await onSuccess();
          onClose();
        } else {
          setFailures(result.failures);
        }
      } catch (err) {
        setGeneralError(
          err instanceof Error ? err.message : t('movements.form.errors.submitFailed'),
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [categoryId, subcategoryId, isSubmitting, selectedIds, onBulkUpdate, onSuccess, onClose, t],
  );

  const count = selectedIds.length;
  const title = t('movements.bulk.classify.title', { count });

  return (
    <dialog
      ref={dialogRef}
      className="ot-transaction-detail-modal ot-transaction-detail-modal--edit ot-bulk-classify-modal"
      aria-labelledby="ot-bulk-classify-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-transaction-detail-modal__content">
        <header className="ot-transaction-detail-modal__header">
          <h1 id="ot-bulk-classify-title" className="ot-transaction-detail-modal__title">
            {title}
          </h1>
          <div className="ot-transaction-detail-modal__header-actions">
            <button
              type="button"
              className="ot-transaction-detail-modal__close"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label={t('common.close')}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <form onSubmit={handleSubmit}>
          <div className="ot-transaction-detail-modal__edit-body">
            {generalError && (
              <div className="ot-transaction-detail-modal__error" role="alert">
                {generalError}
              </div>
            )}

            <div className="ot-tx-fields">
              <CategoryPickerRows
                categoryId={categoryId}
                onCategoryIdChange={setCategoryId}
                subcategoryId={subcategoryId}
                onSubcategoryIdChange={setSubcategoryId}
                categories={categories}
                disabled={isSubmitting}
                layout="pair"
                idPrefix="bulk-classify"
              />
            </div>

            {failures && failures.length > 0 && (
              <section className="ot-bulk-classify-modal__failures" role="alert" aria-live="polite">
                <h2 className="ot-bulk-classify-modal__failures-heading">
                  {t('movements.bulk.failures.heading', { count: failures.length })}
                </h2>
                <ul className="ot-bulk-classify-modal__failures-list">
                  {failures.map((f, i) => (
                    <li key={`${f.id}-${i}`} className="ot-bulk-classify-modal__failure-row">
                      <span className="ot-bulk-classify-modal__failure-code">{f.code}</span>
                      <span className="ot-bulk-classify-modal__failure-message">{f.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <footer className="ot-transaction-detail-modal__footer">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('movements.bulk.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting || count === 0}>
              {isSubmitting ? t('common.saving') : t('movements.bulk.apply')}
            </Button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}
