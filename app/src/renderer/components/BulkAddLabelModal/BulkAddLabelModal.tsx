import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import type {
  BulkAddLabelTransactionFailure,
  BulkAddLabelTransactionRequest,
  BulkAddLabelTransactionResponse,
} from '../../../shared/ipc-contracts/transaction.js';
import type { TagRecord } from '../../types/config.js';
import { newUlid } from '../../utils/ulid.js';
// Reuse the detail-modal shell — same dialog styling as view / add / edit /
// bulk-classify.
import '../TransactionDetailModal/TransactionDetailModal.css';
import './BulkAddLabelModal.css';

export interface BulkAddLabelModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly selectedIds: readonly string[];
  /** Existing labels sourced from the read-model (`tags:list`). v1 picker is
   *  read-only — no create-new — so the host is responsible for keeping this
   *  list fresh. */
  readonly tags?: readonly TagRecord[];
  /** Mutation invoker — injected so the modal can be tested without the
   *  global `window.opentreasury` bridge. Calls the IPC and returns the
   *  typed response. */
  readonly onBulkAddLabel: (
    input: BulkAddLabelTransactionRequest,
  ) => Promise<BulkAddLabelTransactionResponse>;
  /** Called after a fully-successful bulk add-label so the host can clear
   *  selection, re-run movements queries, and surface the success toast.
   *  Receives the result so the host can render the success message + any
   *  skipped/already-had counts. */
  readonly onSuccess: (result: {
    updatedCount: number;
    skippedAlreadyHadCount: number;
    skippedSplitParentCount: number;
  }) => void | Promise<void>;
}

/**
 * BulkAddLabelModal — bulk add-label.
 *
 * Appends a single existing label (TagRecord) to every selected movement in
 * a single IPC round-trip. Visual parity with `BulkClassifyModal`: same
 * dialog shell, same footer buttons, single picker row.
 *
 * v1 scope (Pedro):
 *   - single-select picker only
 *   - no create-new (labels come from the read-model `tags:list`)
 *   - APPEND semantics: tx that already carries the label is silently
 *     reported as `skippedAlreadyHadCount` by the IPC; we surface a
 *     consolidated success toast on the host.
 *
 * Outcomes:
 *  - IPC returns `{ ok: true }`  → call `onSuccess`, close modal.
 *  - IPC returns `{ ok: false, failures }` → keep modal open, render the
 *    per-id failure list. Selection is preserved so the user can retry.
 */
export function BulkAddLabelModal({
  isOpen,
  onClose,
  selectedIds,
  tags = [],
  onBulkAddLabel,
  onSuccess,
}: BulkAddLabelModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [tagId, setTagId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [failures, setFailures] = useState<readonly BulkAddLabelTransactionFailure[] | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Filter archived tags — the picker only offers active labels (the
  // read-model returns archived rows when explicitly requested).
  const availableTags = useMemo(() => tags.filter((tag) => !tag.archivedAt), [tags]);

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
      setTagId('');
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
      if (isSubmitting || tagId === '') return;
      setGeneralError(null);
      setFailures(null);
      setIsSubmitting(true);

      try {
        const input: BulkAddLabelTransactionRequest = {
          ids: [...selectedIds],
          tagId,
          correlationId: newUlid(),
        };

        const result = await onBulkAddLabel(input);
        if (result.ok) {
          await onSuccess({
            updatedCount: result.updatedCount,
            skippedAlreadyHadCount: result.skippedAlreadyHadCount,
            skippedSplitParentCount: result.skippedSplitParentCount,
          });
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
    [tagId, isSubmitting, selectedIds, onBulkAddLabel, onSuccess, onClose, t],
  );

  const count = selectedIds.length;
  const title = t('movements.bulk.addLabel.title', { count });
  const selectId = 'ot-bulk-add-label-tag';

  return (
    <dialog
      ref={dialogRef}
      className="ot-transaction-detail-modal ot-transaction-detail-modal--edit ot-bulk-add-label-modal"
      aria-labelledby="ot-bulk-add-label-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-transaction-detail-modal__content">
        <header className="ot-transaction-detail-modal__header">
          <h1 id="ot-bulk-add-label-title" className="ot-transaction-detail-modal__title">
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
              <div className="ot-bulk-add-label-modal__field">
                <label htmlFor={selectId} className="ot-bulk-add-label-modal__label">
                  {t('movements.bulk.addLabel.fieldLabel')}
                </label>
                {availableTags.length === 0 ? (
                  <p className="ot-bulk-add-label-modal__empty">
                    {t('movements.bulk.addLabel.noLabels')}
                  </p>
                ) : (
                  <select
                    id={selectId}
                    className="ot-input"
                    value={tagId}
                    onChange={(e) => setTagId(e.target.value)}
                    disabled={isSubmitting}
                    required
                  >
                    <option value="" disabled>
                      {t('movements.bulk.addLabel.placeholder')}
                    </option>
                    {availableTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {failures && failures.length > 0 && (
              <section
                className="ot-bulk-add-label-modal__failures"
                role="alert"
                aria-live="polite"
              >
                <h2 className="ot-bulk-add-label-modal__failures-heading">
                  {t('movements.bulk.failures.heading', { count: failures.length })}
                </h2>
                <ul className="ot-bulk-add-label-modal__failures-list">
                  {failures.map((f, i) => (
                    <li key={`${f.id}-${i}`} className="ot-bulk-add-label-modal__failure-row">
                      <span className="ot-bulk-add-label-modal__failure-code">{f.code}</span>
                      <span className="ot-bulk-add-label-modal__failure-message">{f.message}</span>
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
            <Button
              type="submit"
              variant="primary"
              disabled={isSubmitting || count === 0 || tagId === ''}
            >
              {isSubmitting ? t('common.saving') : t('movements.bulk.apply')}
            </Button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}
