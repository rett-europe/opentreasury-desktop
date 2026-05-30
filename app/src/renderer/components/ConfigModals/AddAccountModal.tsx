import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Eye, EyeOff, Landmark, Tag as TagIcon } from 'lucide-react';
import { createAccount } from '../../services/accountsApi.js';
import { updateAccount } from '../../services/configMutationsApi.js';
import type {
  AccountRecord,
  CreateAccountResponse,
} from '../../../shared/ipc-contracts/accounts.js';
import { ConfigModalShell } from './ConfigModalShell.js';
import { ConfirmDialog } from '../ConfirmDialog/index.js';
import { mapConfigErrorToFieldKey } from './errorMap.js';
import {
  decimalSeparatorForLocale,
  formatAmountForInput,
  formatCurrency,
  isValidAmountInput,
  parseLocaleAmount,
} from '../../utils/numberFormat.js';
import { CATEGORY_PALETTE } from './AddCategoryModal.js';

export interface AddAccountModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSaved: (account: AccountRecord) => void;
  readonly mode?: 'add' | 'edit';
  readonly record?: AccountRecord | null;
  /**
   * Number of transactions already attached to the account. Drives the
   * "are you sure?" confirmation when the user changes the opening balance
   * in edit mode. Omitted / `0` means the change is safe to apply directly
   * (no derived data to shift). Only consulted in `mode === 'edit'`.
   */
  readonly usageCount?: number;
}

interface Errors {
  name?: string;
  bankName?: string;
  openingBalance?: string;
  iban?: string;
}

function maskIban(iban: string): string {
  const compact = iban.replace(/\s+/g, '');
  if (compact.length <= 4) return compact;
  const prefix = compact.slice(0, 2);
  const last4 = compact.slice(-4);
  const hiddenLen = compact.length - prefix.length - last4.length;
  const stars = '•'.repeat(hiddenLen);
  return `${prefix}${stars}${last4}`.replace(/(.{4})(?=.)/g, '$1 ');
}

export function AddAccountModal({
  isOpen,
  onClose,
  onSaved,
  mode = 'add',
  record = null,
  usageCount,
}: AddAccountModalProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const decimalSep = decimalSeparatorForLocale(i18n.language);

  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [label, setLabel] = useState('');
  const [iban, setIban] = useState('');
  const [color, setColor] = useState<string>(CATEGORY_PALETTE[0] ?? '#6d4d8c');
  const [isPaypal, setIsPaypal] = useState(false);
  const [revealIban, setRevealIban] = useState(false);
  const [openingBalance, setOpeningBalance] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Pending confirm-dialog state. When the user clicks Save and the edit
  // would shift the opening balance on an account that already has
  // transactions, we stash the parsed value here and open ConfirmDialog.
  // Null = no pending confirm.
  const [pendingOpeningBalance, setPendingOpeningBalance] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && record) {
        setName(record.name);
        setBankName(record.bankName ?? '');
        setLabel(record.label ?? '');
        setIban(record.iban ?? '');
        setColor(record.color ?? CATEGORY_PALETTE[0] ?? '#6d4d8c');
        setIsPaypal(Boolean(record.isPaypal));
        setOpeningBalance(
          record.openingBalance == null
            ? ''
            : formatAmountForInput(record.openingBalance, decimalSep),
        );
      } else {
        setName('');
        setBankName('');
        setLabel('');
        setIban('');
        setColor(CATEGORY_PALETTE[0] ?? '#6d4d8c');
        setIsPaypal(false);
        setOpeningBalance('');
      }
      setRevealIban(false);
      setErrors({});
      setGeneralError(null);
      setSubmitting(false);
      setPendingOpeningBalance(null);
    }
  }, [isOpen, mode, record, decimalSep]);

  const validate = useCallback((): boolean => {
    const next: Errors = {};
    if (!name.trim()) next.name = t('configuracion.errors.nameEmpty');
    else if (name.trim().length > 80) next.name = t('configuracion.errors.nameTooLong');

    if (openingBalance.trim() !== '') {
      // ES locale uses `,` as the decimal separator. The input is rendered
      // as `type="text"` (not `number`) so the user's raw text — comma or
      // dot — survives the round-trip. `parseLocaleAmount` returns NaN
      // for empty / non-numeric input; the `isFinite` check below catches
      // both that and ±Infinity.
      const n = parseLocaleAmount(openingBalance);
      if (!Number.isFinite(n))
        next.openingBalance = t('configuracion.errors.openingBalanceInvalid');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [name, openingBalance, t]);

  const applyServerError = useCallback(
    (resp: Extract<CreateAccountResponse, { ok: false }>) => {
      const { error } = resp;
      const fieldKey = mapConfigErrorToFieldKey(error.code);
      const msg = t(`configuracion.errors.${fieldKey}`, { defaultValue: error.message });
      if (error.field === 'name') setErrors((prev) => ({ ...prev, name: msg }));
      else if (error.field === 'openingBalance')
        setErrors((prev) => ({ ...prev, openingBalance: msg }));
      else if (error.field === 'bankName') setErrors((prev) => ({ ...prev, bankName: msg }));
      else setGeneralError(msg);
    },
    [t],
  );

  // Actually fire the IPC + close the modal. Extracted so the edit-mode
  // confirm dialog (opening-balance shift on an account with transactions)
  // can call it after the user confirms.
  const performSave = useCallback(
    async (parsedOpeningBalance: number | undefined) => {
      setSubmitting(true);
      try {
        if (mode === 'edit' && record) {
          // Only include `openingBalance` on the wire when it actually
          // moves. The handler also no-op-strips, but pruning here keeps
          // the patch minimal and avoids issuing a write at all when the
          // user only changed other fields. Without this, an unchanged
          // input would still serialise `openingBalance: <same value>`.
          const includeOpening =
            parsedOpeningBalance !== undefined && parsedOpeningBalance !== record.openingBalance;
          const changes = {
            name: name.trim(),
            bankName: bankName.trim() || undefined,
            label: label.trim() || undefined,
            iban: !isPaypal && iban.trim() ? iban.trim() : undefined,
            color,
            isPaypal,
            ...(includeOpening ? { openingBalance: parsedOpeningBalance } : {}),
          };
          await updateAccount(record.id, changes);
          const updated: AccountRecord = {
            id: record.id,
            name: changes.name,
            currency: record.currency,
            openingBalance: includeOpening
              ? (parsedOpeningBalance as number)
              : record.openingBalance,
            sortOrder: record.sortOrder,
            createdAt: record.createdAt,
            ...(changes.bankName !== undefined ? { bankName: changes.bankName } : {}),
            ...(changes.label !== undefined ? { label: changes.label } : {}),
            ...(changes.iban !== undefined ? { iban: changes.iban } : {}),
            ...(changes.color !== undefined ? { color: changes.color } : {}),
            ...(changes.isPaypal !== undefined ? { isPaypal: changes.isPaypal } : {}),
            ...(record.archivedAt !== undefined ? { archivedAt: record.archivedAt } : {}),
          };
          onSaved(updated);
          onClose();
          return;
        }
        const resp = await createAccount({
          name: name.trim(),
          bankName: bankName.trim() || undefined,
          label: label.trim() || undefined,
          iban: !isPaypal && iban.trim() ? iban.trim() : undefined,
          color,
          isPaypal,
          openingBalance: parsedOpeningBalance,
        });
        if (!resp.ok) {
          applyServerError(resp);
          return;
        }
        onSaved({
          id: resp.event.id,
          name: resp.event.name,
          currency: resp.event.currency,
          openingBalance: resp.event.openingBalance,
          sortOrder: resp.event.sortOrder,
          createdAt: resp.event.createdAt,
          ...(resp.event.bankName !== undefined ? { bankName: resp.event.bankName } : {}),
          ...(resp.event.label !== undefined ? { label: resp.event.label } : {}),
          ...(resp.event.iban !== undefined ? { iban: resp.event.iban } : {}),
          ...(resp.event.color !== undefined ? { color: resp.event.color } : {}),
          ...(resp.event.isPaypal !== undefined ? { isPaypal: resp.event.isPaypal } : {}),
        });
        onClose();
      } catch (err) {
        setGeneralError(
          err instanceof Error ? err.message : t('configuracion.errors.submitFailed'),
        );
      } finally {
        setSubmitting(false);
      }
    },
    [
      mode,
      record,
      name,
      bankName,
      label,
      iban,
      color,
      isPaypal,
      onSaved,
      onClose,
      applyServerError,
      t,
    ],
  );

  const handleSubmit = useCallback(async () => {
    setGeneralError(null);
    if (!validate()) return;
    // parseLocaleAmount accepts both `,` (ES) and `.` (EN) decimal
    // separators using the last-separator-wins rule, so the user can type
    // `1331,85` or `1.331,85` or `1331.85` and they all become 1331.85.
    const parsed = openingBalance.trim() === '' ? undefined : parseLocaleAmount(openingBalance);
    // Edit mode: if the user is shifting the opening balance on an account
    // that already has transactions, intercept the save with a confirmation
    // dialog so they understand the downstream impact. The handler permits
    // the change unconditionally; the dialog is a UX-only safety net.
    if (
      mode === 'edit' &&
      record &&
      parsed !== undefined &&
      parsed !== record.openingBalance &&
      (usageCount ?? 0) > 0
    ) {
      setPendingOpeningBalance(parsed);
      return;
    }
    await performSave(parsed);
  }, [validate, openingBalance, mode, record, usageCount, performSave]);

  const handleConfirmOpeningBalanceChange = useCallback(() => {
    const parsed = pendingOpeningBalance;
    setPendingOpeningBalance(null);
    if (parsed === null) return;
    void performSave(parsed);
  }, [pendingOpeningBalance, performSave]);

  const handleCancelOpeningBalanceChange = useCallback(() => {
    // Bare close — keep the in-flight input value so the user can adjust
    // and try again. Mirrors the no-data-loss behavior of the other
    // discard/confirm dialogs in the app.
    setPendingOpeningBalance(null);
  }, []);

  const locale = i18n.language || 'en';
  const openingBalanceChangeBody = useMemo(() => {
    if (pendingOpeningBalance === null || !record) return '';
    const oldBalance = record.openingBalance;
    const newBalance = pendingOpeningBalance;
    return t('configuracion.cuentas.openingBalanceChange.body', {
      count: usageCount ?? 0,
      oldBalance: formatCurrency(oldBalance, locale),
      newBalance: formatCurrency(newBalance, locale),
      delta: formatCurrency(newBalance - oldBalance, locale),
    });
  }, [pendingOpeningBalance, record, usageCount, locale, t]);

  return (
    <ConfigModalShell
      isOpen={isOpen}
      titleKey={
        mode === 'edit'
          ? 'configuracion.cuentas.modal.editTitle'
          : 'configuracion.cuentas.modal.title'
      }
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={submitting}
      generalError={generalError}
      submitLabelKey="common.save"
      submittingLabelKey="common.saving"
    >
      <div className="ot-config-modal__row">
        <div className="ot-config-modal__field">
          <label htmlFor="acc-name" className="ot-config-modal__label">
            {t('configuracion.cuentas.name')}
          </label>
          <input
            id="acc-name"
            className="ot-config-modal__input"
            type="text"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'acc-name-err' : undefined}
            autoFocus
          />
          {errors.name ? (
            <span id="acc-name-err" className="ot-config-modal__field-error">
              {errors.name}
            </span>
          ) : null}
        </div>

        <div className="ot-config-modal__field">
          <label htmlFor="acc-bank" className="ot-config-modal__label">
            {t('configuracion.cuentas.bank')}
            <span className="ot-config-modal__label-hint">{t('configuracion.optional')}</span>
          </label>
          <input
            id="acc-bank"
            className="ot-config-modal__input"
            type="text"
            value={bankName}
            maxLength={80}
            onChange={(e) => setBankName(e.target.value)}
            aria-invalid={Boolean(errors.bankName)}
          />
        </div>
      </div>

      <div className="ot-config-modal__field">
        <label htmlFor="acc-label" className="ot-config-modal__label">
          {t('configuracion.cuentas.label')}
          <span className="ot-config-modal__label-hint">{t('configuracion.optional')}</span>
        </label>
        <input
          id="acc-label"
          className="ot-config-modal__input"
          type="text"
          value={label}
          maxLength={30}
          placeholder={t('configuracion.cuentas.labelPlaceholder')}
          onChange={(e) => setLabel(e.target.value)}
        />
        <span className="ot-config-modal__field-hint">{t('configuracion.cuentas.labelHint')}</span>
      </div>

      <div className="ot-config-modal__row">
        <div className="ot-config-modal__field">
          <label htmlFor="acc-iban" className="ot-config-modal__label">
            IBAN
            <span className="ot-config-modal__label-hint">{t('configuracion.optional')}</span>
          </label>
          <div className="ot-config-modal__input-with-affix">
            <input
              id="acc-iban"
              className="ot-config-modal__input ot-config-modal__input--mono"
              type={revealIban ? 'text' : 'password'}
              autoComplete="off"
              spellCheck={false}
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              placeholder="ES00 0000 0000 00 0000000000"
              disabled={isPaypal}
            />
            <button
              type="button"
              className="ot-config-modal__affix-btn"
              title={
                revealIban
                  ? t('configuracion.cuentas.iban.hide')
                  : t('configuracion.cuentas.iban.show')
              }
              aria-label={
                revealIban
                  ? t('configuracion.cuentas.iban.hide')
                  : t('configuracion.cuentas.iban.show')
              }
              onClick={() => setRevealIban((v) => !v)}
            >
              {revealIban ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <span className="ot-config-modal__field-hint">
            {isPaypal
              ? t('configuracion.cuentas.ibanHint.paypal')
              : t('configuracion.cuentas.ibanHint.default')}
          </span>
        </div>

        <div className="ot-config-modal__field">
          <span className="ot-config-modal__label" id="acc-color-label">
            {t('configuracion.cuentas.color')}
          </span>
          <div
            className="ot-config-modal__palette"
            role="radiogroup"
            aria-labelledby="acc-color-label"
          >
            {CATEGORY_PALETTE.map((hex) => (
              <button
                key={hex}
                type="button"
                className="ot-config-modal__swatch"
                role="radio"
                aria-checked={color === hex}
                aria-label={hex}
                style={{ background: hex }}
                onClick={() => setColor(hex)}
              >
                {color === hex ? <Check size={14} color="#fff" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          <label className="ot-config-modal__checkbox-row">
            <input
              type="checkbox"
              checked={isPaypal}
              onChange={(e) => setIsPaypal(e.target.checked)}
            />
            {t('configuracion.cuentas.externalPlatformToggle')}
          </label>
        </div>
      </div>

      <div className="ot-config-modal__field">
        <label htmlFor="acc-opening" className="ot-config-modal__label">
          {t('configuracion.cuentas.openingBalance')}
          <span className="ot-config-modal__label-hint">{t('configuracion.optional')}</span>
        </label>
        <input
          id="acc-opening"
          className="ot-config-modal__input"
          // type="text" + inputMode="decimal" so the user can type the ES
          // comma-decimal (`1331,85` / `1.331,85`) without the browser
          // stripping it. parseLocaleAmount in handleSubmit handles both
          // `,` and `.` decimals. Mirrors the pattern landed for the
          // balance-adjustment modal in PR #346.
          type="text"
          inputMode="decimal"
          value={openingBalance}
          placeholder="0,00"
          onChange={(e) => {
            // Sanitize keystrokes so the field can't fill up with invalid
            // characters (e.g. "1..2", "1,,2"). parseLocaleAmount in validate()
            // would still flag the garbage, but the UX of allowing typed
            // garbage is unacceptable.
            if (isValidAmountInput(e.target.value, decimalSep)) {
              setOpeningBalance(e.target.value);
            }
          }}
          aria-invalid={Boolean(errors.openingBalance)}
          aria-describedby={errors.openingBalance ? 'acc-opening-err' : undefined}
        />
        {mode === 'edit' ? (
          <span className="ot-config-modal__field-hint">
            {t('configuracion.cuentas.form.openingBalance.editHint')}
          </span>
        ) : null}
        {errors.openingBalance ? (
          <span id="acc-opening-err" className="ot-config-modal__field-error">
            {errors.openingBalance}
          </span>
        ) : null}
      </div>

      <div className="ot-config-modal__field">
        <span className="ot-config-modal__label">{t('configuracion.previewLabel')}</span>
        <div className="ot-config-modal__preview-box">
          <span className="ot-config__entity-icon" style={{ background: color }} aria-hidden="true">
            <Landmark size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 'var(--font-weight-medium)' }}>
              {name || t('configuracion.cuentas.preview.namePlaceholder')}
            </div>
            <div className="ot-config__meta-text">
              {bankName ||
                (isPaypal
                  ? t('configuracion.cuentas.row.externalPlatform')
                  : t('configuracion.cuentas.row.bankAccount'))}
            </div>
          </div>
          {label ? (
            <span
              className="ot-config__account-pill"
              style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}
            >
              <span
                className="ot-config__account-pill-dot"
                style={{ background: color }}
                aria-hidden="true"
              />
              <TagIcon size={10} aria-hidden="true" />
              {label}
            </span>
          ) : null}
          <span className="ot-config__code-mono">
            {isPaypal ? '—' : iban ? maskIban(iban) : 'ES•• •••• •••• •• ••••••••••'}
          </span>
        </div>
      </div>
      <ConfirmDialog
        isOpen={pendingOpeningBalance !== null}
        title={t('configuracion.cuentas.openingBalanceChange.title')}
        message={openingBalanceChangeBody}
        confirmLabel={t('configuracion.cuentas.openingBalanceChange.confirm')}
        cancelLabel={t('common.cancel')}
        variant="default"
        onConfirm={handleConfirmOpeningBalanceChange}
        onCancel={handleCancelOpeningBalanceChange}
      />
    </ConfigModalShell>
  );
}
