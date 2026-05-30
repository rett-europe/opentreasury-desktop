import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import { TransactionFormFields } from '../TransactionFormFields/index.js';
import { useCloseDialogOnUnmount } from '../../hooks/useCloseDialogOnUnmount.js';
import type { CreateTransactionRequest } from '../../../shared/ipc-contracts/transaction.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import { parseLocaleAmount } from '../../utils/numberFormat.js';
// Reuse the detail modal's shell styling so Add and View/Edit look identical —
// same width, padding, header/footer, summary strip. Field layout itself comes
// from the shared <TransactionFormFields/> component.
import '../TransactionDetailModal/TransactionDetailModal.css';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTransactionRequest) => Promise<void>;
  accounts: readonly Account[];
  categories?: readonly CategoryRecord[];
  tags?: readonly TagRecord[];
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
 * Add Transaction Modal — "Nuevo movimiento" entry point.
 *
 * Visual parity with TransactionDetailModal's edit mode (WI-20 refactor):
 * same dialog shell, same TransactionFormFields body, same footer buttons.
 * The only visible differences are the title ("Nuevo movimiento") and the
 * absence of the read-only summary strip (there's no existing tx to describe).
 *
 * Accessibility: native <dialog> with focus trap, Escape to close, ARIA labels.
 */
export function AddTransactionModal({
  isOpen,
  onClose,
  onSubmit,
  accounts,
  categories = [],
  tags = [],
}: AddTransactionModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Form state — defaults match the prototype (today, approved status, EUR).
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'pending' | 'approved'>('approved');
  const [reference, setReference] = useState('');
  const [details, setDetails] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Auto-select first account when accounts change and no selection yet.
  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0]!.id);
    }
  }, [accounts, accountId]);

  // Manage <dialog> open/close state.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Top-layer safety: see hooks/useCloseDialogOnUnmount for context.
  useCloseDialogOnUnmount(dialogRef);

  // Reset form when modal opens.
  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().slice(0, 10));
      setType('expense');
      setAmount('');
      setDescription('');
      setAccountId(accounts[0]?.id ?? '');
      setCategoryId('');
      setSubcategoryId('');
      setTagIds([]);
      setStatus('approved');
      setReference('');
      setDetails('');
      setErrors({});
      setGeneralError(null);
    }
  }, [isOpen, accounts]);

  // Close on Escape (native dialog behavior) + backdrop click.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };

    const handleClick = (e: MouseEvent) => {
      if (e.target === dialog) {
        onClose();
      }
    };

    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);

    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      newErrors.date = t('movements.form.errors.dateInvalid');
    }

    if (!type) {
      newErrors.type = t('movements.form.errors.typeInvalid');
    }

    // ES locale sweep: parse with `parseLocaleAmount` so `1331,85` and
    // `1.331,85` are accepted alongside `1331.85` / `1,331.85`. Returns NaN
    // for empty / non-numeric, which `Number.isFinite` rejects.
    const amountNum = parseLocaleAmount(amount);
    if (!amount || !Number.isFinite(amountNum) || amountNum <= 0) {
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

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setGeneralError(null);

      if (!validate()) {
        return;
      }

      setIsSubmitting(true);

      try {
        const input: CreateTransactionRequest = {
          date,
          type,
          amount: parseLocaleAmount(amount),
          currency: 'EUR',
          description: description.trim(),
          accountId,
          categoryId: categoryId || undefined,
          subcategoryId: subcategoryId || undefined,
          tagIds: tagIds.length > 0 ? tagIds : undefined,
          status,
          reference: reference.trim() || undefined,
          details: details.trim() || undefined,
        };

        await onSubmit(input);
        onClose();
      } catch (err) {
        setGeneralError(
          err instanceof Error ? err.message : t('movements.form.errors.submitFailed'),
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      validate,
      date,
      type,
      amount,
      description,
      accountId,
      categoryId,
      subcategoryId,
      tagIds,
      status,
      reference,
      details,
      onSubmit,
      onClose,
      t,
    ],
  );

  return (
    <dialog
      ref={dialogRef}
      className="ot-transaction-detail-modal ot-transaction-detail-modal--edit"
      aria-labelledby="ot-add-transaction-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-transaction-detail-modal__content">
        <header className="ot-transaction-detail-modal__header">
          <h1 id="ot-add-transaction-title" className="ot-transaction-detail-modal__title">
            {t('movements.form.title')}
          </h1>
          <div className="ot-transaction-detail-modal__header-actions">
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

        <form onSubmit={handleSubmit}>
          <div className="ot-transaction-detail-modal__edit-body">
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
              mode="add"
              currency="EUR"
            />
          </div>

          <footer className="ot-transaction-detail-modal__footer">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? t('movements.form.submitting') : t('movements.form.submit')}
            </Button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}
