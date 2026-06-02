import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import { DateInput } from '../DateInput/index.js';
import type {
  CreateTransactionRequest,
  UpdateTransactionRequest,
} from '../../../shared/ipc-contracts/transaction.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import './TransactionFormModal.css';
import { useCloseDialogOnUnmount } from '../../hooks/useCloseDialogOnUnmount.js';
import { useFormatters } from '../../format/index.js';

export interface TransactionFormData {
  id?: string;
  accountId: string;
  date: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  categoryId?: string | null;
  subcategoryId?: string | null;
  tagIds?: string[];
  status?: 'pending' | 'approved';
  reference?: string | null;
  details?: string | null;
}

interface TransactionFormModalProps {
  mode: 'add' | 'edit';
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: CreateTransactionRequest | UpdateTransactionRequest) => Promise<void>;
  accounts: readonly Account[];
  categories?: readonly CategoryRecord[];
  tags?: readonly TagRecord[];
  initialData?: TransactionFormData | null;
}

interface FormErrors {
  date?: string;
  type?: string;
  amount?: string;
  description?: string;
  accountId?: string;
  reference?: string;
  details?: string;
}

/**
 * Transaction Form Modal — WI-20 refactor.
 * Unified modal for creating (mode=add) and editing (mode=edit) transactions.
 *
 * Key differences from AddTransactionModal:
 * - mode prop controls behavior (add vs edit)
 * - initialData pre-fills form in edit mode
 * - Account dropdown disabled in edit mode (immutable accountId)
 * - Status picker exposed (was hardcoded to 'approved')
 * - Reference + Details fields wired
 *
 * Accessibility: native <dialog> with focus trap, Escape to close, ARIA labels.
 */
export function TransactionFormModal({
  mode,
  isOpen,
  onClose,
  onSubmit,
  accounts,
  categories = [],
  tags = [],
  initialData = null,
}: TransactionFormModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const { decimalSep, formatAmountForInput, isValidAmountInput, parseAmount } = useFormatters();
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
  const [status, setStatus] = useState<'pending' | 'approved'>('approved');
  const [reference, setReference] = useState('');
  const [details, setDetails] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Auto-select first account when accounts change and no selection yet (add mode only)
  useEffect(() => {
    if (mode === 'add' && accounts.length > 0 && !accountId) {
      setAccountId(accounts[0]!.id);
    }
  }, [mode, accounts, accountId]);

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

  // Top-layer safety: see hooks/useCloseDialogOnUnmount for context.
  useCloseDialogOnUnmount(dialogRef);

  // Reset or populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        // Edit mode: pre-fill from initialData
        setDate(initialData.date);
        setType(initialData.type);
        setAmount(formatAmountForInput(initialData.amount));
        setDescription(initialData.description);
        setAccountId(initialData.accountId);
        setCategoryId(initialData.categoryId ?? '');
        setSubcategoryId(initialData.subcategoryId ?? '');
        setTagIds(initialData.tagIds ?? []);
        setStatus(initialData.status ?? 'approved');
        setReference(initialData.reference ?? '');
        setDetails(initialData.details ?? '');
      } else {
        // Add mode: reset to defaults
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
      }
      setErrors({});
      setGeneralError(null);
    }
  }, [isOpen, mode, initialData, accounts, formatAmountForInput]);

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

    const amountNum = parseAmount(amount);
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
  }, [date, type, amount, description, accountId, reference, details, t, parseAmount]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setGeneralError(null);

      if (!validate()) {
        return;
      }

      setIsSubmitting(true);

      try {
        if (mode === 'add') {
          const input: CreateTransactionRequest = {
            date,
            type,
            amount: parseAmount(amount),
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
        } else {
          // Edit mode: UpdateTransactionRequest excludes currency (server-controlled)
          if (!initialData?.id) {
            throw new Error('Transaction ID missing in edit mode');
          }
          const input: UpdateTransactionRequest = {
            id: initialData.id,
            date,
            type,
            amount: parseAmount(amount),
            description: description.trim(),
            categoryId: categoryId || undefined,
            subcategoryId: subcategoryId || undefined,
            tagIds: tagIds.length > 0 ? tagIds : undefined,
            status,
            reference: reference.trim() || undefined,
            details: details.trim() || undefined,
          };
          await onSubmit(input);
        }
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
      mode,
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
      initialData,
      onSubmit,
      onClose,
      t,
      parseAmount,
    ],
  );

  const modalTitle = mode === 'add' ? t('movements.form.title') : t('movements.form.editTitle');

  return (
    <dialog ref={dialogRef} className="ot-transaction-form-modal" aria-labelledby="modal-title">
      <div className="ot-transaction-form-modal__content">
        <header className="ot-transaction-form-modal__header">
          <h2 id="modal-title" className="ot-transaction-form-modal__title">
            {modalTitle}
          </h2>
          <button
            type="button"
            className="ot-transaction-form-modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </header>

        <form className="ot-transaction-form-modal__form" onSubmit={handleSubmit}>
          {generalError && (
            <div className="ot-transaction-form-modal__error" role="alert">
              {generalError}
            </div>
          )}

          <div className="ot-transaction-form-modal__row">
            <div className="ot-transaction-form-modal__field">
              <label htmlFor="tx-date" className="ot-transaction-form-modal__label">
                {t('movements.form.fields.date')}
              </label>
              <DateInput
                id="tx-date"
                value={date}
                onChange={setDate}
                className="ot-transaction-form-modal__input"
                aria-invalid={!!errors.date}
                aria-describedby={errors.date ? 'error-date' : undefined}
              />
              {errors.date && (
                <span id="error-date" className="ot-transaction-form-modal__field-error">
                  {errors.date}
                </span>
              )}
            </div>

            <div className="ot-transaction-form-modal__field">
              <label htmlFor="tx-type" className="ot-transaction-form-modal__label">
                {t('movements.form.fields.type')}
              </label>
              <select
                id="tx-type"
                value={type}
                onChange={(e) => setType(e.target.value as 'income' | 'expense')}
                className="ot-transaction-form-modal__input"
                aria-invalid={!!errors.type}
                aria-describedby={errors.type ? 'error-type' : undefined}
              >
                <option value="income">{t('movements.filters.type.income')}</option>
                <option value="expense">{t('movements.filters.type.expense')}</option>
              </select>
              {errors.type && (
                <span id="error-type" className="ot-transaction-form-modal__field-error">
                  {errors.type}
                </span>
              )}
            </div>
          </div>

          <div className="ot-transaction-form-modal__row">
            <div className="ot-transaction-form-modal__field">
              <label htmlFor="tx-amount" className="ot-transaction-form-modal__label">
                {t('movements.form.fields.amount')}
              </label>
              <input
                id="tx-amount"
                // ES locale sweep: `type="text"` + `inputMode="decimal"` so
                // users can type comma-decimal amounts (e.g. `1331,85`).
                // Parsing happens in handleSubmit/validate via `parseLocaleAmount`.
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  if (isValidAmountInput(e.target.value)) {
                    setAmount(e.target.value);
                  }
                }}
                placeholder={`0${decimalSep}00`}
                className="ot-transaction-form-modal__input"
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? 'error-amount' : undefined}
              />
              {errors.amount && (
                <span id="error-amount" className="ot-transaction-form-modal__field-error">
                  {errors.amount}
                </span>
              )}
            </div>

            <div className="ot-transaction-form-modal__field">
              <label htmlFor="tx-account" className="ot-transaction-form-modal__label">
                {t('movements.form.fields.account')}
              </label>
              <select
                id="tx-account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="ot-transaction-form-modal__input"
                aria-invalid={!!errors.accountId}
                aria-describedby={errors.accountId ? 'error-account' : undefined}
                disabled={mode === 'edit'}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountLabel}
                  </option>
                ))}
              </select>
              {errors.accountId && (
                <span id="error-account" className="ot-transaction-form-modal__field-error">
                  {errors.accountId}
                </span>
              )}
            </div>
          </div>

          <div className="ot-transaction-form-modal__field">
            <label htmlFor="tx-description" className="ot-transaction-form-modal__label">
              {t('movements.form.fields.description')}
            </label>
            <input
              id="tx-description"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('movements.form.placeholders.description')}
              maxLength={500}
              className="ot-transaction-form-modal__input"
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'error-description' : undefined}
            />
            {errors.description && (
              <span id="error-description" className="ot-transaction-form-modal__field-error">
                {errors.description}
              </span>
            )}
          </div>

          <div className="ot-transaction-form-modal__row">
            <div className="ot-transaction-form-modal__field">
              <label htmlFor="tx-category" className="ot-transaction-form-modal__label">
                {t('movements.form.fields.category')}
              </label>
              <select
                id="tx-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="ot-transaction-form-modal__input"
              >
                <option value="">{t('configuracion.categorias.none')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="ot-transaction-form-modal__field">
              <label htmlFor="tx-tags" className="ot-transaction-form-modal__label">
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
                className="ot-transaction-form-modal__input"
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

          <div className="ot-transaction-form-modal__row">
            <div className="ot-transaction-form-modal__field">
              <label htmlFor="tx-status" className="ot-transaction-form-modal__label">
                {t('movements.form.fields.status')}
              </label>
              <select
                id="tx-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as 'pending' | 'approved')}
                className="ot-transaction-form-modal__input"
              >
                <option value="approved">{t('movements.status.approved')}</option>
                <option value="pending">{t('movements.status.pending')}</option>
              </select>
            </div>

            <div className="ot-transaction-form-modal__field">
              <label htmlFor="tx-reference" className="ot-transaction-form-modal__label">
                {t('movements.form.fields.reference')}
              </label>
              <input
                id="tx-reference"
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={t('movements.form.placeholders.reference')}
                maxLength={120}
                className="ot-transaction-form-modal__input"
                aria-invalid={!!errors.reference}
                aria-describedby={errors.reference ? 'error-reference' : undefined}
              />
              {errors.reference && (
                <span id="error-reference" className="ot-transaction-form-modal__field-error">
                  {errors.reference}
                </span>
              )}
            </div>
          </div>

          <div className="ot-transaction-form-modal__field">
            <label htmlFor="tx-details" className="ot-transaction-form-modal__label">
              {t('movements.form.fields.details')}
            </label>
            <textarea
              id="tx-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={t('movements.form.placeholders.details')}
              maxLength={1000}
              rows={3}
              className="ot-transaction-form-modal__input"
              aria-invalid={!!errors.details}
              aria-describedby={errors.details ? 'error-details' : undefined}
            />
            {errors.details && (
              <span id="error-details" className="ot-transaction-form-modal__field-error">
                {errors.details}
              </span>
            )}
          </div>

          <footer className="ot-transaction-form-modal__footer">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? t('common.saving') : t('common.save')}
            </Button>
          </footer>
        </form>
      </div>
    </dialog>
  );
}
