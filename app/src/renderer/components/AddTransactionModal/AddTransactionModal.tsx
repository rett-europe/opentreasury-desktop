import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import type { CreateTransactionRequest } from '../../../shared/ipc-contracts/transaction.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import './AddTransactionModal.css';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTransactionRequest) => Promise<void>;
  accounts: Account[];
  categories?: readonly CategoryRecord[];
  tags?: readonly TagRecord[];
}

interface FormErrors {
  date?: string;
  type?: string;
  amount?: string;
  description?: string;
  accountId?: string;
}

/**
 * Add Transaction Modal — WI-13.
 * Modal dialog for creating a new transaction. Fields match the prototype's
 * NewMovementForm (movimientos.jsx) and the WI-11 transaction command contract.
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

  // Form state — defaults match the prototype (today, approved status, EUR)
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [tagIds, setTagIds] = useState<string[]>([]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Auto-select first account when accounts change and no selection yet
  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0]!.id);
    }
  }, [accounts, accountId]);

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

  // Reset form when modal opens
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
      setErrors({});
      setGeneralError(null);
    }
  }, [isOpen, accounts]);

  // Close on Escape (native dialog behavior) + backdrop click
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [date, type, amount, description, accountId, t]);

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
          amount: Number(amount),
          currency: 'EUR',
          description: description.trim(),
          accountId,
          categoryId: categoryId || undefined,
          subcategoryId: subcategoryId || undefined,
          tagIds: tagIds.length > 0 ? tagIds : undefined,
          status: 'approved',
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
      onSubmit,
      onClose,
      t,
    ],
  );

  return (
    <dialog ref={dialogRef} className="ot-add-transaction-modal" aria-labelledby="modal-title">
      <div className="ot-add-transaction-modal__content">
        <header className="ot-add-transaction-modal__header">
          <h2 id="modal-title" className="ot-add-transaction-modal__title">
            {t('movements.form.title')}
          </h2>
          <button
            type="button"
            className="ot-add-transaction-modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </header>

        <form className="ot-add-transaction-modal__form" onSubmit={handleSubmit}>
          {generalError && (
            <div className="ot-add-transaction-modal__error" role="alert">
              {generalError}
            </div>
          )}

          <div className="ot-add-transaction-modal__row">
            <div className="ot-add-transaction-modal__field">
              <label htmlFor="tx-date" className="ot-add-transaction-modal__label">
                {t('movements.form.fields.date')}
              </label>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="ot-add-transaction-modal__input"
                aria-invalid={!!errors.date}
                aria-describedby={errors.date ? 'error-date' : undefined}
              />
              {errors.date && (
                <span id="error-date" className="ot-add-transaction-modal__field-error">
                  {errors.date}
                </span>
              )}
            </div>

            <div className="ot-add-transaction-modal__field">
              <label htmlFor="tx-type" className="ot-add-transaction-modal__label">
                {t('movements.form.fields.type')}
              </label>
              <select
                id="tx-type"
                value={type}
                onChange={(e) => setType(e.target.value as 'income' | 'expense')}
                className="ot-add-transaction-modal__input"
                aria-invalid={!!errors.type}
                aria-describedby={errors.type ? 'error-type' : undefined}
              >
                <option value="income">{t('movements.filters.type.income')}</option>
                <option value="expense">{t('movements.filters.type.expense')}</option>
              </select>
              {errors.type && (
                <span id="error-type" className="ot-add-transaction-modal__field-error">
                  {errors.type}
                </span>
              )}
            </div>
          </div>

          <div className="ot-add-transaction-modal__row">
            <div className="ot-add-transaction-modal__field">
              <label htmlFor="tx-amount" className="ot-add-transaction-modal__label">
                {t('movements.form.fields.amount')}
              </label>
              <input
                id="tx-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="ot-add-transaction-modal__input"
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? 'error-amount' : undefined}
              />
              {errors.amount && (
                <span id="error-amount" className="ot-add-transaction-modal__field-error">
                  {errors.amount}
                </span>
              )}
            </div>

            <div className="ot-add-transaction-modal__field">
              <label htmlFor="tx-account" className="ot-add-transaction-modal__label">
                {t('movements.form.fields.account')}
              </label>
              <select
                id="tx-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="ot-add-transaction-modal__input"
                aria-invalid={!!errors.accountId}
                aria-describedby={errors.accountId ? 'error-account' : undefined}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountLabel}
                  </option>
                ))}
              </select>
              {errors.accountId && (
                <span id="error-account" className="ot-add-transaction-modal__field-error">
                  {errors.accountId}
                </span>
              )}
            </div>
          </div>

          <div className="ot-add-transaction-modal__field">
            <label htmlFor="tx-description" className="ot-add-transaction-modal__label">
              {t('movements.form.fields.description')}
            </label>
            <input
              id="tx-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('movements.form.placeholders.description')}
              maxLength={500}
              className="ot-add-transaction-modal__input"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'error-description' : undefined}
            />
            {errors.description && (
              <span id="error-description" className="ot-add-transaction-modal__field-error">
                {errors.description}
              </span>
            )}
          </div>

          <div className="ot-add-transaction-modal__row">
            <div className="ot-add-transaction-modal__field">
              <label htmlFor="tx-category" className="ot-add-transaction-modal__label">
                {t('movements.form.fields.category')}
              </label>
              <select
                id="tx-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="ot-add-transaction-modal__input"
              >
                <option value="">{t('configuracion.categorias.none')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="ot-add-transaction-modal__field">
              <label htmlFor="tx-tags" className="ot-add-transaction-modal__label">
                {t('movements.form.fields.tags')}
              </label>
              <select
                id="tx-tags"
                multiple
                value={tagIds}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setTagIds(opts);
                }}
                className="ot-add-transaction-modal__input"
                size={Math.min(4, Math.max(2, tags.length))}
              >
                {tags.map((tg) => (
                  <option key={tg.id} value={tg.id}>
                    {tg.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <footer className="ot-add-transaction-modal__footer">
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
