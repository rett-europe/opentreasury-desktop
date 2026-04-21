import { useTranslation } from 'react-i18next';
import { TagChipPicker } from '../TagChipPicker/index.js';
import type { Account } from '../../../shared/ipc-contracts/panel.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import './TransactionFormFields.css';

export interface TransactionFormFieldsProps {
  date: string;
  onDateChange: (value: string) => void;
  type: 'income' | 'expense';
  onTypeChange: (value: 'income' | 'expense') => void;
  amount: string;
  onAmountChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  accountId: string;
  onAccountIdChange: (value: string) => void;
  categoryId: string;
  onCategoryIdChange: (value: string) => void;
  subcategoryId: string;
  onSubcategoryIdChange: (value: string) => void;
  tagIds: string[];
  onTagIdsChange: (value: string[]) => void;
  status: 'pending' | 'approved';
  onStatusChange: (value: 'pending' | 'approved') => void;
  reference: string;
  onReferenceChange: (value: string) => void;
  details: string;
  onDetailsChange: (value: string) => void;
  accounts: readonly Account[];
  categories?: readonly CategoryRecord[];
  tags?: readonly TagRecord[];
  errors?: Record<string, string | undefined>;
  readonly?: boolean;
  mode?: 'add' | 'edit';
}

/**
 * TransactionFormFields — Shared form field markup for transaction entry.
 * Used by both AddTransactionModal (mode=add) and TransactionDetailModal (in-place edit).
 *
 * Two-column layout for compact fields (date/type, amount/account, status/reference)
 * and full-width for description/category/tags/details. This structure matches
 * the existing TransactionFormModal pattern and provides adequate breathing room.
 */
export function TransactionFormFields({
  date,
  onDateChange,
  type,
  onTypeChange,
  amount,
  onAmountChange,
  description,
  onDescriptionChange,
  accountId,
  onAccountIdChange,
  categoryId,
  onCategoryIdChange,
  subcategoryId: _subcategoryId,
  onSubcategoryIdChange: _onSubcategoryIdChange,
  tagIds,
  onTagIdsChange,
  status,
  onStatusChange,
  reference,
  onReferenceChange,
  details,
  onDetailsChange,
  accounts,
  categories = [],
  tags = [],
  errors = {},
  readonly = false,
  mode = 'add',
}: TransactionFormFieldsProps): JSX.Element {
  const { t } = useTranslation('common');

  return (
    <div className="ot-tx-fields">
      {/* Row 1: Date / Type */}
      <div className="ot-tx-fields__row">
        <div className="ot-tx-fields__field">
          <label htmlFor="tx-date" className="ot-tx-fields__label">
            {t('movements.form.fields.date')}
          </label>
          <input
            id="tx-date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="ot-tx-fields__input"
            aria-invalid={!!errors.date}
            aria-describedby={errors.date ? 'error-date' : undefined}
            disabled={readonly}
          />
          {errors.date && (
            <span id="error-date" className="ot-tx-fields__field-error">
              {errors.date}
            </span>
          )}
        </div>

        <div className="ot-tx-fields__field">
          <label htmlFor="tx-type" className="ot-tx-fields__label">
            {t('movements.form.fields.type')}
          </label>
          <select
            id="tx-type"
            value={type}
            onChange={(e) => onTypeChange(e.target.value as 'income' | 'expense')}
            className="ot-tx-fields__input"
            aria-invalid={!!errors.type}
            aria-describedby={errors.type ? 'error-type' : undefined}
            disabled={readonly}
          >
            <option value="income">{t('movements.filters.type.income')}</option>
            <option value="expense">{t('movements.filters.type.expense')}</option>
          </select>
          {errors.type && (
            <span id="error-type" className="ot-tx-fields__field-error">
              {errors.type}
            </span>
          )}
        </div>
      </div>

      {/* Row 2: Amount / Account */}
      <div className="ot-tx-fields__row">
        <div className="ot-tx-fields__field">
          <label htmlFor="tx-amount" className="ot-tx-fields__label">
            {t('movements.form.fields.amount')}
          </label>
          <input
            id="tx-amount"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="0.00"
            className="ot-tx-fields__input"
            aria-invalid={!!errors.amount}
            aria-describedby={errors.amount ? 'error-amount' : undefined}
            disabled={readonly}
          />
          {errors.amount && (
            <span id="error-amount" className="ot-tx-fields__field-error">
              {errors.amount}
            </span>
          )}
        </div>

        <div className="ot-tx-fields__field">
          <label htmlFor="tx-account" className="ot-tx-fields__label">
            {t('movements.form.fields.account')}
          </label>
          <select
            id="tx-account"
            value={accountId}
            onChange={(e) => onAccountIdChange(e.target.value)}
            className="ot-tx-fields__input"
            aria-invalid={!!errors.accountId}
            aria-describedby={errors.accountId ? 'error-account' : undefined}
            disabled={readonly || mode === 'edit'}
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.accountLabel}
              </option>
            ))}
          </select>
          {errors.accountId && (
            <span id="error-account" className="ot-tx-fields__field-error">
              {errors.accountId}
            </span>
          )}
        </div>
      </div>

      {/* Full-width: Description */}
      <div className="ot-tx-fields__field">
        <label htmlFor="tx-description" className="ot-tx-fields__label">
          {t('movements.form.fields.description')}
        </label>
        <input
          id="tx-description"
          type="text"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder={t('movements.form.placeholders.description')}
          maxLength={500}
          className="ot-tx-fields__input"
          aria-invalid={!!errors.description}
          aria-describedby={errors.description ? 'error-description' : undefined}
          disabled={readonly}
        />
        {errors.description && (
          <span id="error-description" className="ot-tx-fields__field-error">
            {errors.description}
          </span>
        )}
      </div>

      {/* Row 3: Category / Tags */}
      <div className="ot-tx-fields__row">
        <div className="ot-tx-fields__field">
          <label htmlFor="tx-category" className="ot-tx-fields__label">
            {t('movements.form.fields.category')}
          </label>
          <select
            id="tx-category"
            value={categoryId}
            onChange={(e) => onCategoryIdChange(e.target.value)}
            className="ot-tx-fields__input"
            disabled={readonly}
          >
            <option value="">{t('configuracion.categorias.none')}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="ot-tx-fields__field">
          <label className="ot-tx-fields__label">{t('movements.form.fields.tags')}</label>
          <TagChipPicker
            availableTags={tags}
            selectedIds={tagIds}
            onToggle={(tagId) => {
              const newTagIds = tagIds.includes(tagId)
                ? tagIds.filter((id) => id !== tagId)
                : [...tagIds, tagId];
              onTagIdsChange(newTagIds);
            }}
            disabled={readonly}
          />
        </div>
      </div>

      {/* Row 4: Status / Reference */}
      <div className="ot-tx-fields__row">
        <div className="ot-tx-fields__field">
          <label htmlFor="tx-status" className="ot-tx-fields__label">
            {t('movements.form.fields.status')}
          </label>
          <select
            id="tx-status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as 'pending' | 'approved')}
            className="ot-tx-fields__input"
            disabled={readonly}
          >
            <option value="approved">{t('movements.status.approved')}</option>
            <option value="pending">{t('movements.status.pending')}</option>
          </select>
        </div>

        <div className="ot-tx-fields__field">
          <label htmlFor="tx-reference" className="ot-tx-fields__label">
            {t('movements.form.fields.reference')}
          </label>
          <input
            id="tx-reference"
            type="text"
            value={reference}
            onChange={(e) => onReferenceChange(e.target.value)}
            placeholder={t('movements.form.placeholders.reference')}
            maxLength={120}
            className="ot-tx-fields__input"
            aria-invalid={!!errors.reference}
            aria-describedby={errors.reference ? 'error-reference' : undefined}
            disabled={readonly}
          />
          {errors.reference && (
            <span id="error-reference" className="ot-tx-fields__field-error">
              {errors.reference}
            </span>
          )}
        </div>
      </div>

      {/* Full-width: Details */}
      <div className="ot-tx-fields__field">
        <label htmlFor="tx-details" className="ot-tx-fields__label">
          {t('movements.form.fields.details')}
        </label>
        <textarea
          id="tx-details"
          value={details}
          onChange={(e) => onDetailsChange(e.target.value)}
          placeholder={t('movements.form.placeholders.details')}
          maxLength={1000}
          rows={3}
          className="ot-tx-fields__input"
          aria-invalid={!!errors.details}
          aria-describedby={errors.details ? 'error-details' : undefined}
          disabled={readonly}
        />
        {errors.details && (
          <span id="error-details" className="ot-tx-fields__field-error">
            {errors.details}
          </span>
        )}
      </div>
    </div>
  );
}
