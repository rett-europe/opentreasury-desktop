import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Eye, EyeOff, Landmark, Tag as TagIcon } from 'lucide-react';
import { createAccount } from '../../services/accountsApi.js';
import { updateAccount } from '../../services/configMutationsApi.js';
import type {
  AccountRecord,
  CreateAccountResponse,
} from '../../../shared/ipc-contracts/accounts.js';
import { ConfigModalShell } from './ConfigModalShell.js';
import { mapConfigErrorToFieldKey } from './errorMap.js';
import { CATEGORY_PALETTE } from './AddCategoryModal.js';
import {
  isValidAmountInput,
  parseLocaleAmount,
  decimalSeparatorForLocale,
} from '../../utils/numberFormat.js';

export interface AddAccountModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSaved: (account: AccountRecord) => void;
  readonly mode?: 'add' | 'edit';
  readonly record?: AccountRecord | null;
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
}: AddAccountModalProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  // Decimal separator for the active locale — drives the opening-balance
  // input sanitizer.
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

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && record) {
        setName(record.name);
        setBankName(record.bankName ?? '');
        setLabel(record.label ?? '');
        setIban(record.iban ?? '');
        setColor(record.color ?? CATEGORY_PALETTE[0] ?? '#6d4d8c');
        setIsPaypal(Boolean(record.isPaypal));
        setOpeningBalance(String(record.openingBalance ?? ''));
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
    }
  }, [isOpen, mode, record]);

  const validate = useCallback((): boolean => {
    const next: Errors = {};
    if (!name.trim()) next.name = t('configuracion.errors.nameEmpty');
    else if (name.trim().length > 80) next.name = t('configuracion.errors.nameTooLong');

    if (openingBalance.trim() !== '') {
      // ES locale sweep: parse via `parseLocaleAmount` so opening balances
      // typed in the Spanish style (`1.331,85`) are accepted alongside `.`
      // decimals. Returns NaN for empty / non-numeric, which `Number.isFinite`
      // rejects below.
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

  const handleSubmit = useCallback(async () => {
    setGeneralError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const parsed = openingBalance.trim() === '' ? undefined : parseLocaleAmount(openingBalance);
      if (mode === 'edit' && record) {
        const changes = {
          name: name.trim(),
          bankName: bankName.trim() || undefined,
          label: label.trim() || undefined,
          iban: !isPaypal && iban.trim() ? iban.trim() : undefined,
          color,
          isPaypal,
        };
        await updateAccount(record.id, changes);
        const updated: AccountRecord = {
          id: record.id,
          name: changes.name,
          currency: record.currency,
          openingBalance: record.openingBalance,
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
        openingBalance: parsed,
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
      setGeneralError(err instanceof Error ? err.message : t('configuracion.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [
    validate,
    openingBalance,
    name,
    bankName,
    label,
    iban,
    color,
    isPaypal,
    onSaved,
    onClose,
    applyServerError,
    mode,
    record,
    t,
  ]);

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
          // ES locale sweep: `type="text"` + `inputMode="decimal"` so the
          // opening balance accepts comma-decimal input (e.g. `1331,85`).
          // Sibling fix to PR #347 (transaction form / movements filter) —
          // applies the same pattern Pedro hit during trial.3.13 testing.
          type="text"
          inputMode="decimal"
          value={openingBalance}
          placeholder="0,00"
          onChange={(e) => {
            // Sanitize keystrokes (locale-aware) so the field can't fill up
            // with invalid characters (wrong separator, > 2 decimals, > 12
            // integer digits). parseLocaleAmount in validate() would still
            // flag the garbage, but the UX of allowing typed garbage is
            // unacceptable.
            if (isValidAmountInput(e.target.value, decimalSep)) {
              setOpeningBalance(e.target.value);
            }
          }}
          aria-invalid={Boolean(errors.openingBalance)}
          aria-describedby={errors.openingBalance ? 'acc-opening-err' : undefined}
          readOnly={mode === 'edit'}
          disabled={mode === 'edit'}
        />
        {mode === 'edit' ? (
          <span className="ot-config-modal__field-hint">
            {t('configuracion.cuentas.modal.openingBalanceImmutable')}
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
    </ConfigModalShell>
  );
}
