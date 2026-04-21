import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Edit, Trash2 } from 'lucide-react';
import { Button } from '../Button/index.js';
import { NotesThread } from '../NotesThread/index.js';
import { TransactionFormFields } from '../TransactionFormFields/index.js';
import { formatDate } from '../../utils/dateFormat.js';
import type { Account, RecentTransaction } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import type { UpdateTransactionRequest } from '../../../shared/ipc-contracts/transaction.js';
import './TransactionDetailModal.css';

export interface TransactionDetailModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly transaction: RecentTransaction | null;
  readonly accounts?: readonly Account[];
  readonly categories?: readonly CategoryRecord[];
  readonly tags?: readonly TagRecord[];
  readonly categoryLabel?: string | null;
  readonly subcategoryLabel?: string | null;
  readonly tagLabels?: readonly string[];
  readonly onUpdate: (input: UpdateTransactionRequest) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
}

interface FormErrors {
  date?: string;
  type?: string;
  amount?: string;
  description?: string;
  accountId?: string;
  reference?: string;
  details?: string;
  [key: string]: string | undefined;
}

/**
 * Transaction Detail modal — WI-19 + WI-20 (edit/delete).
 *
 * In-place swap pattern (Option A, Pedro-approved):
 * - Read-only view: displays transaction fields + notes thread, footer has "Editar" button
 * - Edit mode: SAME dialog swaps body to editable form (using TransactionFormFields),
 *   footer swaps to "Cancelar / Guardar". Notes thread collapses in edit mode.
 * - Delete button (trash icon) hidden during edit mode to avoid confusion.
 *
 * Width: 640px for read-only, widens to 720px in edit mode for better form breathing room.
 */
export function TransactionDetailModal({
  isOpen,
  onClose,
  transaction,
  accounts = [],
  categories = [],
  tags = [],
  categoryLabel,
  subcategoryLabel,
  tagLabels,
  onUpdate,
  onDelete,
}: TransactionDetailModalProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Edit mode state — true when user clicked "Editar", false when viewing/after cancel
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state (only used in edit mode)
  const [date, setDate] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'pending' | 'approved'>('approved');
  const [reference, setReference] = useState('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Populate form when entering edit mode
  useEffect(() => {
    if (isEditMode && transaction) {
      setDate(transaction.date);
      setType(transaction.type);
      setAmount(transaction.amount.toString());
      setDescription(transaction.description);
      setAccountId(transaction.accountId);
      setCategoryId(transaction.categoryId ?? '');
      setSubcategoryId(transaction.subcategoryId ?? '');
      setTagIds(transaction.tagIds ?? []);
      setStatus(transaction.status);
      setReference(transaction.reference ?? '');
      setDetails(transaction.details ?? '');
      setErrors({});
      setGeneralError(null);
    }
  }, [isEditMode, transaction]);

  // Manage <dialog> open/close state
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Close on Escape + backdrop click
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      // If in edit mode, cancel edit instead of closing modal
      if (isEditMode) {
        setIsEditMode(false);
      } else {
        onClose();
      }
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog) {
        if (isEditMode) {
          setIsEditMode(false);
        } else {
          onClose();
        }
      }
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose, isEditMode]);

  const handleEdit = (): void => {
    setIsEditMode(true);
  };

  const handleCancelEdit = (): void => {
    setIsEditMode(false);
    setErrors({});
    setGeneralError(null);
  };

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      newErrors.date = t('movements.form.errors.dateInvalid');
    }

    if (!type) {
      newErrors.type = t('movements.form.errors.typeInvalid');
    }

    const amountNum = Number(amount);
    if (!amount || Number.isNaN(amountNum) || amountNum <= 0) {
      newErrors.amount = t('movements.form.errors.amountNonPositive');
    }

    const trimmedDesc = description.trim();
    if (!trimmedDesc) {
      newErrors.description = t('movements.form.errors.descriptionEmpty');
    }

    if (!accountId) {
      newErrors.accountId = t('movements.form.errors.accountNotFound');
    }

    const trimmedRef = reference.trim();
    if (trimmedRef.length > 120) {
      newErrors.reference = t('movements.form.errors.referenceTooLong');
    }

    const trimmedDetails = details.trim();
    if (trimmedDetails.length > 1000) {
      newErrors.details = t('movements.form.errors.detailsTooLong');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [date, type, amount, description, accountId, reference, details, t]);

  const handleSaveEdit = async (): Promise<void> => {
    if (!transaction) return;
    setGeneralError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const input: UpdateTransactionRequest = {
        id: transaction.id,
        date,
        type,
        amount: Number(amount),
        description: description.trim(),
        categoryId: categoryId || undefined,
        subcategoryId: subcategoryId || undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        status,
        reference: reference.trim() || undefined,
        details: details.trim() || undefined,
      };
      await onUpdate(input);
      // Parent will refresh and pass updated transaction — exit edit mode
      setIsEditMode(false);
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : t('movements.form.errors.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!transaction) return;

    const confirmed = window.confirm(t('transactionDetail.deleteConfirm'));
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await onDelete(transaction.id);
      onClose();
    } catch (err) {
      // Error handling — parent will show error
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!transaction) {
    return (
      <dialog
        ref={dialogRef}
        className="ot-transaction-detail-modal"
        aria-labelledby="ot-transaction-detail-title"
        role="dialog"
        aria-modal="true"
      />
    );
  }

  const account = accounts.find((a) => a.id === transaction.accountId);
  const accountLabel = account?.accountLabel ?? transaction.accountId;

  const amountClass = transaction.type === 'income' ? 'ot-amount--income' : 'ot-amount--expense';
  const signed = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
  const formattedAmount = new Intl.NumberFormat(navigator.language, {
    style: 'currency',
    currency: transaction.currency,
    signDisplay: 'auto',
  }).format(signed);

  const resolvedTagLabels: readonly string[] = tagLabels ?? transaction.tagIds;

  // Modal title changes in edit mode
  const modalTitle = isEditMode ? t('movements.form.editTitle') : t('transactionDetail.title');

  return (
    <dialog
      ref={dialogRef}
      className={`ot-transaction-detail-modal ${isEditMode ? 'ot-transaction-detail-modal--edit' : ''}`}
      aria-labelledby="ot-transaction-detail-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-transaction-detail-modal__content">
        {/* Header stays visible in both modes */}
        <header className="ot-transaction-detail-modal__header">
          <h1 id="ot-transaction-detail-title" className="ot-transaction-detail-modal__title">
            {modalTitle}
          </h1>
          <div className="ot-transaction-detail-modal__header-actions">
            {/* Hide delete button during edit mode to avoid confusion */}
            {!isEditMode && (
              <button
                type="button"
                className="ot-transaction-detail-modal__action-btn"
                onClick={handleDelete}
                disabled={isDeleting}
                aria-label={t('transactionDetail.deleteButton')}
                title={t('transactionDetail.deleteButton')}
              >
                <Trash2 size={18} aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              className="ot-transaction-detail-modal__close"
              onClick={isEditMode ? handleCancelEdit : onClose}
              aria-label={t('common.close')}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Body: swaps between read-only view and editable form */}
        {isEditMode ? (
          /* EDIT MODE: Same layout as view, only value cells become inputs */
          <div className="ot-transaction-detail-modal__edit-body">
            {/* Summary header: same as view mode (read-only context) */}
            <div className="ot-transaction-detail-modal__summary">
              <span className="ot-transaction-detail-modal__date">
                {formatDate(transaction.date, locale)}
              </span>
              <p className="ot-transaction-detail-modal__description">{transaction.description}</p>
              <span className={`ot-transaction-detail-modal__amount ${amountClass}`}>
                {formattedAmount}
              </span>
            </div>

            {generalError && (
              <div className="ot-transaction-detail-modal__error" role="alert">
                {generalError}
              </div>
            )}
            <TransactionFormFields
              date={date}
              onDateChange={setDate}
              type={type}
              onTypeChange={setType}
              amount={amount}
              onAmountChange={setAmount}
              description={description}
              onDescriptionChange={setDescription}
              accountId={accountId}
              onAccountIdChange={setAccountId}
              categoryId={categoryId}
              onCategoryIdChange={setCategoryId}
              subcategoryId={subcategoryId}
              onSubcategoryIdChange={setSubcategoryId}
              tagIds={tagIds}
              onTagIdsChange={setTagIds}
              status={status}
              onStatusChange={setStatus}
              reference={reference}
              onReferenceChange={setReference}
              details={details}
              onDetailsChange={setDetails}
              accounts={accounts}
              categories={categories}
              tags={tags}
              errors={errors}
              mode="edit"
            />
          </div>
        ) : (
          /* READ-ONLY MODE: Show transaction details + notes thread */
          <>
            <div className="ot-transaction-detail-modal__read-body">
              <div className="ot-transaction-detail-modal__summary">
                <span className="ot-transaction-detail-modal__date">
                  {formatDate(transaction.date, locale)}
                </span>
                <p className="ot-transaction-detail-modal__description">
                  {transaction.description}
                </p>
                <span className={`ot-transaction-detail-modal__amount ${amountClass}`}>
                  {formattedAmount}
                </span>
              </div>

              <section
                className="ot-transaction-detail-modal__metadata"
                aria-label={t('transactionDetail.metadata.heading')}
              >
                <dl className="ot-transaction-detail-modal__grid">
                  <div className="ot-transaction-detail-modal__field">
                    <dt>{t('transactionDetail.fields.account')}</dt>
                    <dd>{accountLabel}</dd>
                  </div>
                  <div className="ot-transaction-detail-modal__field">
                    <dt>{t('transactionDetail.fields.category')}</dt>
                    <dd>
                      {categoryLabel ??
                        transaction.categoryId ??
                        t('transactionDetail.fields.none')}
                    </dd>
                  </div>
                  <div className="ot-transaction-detail-modal__field">
                    <dt>{t('transactionDetail.fields.subcategory')}</dt>
                    <dd>
                      {subcategoryLabel ??
                        transaction.subcategoryId ??
                        t('transactionDetail.fields.none')}
                    </dd>
                  </div>
                  <div className="ot-transaction-detail-modal__field">
                    <dt>{t('transactionDetail.fields.tags')}</dt>
                    <dd>
                      {resolvedTagLabels.length > 0
                        ? resolvedTagLabels.join(', ')
                        : t('transactionDetail.fields.none')}
                    </dd>
                  </div>
                  <div className="ot-transaction-detail-modal__field">
                    <dt>{t('transactionDetail.fields.status')}</dt>
                    <dd>{t(`movements.status.${transaction.status}`)}</dd>
                  </div>
                  <div className="ot-transaction-detail-modal__field">
                    <dt>{t('transactionDetail.fields.currency')}</dt>
                    <dd>{transaction.currency}</dd>
                  </div>
                </dl>
              </section>

              {transaction.reference ? (
                <section
                  className="ot-transaction-detail-modal__extra"
                  aria-label={t('transactionDetail.fields.reference')}
                >
                  <h2 className="ot-transaction-detail-modal__extra-label">
                    {t('transactionDetail.fields.reference')}
                  </h2>
                  <p className="ot-transaction-detail-modal__reference">{transaction.reference}</p>
                </section>
              ) : null}

              {transaction.details ? (
                <section
                  className="ot-transaction-detail-modal__extra"
                  aria-label={t('transactionDetail.fields.details')}
                >
                  <h2 className="ot-transaction-detail-modal__extra-label">
                    {t('transactionDetail.fields.details')}
                  </h2>
                  <p className="ot-transaction-detail-modal__details">{transaction.details}</p>
                </section>
              ) : null}

              <hr className="ot-transaction-detail-modal__divider" />

              <NotesThread txId={transaction.id} />
            </div>
          </>
        )}

        {/* Footer: swaps between "Editar" (read) and "Cancelar / Guardar" (edit) */}
        <footer className="ot-transaction-detail-modal__footer">
          {isEditMode ? (
            /* Edit mode footer: Cancel / Save */
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleSaveEdit}
                disabled={isSubmitting}
              >
                {isSubmitting ? t('common.saving') : t('common.save')}
              </Button>
            </>
          ) : (
            /* Read-only mode footer: Edit button + Close */
            <>
              <div className="ot-transaction-detail-modal__footer-actions">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleEdit}
                  leadingIcon={<Edit size={16} />}
                >
                  {t('transactionDetail.editButton')}
                </Button>
              </div>
              <Button type="button" variant="ghost" onClick={onClose}>
                {t('common.close')}
              </Button>
            </>
          )}
        </footer>
      </div>
    </dialog>
  );
}
