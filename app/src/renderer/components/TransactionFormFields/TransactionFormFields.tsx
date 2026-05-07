import { useTranslation } from 'react-i18next';
import { TagChipPicker } from '../TagChipPicker/index.js';
import { CategoryPickerRows } from '../CategoryPickerRows/index.js';
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
  /** Currency for read-only display (edit mode mirrors view's currency field) */
  currency?: string;
  /** SPEC-023 AC14 — Disable amount field when transaction has active splits. */
  amountDisabled?: boolean;
  /** SPEC-025 — original status when modal entered edit mode. Used to determine
   * whether status-based locks apply. Only `approved` originally → fields lock. */
  originalStatus?: 'pending' | 'approved';
  /** SPEC-025 — passthrough for split-locked amount hint precedence. */
  hasSplits?: boolean;
}

/**
 * TransactionFormFields — Shared form field markup for transaction entry.
 *
 * In edit mode, field ORDER and LABEL styling MIRRORS the view mode exactly:
 *   Row 1: Account / Category
 *   Row 2: Subcategory / Tags
 *   Row 3: Status / Currency (read-only)
 *   Then: Reference, Details (extra sections)
 *
 * In add mode, includes editable date/type/amount/description at the top
 * since those aren't provided by a summary header.
 *
 * Labels use same uppercase tracking style as view mode's dt elements.
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
  subcategoryId,
  onSubcategoryIdChange,
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
  currency,
  amountDisabled = false,
  originalStatus,
  hasSplits = false,
}: TransactionFormFieldsProps): JSX.Element {
  const { t } = useTranslation('common');

  // SPEC-025 — status-based field lock derivation.
  // Lock applies only if the transaction was `approved` when the modal opened
  // AND the live form status is still `approved`. This means:
  //  - approved → pending (mid-edit): fields unlock immediately (AC3).
  //  - pending  → approved (mid-edit): fields stay editable; lock applies on
  //    the NEXT modal open (AC4).
  const statusLocked = originalStatus === 'approved' && status === 'approved';
  const statusHint = t('transactionDetail.editLock.statusLockedHint');
  const splitHint = t('splits.detail.amountLocked');

  // Edit mode: field order mirrors view mode (Date → Description → Account →
  // Amount → Category → Subcategory → Tags → Status → Currency)
  // Heavy fields (Date/Description/Amount/Account) are status-locked per SPEC-025.
  if (mode === 'edit') {
    return (
      <div className="ot-tx-fields">
        {/* Row 0: Date / Description — SPEC-025 §FR1 */}
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
              aria-describedby={
                errors.date ? 'error-date' : statusLocked ? 'lock-hint-date' : undefined
              }
              disabled={readonly || statusLocked}
            />
            {errors.date && (
              <span id="error-date" className="ot-tx-fields__field-error">
                {errors.date}
              </span>
            )}
            {!errors.date && statusLocked && (
              <span id="lock-hint-date" className="ot-tx-fields__field-hint" role="note">
                {statusHint}
              </span>
            )}
          </div>

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
              aria-describedby={
                errors.description
                  ? 'error-description'
                  : statusLocked
                    ? 'lock-hint-description'
                    : undefined
              }
              disabled={readonly || statusLocked}
            />
            {errors.description && (
              <span id="error-description" className="ot-tx-fields__field-error">
                {errors.description}
              </span>
            )}
            {!errors.description && statusLocked && (
              <span id="lock-hint-description" className="ot-tx-fields__field-hint" role="note">
                {statusHint}
              </span>
            )}
          </div>
        </div>

        {/* Row 1: Account / Amount — SPEC-025 §FR1, SPEC-023 amount lock */}
        <div className="ot-tx-fields__row">
          <div className="ot-tx-fields__field">
            <label htmlFor="tx-account" className="ot-tx-fields__label">
              {t('transactionDetail.fields.account')}
            </label>
            <select
              id="tx-account"
              value={accountId}
              onChange={(e) => onAccountIdChange(e.target.value)}
              className="ot-tx-fields__input"
              aria-invalid={!!errors.accountId}
              aria-describedby={
                errors.accountId ? 'error-account' : statusLocked ? 'lock-hint-account' : undefined
              }
              disabled={readonly || statusLocked}
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
            {!errors.accountId && statusLocked && (
              <span id="lock-hint-account" className="ot-tx-fields__field-hint" role="note">
                {statusHint}
              </span>
            )}
          </div>

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
              aria-describedby={
                errors.amount
                  ? 'error-amount'
                  : hasSplits || amountDisabled
                    ? 'lock-hint-amount-splits'
                    : statusLocked
                      ? 'lock-hint-amount-status'
                      : undefined
              }
              disabled={readonly || amountDisabled || hasSplits || statusLocked}
            />
            {errors.amount && (
              <span id="error-amount" className="ot-tx-fields__field-error">
                {errors.amount}
              </span>
            )}
            {/* SPEC-025 §FR6 — split-lock hint takes precedence over status hint */}
            {!errors.amount && (hasSplits || amountDisabled) && (
              <span id="lock-hint-amount-splits" className="ot-tx-fields__field-hint" role="note">
                {splitHint}
              </span>
            )}
            {!errors.amount && !hasSplits && !amountDisabled && statusLocked && (
              <span id="lock-hint-amount-status" className="ot-tx-fields__field-hint" role="note">
                {statusHint}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: Category / Subcategory — always editable per SPEC-025 §4.1 */}
        <div className="ot-tx-fields__row">
          <div className="ot-tx-fields__field">
            <label htmlFor="tx-category" className="ot-tx-fields__label">
              {t('transactionDetail.fields.category')}
            </label>
            <select
              id="tx-category"
              value={categoryId}
              onChange={(e) => {
                onCategoryIdChange(e.target.value);
                // Clear subcategory so it never belongs to a stale parent.
                if (subcategoryId) onSubcategoryIdChange('');
              }}
              className="ot-tx-fields__input"
              disabled={readonly}
            >
              <option value="">{t('transactionDetail.fields.none')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="ot-tx-fields__field">
            <label htmlFor="tx-subcategory" className="ot-tx-fields__label">
              {t('transactionDetail.fields.subcategory')}
            </label>
            <select
              id="tx-subcategory"
              value={subcategoryId}
              onChange={(e) => onSubcategoryIdChange(e.target.value)}
              className="ot-tx-fields__input"
              disabled={readonly || !categoryId}
            >
              <option value="">{t('transactionDetail.fields.none')}</option>
              {(categories.find((c) => c.id === categoryId)?.subcategories ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Tags / Status — Status is the unlock mechanism (SPEC-025 §4.2) */}
        <div className="ot-tx-fields__row">
          <div className="ot-tx-fields__field">
            <label className="ot-tx-fields__label">{t('transactionDetail.fields.tags')}</label>
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

          <div className="ot-tx-fields__field">
            <label htmlFor="tx-status" className="ot-tx-fields__label">
              {t('transactionDetail.fields.status')}
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
        </div>

        {/* Row 4: Currency (read-only) */}
        <div className="ot-tx-fields__row">
          <div className="ot-tx-fields__field">
            <span className="ot-tx-fields__label">{t('transactionDetail.fields.currency')}</span>
            <span className="ot-tx-fields__value">{currency ?? '—'}</span>
          </div>
          <div className="ot-tx-fields__field" aria-hidden="true" />
        </div>

        {/* Reference — always editable (SPEC-025 §4.1) */}
        <div className="ot-tx-fields__field">
          <label htmlFor="tx-reference" className="ot-tx-fields__label">
            {t('transactionDetail.fields.reference')}
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

        {/* Details — always editable (SPEC-025 §4.1) */}
        <div className="ot-tx-fields__field">
          <label htmlFor="tx-details" className="ot-tx-fields__label">
            {t('transactionDetail.fields.details')}
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

  // Add mode: includes editable date/type/amount/description first
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
            disabled={readonly || amountDisabled}
          />
          {errors.amount && (
            <span id="error-amount" className="ot-tx-fields__field-error">
              {errors.amount}
            </span>
          )}
        </div>

        <div className="ot-tx-fields__field">
          <label htmlFor="tx-account" className="ot-tx-fields__label">
            {t('transactionDetail.fields.account')}
          </label>
          <select
            id="tx-account"
            value={accountId}
            onChange={(e) => onAccountIdChange(e.target.value)}
            className="ot-tx-fields__input"
            aria-invalid={!!errors.accountId}
            aria-describedby={errors.accountId ? 'error-account' : undefined}
            disabled={readonly}
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

      {/* Row 3: Category / Subcategory — shared with bulk-classify modal */}
      <CategoryPickerRows
        categoryId={categoryId}
        onCategoryIdChange={onCategoryIdChange}
        subcategoryId={subcategoryId}
        onSubcategoryIdChange={onSubcategoryIdChange}
        categories={categories}
        disabled={readonly}
        layout="pair"
      />

      {/* Row 4: Tags / Status */}
      <div className="ot-tx-fields__row">
        <div className="ot-tx-fields__field">
          <label className="ot-tx-fields__label">{t('transactionDetail.fields.tags')}</label>
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

        <div className="ot-tx-fields__field">
          <label htmlFor="tx-status" className="ot-tx-fields__label">
            {t('transactionDetail.fields.status')}
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
      </div>

      {/* Reference */}
      <div className="ot-tx-fields__field">
        <label htmlFor="tx-reference" className="ot-tx-fields__label">
          {t('transactionDetail.fields.reference')}
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

      {/* Details */}
      <div className="ot-tx-fields__field">
        <label htmlFor="tx-details" className="ot-tx-fields__label">
          {t('transactionDetail.fields.details')}
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
