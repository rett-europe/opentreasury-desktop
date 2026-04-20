import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Edit, Trash2 } from 'lucide-react';
import { Button } from '../Button/index.js';
import { NotesThread } from '../NotesThread/index.js';
import { TransactionFormModal, type TransactionFormData } from '../TransactionFormModal/index.js';
import type { Account, RecentTransaction } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import type {
  CreateTransactionRequest,
  UpdateTransactionRequest,
} from '../../../shared/ipc-contracts/transaction.js';
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

function formatDate(iso: string): string {
  try {
    // YYYY-MM-DD — format as medium date in user locale.
    const date = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return iso;
    return new Intl.DateTimeFormat(navigator.language, { dateStyle: 'medium' }).format(date);
  } catch {
    return iso;
  }
}

/**
 * Transaction Detail modal — WI-19 + WI-20 (edit/delete).
 *
 * Read-only view triggered from a Panel row click. WI-20 adds:
 * - Edit button → swaps modal body to TransactionFormModal in edit mode
 * - Delete button (trash icon in header) → confirmation dialog
 * - In-place swap pattern: same modal, body/footer change
 *
 * Layout follows the ImportWizard "locked-width" pattern (640px) to avoid jitter.
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
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open && !isEditModalOpen) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen, isEditModalOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      onClose();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  const handleEdit = (): void => {
    setIsEditModalOpen(true);
  };

  const handleCancelEdit = (): void => {
    setIsEditModalOpen(false);
  };

  const handleSaveEdit = async (
    input: CreateTransactionRequest | UpdateTransactionRequest,
  ): Promise<void> => {
    // In edit mode, we know input is UpdateTransactionRequest
    await onUpdate(input as UpdateTransactionRequest);
    setIsEditModalOpen(false);
    // Parent will refresh and pass updated transaction
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

  const initialData: TransactionFormData = {
    id: transaction.id,
    accountId: transaction.accountId,
    date: transaction.date,
    type: transaction.type,
    amount: transaction.amount,
    description: transaction.description,
    categoryId: transaction.categoryId,
    subcategoryId: transaction.subcategoryId,
    tagIds: transaction.tagIds,
    status: transaction.status,
    reference: transaction.reference ?? null,
    details: transaction.details ?? null,
  };
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

  return (
    <>
      <dialog
        ref={dialogRef}
        className="ot-transaction-detail-modal"
        aria-labelledby="ot-transaction-detail-title"
        role="dialog"
        aria-modal="true"
      >
        <div className="ot-transaction-detail-modal__content">
          <header className="ot-transaction-detail-modal__header">
            <div className="ot-transaction-detail-modal__heading">
              <span className="ot-transaction-detail-modal__date">
                {formatDate(transaction.date)}
              </span>
              <h1 id="ot-transaction-detail-title" className="ot-transaction-detail-modal__title">
                {transaction.description}
              </h1>
              <span className={`ot-transaction-detail-modal__amount ${amountClass}`}>
                {formattedAmount}
              </span>
            </div>
            <div className="ot-transaction-detail-modal__header-actions">
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
              <button
                type="button"
                className="ot-transaction-detail-modal__close"
                onClick={onClose}
                aria-label={t('common.close')}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </header>

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
                  {categoryLabel ?? transaction.categoryId ?? t('transactionDetail.fields.none')}
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

          <footer className="ot-transaction-detail-modal__footer">
            <div className="ot-transaction-detail-modal__footer-actions">
              <Button type="button" variant="ghost" onClick={handleEdit}>
                <Edit size={16} />
                {t('transactionDetail.editButton')}
              </Button>
            </div>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
          </footer>
        </div>
      </dialog>

      <TransactionFormModal
        mode="edit"
        isOpen={isEditModalOpen}
        onClose={handleCancelEdit}
        onSubmit={handleSaveEdit}
        accounts={accounts}
        categories={categories}
        tags={tags}
        initialData={initialData}
      />
    </>
  );
}
