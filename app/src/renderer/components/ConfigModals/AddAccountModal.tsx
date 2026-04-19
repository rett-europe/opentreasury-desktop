import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createAccount } from '../../services/accountsApi.js';
import type {
  AccountRecord,
  CreateAccountResponse,
} from '../../../shared/ipc-contracts/accounts.js';
import { ConfigModalShell } from './ConfigModalShell.js';
import { mapConfigErrorToFieldKey } from './errorMap.js';

export interface AddAccountModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onCreated: (account: AccountRecord) => void;
}

interface Errors {
  name?: string;
  bankName?: string;
  openingBalance?: string;
}

export function AddAccountModal({ isOpen, onClose, onCreated }: AddAccountModalProps): JSX.Element {
  const { t } = useTranslation('common');

  const [name, setName] = useState('');
  const [bankName, setBankName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setBankName('');
      setOpeningBalance('');
      setErrors({});
      setGeneralError(null);
      setSubmitting(false);
    }
  }, [isOpen]);

  const validate = useCallback((): boolean => {
    const next: Errors = {};
    if (!name.trim()) next.name = t('configuracion.errors.nameEmpty');
    else if (name.trim().length > 80) next.name = t('configuracion.errors.nameTooLong');

    if (openingBalance.trim() !== '') {
      const n = Number(openingBalance);
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
      const parsed = openingBalance.trim() === '' ? undefined : Number(openingBalance);
      const resp = await createAccount({
        name: name.trim(),
        bankName: bankName.trim() || undefined,
        openingBalance: parsed,
      });
      if (!resp.ok) {
        applyServerError(resp);
        return;
      }
      onCreated({
        id: resp.event.id,
        name: resp.event.name,
        currency: resp.event.currency,
        openingBalance: resp.event.openingBalance,
        createdAt: resp.event.createdAt,
        ...(resp.event.bankName !== undefined ? { bankName: resp.event.bankName } : {}),
      });
      onClose();
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : t('configuracion.errors.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }, [validate, openingBalance, name, bankName, onCreated, onClose, applyServerError, t]);

  return (
    <ConfigModalShell
      isOpen={isOpen}
      titleKey="configuracion.cuentas.modal.title"
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={submitting}
      generalError={generalError}
      submitLabelKey="common.save"
      submittingLabelKey="common.saving"
    >
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
          aria-describedby={errors.bankName ? 'acc-bank-err' : undefined}
        />
        {errors.bankName ? (
          <span id="acc-bank-err" className="ot-config-modal__field-error">
            {errors.bankName}
          </span>
        ) : null}
      </div>

      <div className="ot-config-modal__field">
        <label htmlFor="acc-opening" className="ot-config-modal__label">
          {t('configuracion.cuentas.openingBalance')}
          <span className="ot-config-modal__label-hint">{t('configuracion.optional')}</span>
        </label>
        <input
          id="acc-opening"
          className="ot-config-modal__input"
          type="number"
          step="0.01"
          value={openingBalance}
          placeholder="0.00"
          onChange={(e) => setOpeningBalance(e.target.value)}
          aria-invalid={Boolean(errors.openingBalance)}
          aria-describedby={errors.openingBalance ? 'acc-opening-err' : undefined}
        />
        {errors.openingBalance ? (
          <span id="acc-opening-err" className="ot-config-modal__field-error">
            {errors.openingBalance}
          </span>
        ) : null}
      </div>
    </ConfigModalShell>
  );
}
