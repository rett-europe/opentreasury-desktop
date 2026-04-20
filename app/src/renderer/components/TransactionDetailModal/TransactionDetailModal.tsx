import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import { NotesThread } from '../NotesThread/index.js';
import type { Account, RecentTransaction } from '../../../shared/ipc-contracts/panel.js';
import './TransactionDetailModal.css';

export interface TransactionDetailModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly transaction: RecentTransaction | null;
  readonly accounts?: readonly Account[];
  readonly categoryLabel?: string | null;
  readonly subcategoryLabel?: string | null;
  readonly tagLabels?: readonly string[];
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
 * Transaction Detail modal — WI-19.
 *
 * Read-only view triggered from a Panel row click. All fields (including
 * reference/details) render as plain labelled text; inline editing is deferred
 * to WI-20 per Pedro's decision on Neo's open questions.
 *
 * Layout follows the ImportWizard "locked-width" pattern to avoid jitter when
 * notes stream in.
 */
export function TransactionDetailModal({
  isOpen,
  onClose,
  transaction,
  accounts = [],
  categoryLabel,
  subcategoryLabel,
  tagLabels,
}: TransactionDetailModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  return (
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
          <button
            type="button"
            className="ot-transaction-detail-modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={20} aria-hidden="true" />
          </button>
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
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </footer>
      </div>
    </dialog>
  );
}
