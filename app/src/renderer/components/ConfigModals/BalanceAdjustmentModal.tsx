import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createTransaction } from '../../services/transactionApi.js';
import { getAccountBalances } from '../../services/panelApi.js';
import type { ConfigAccount } from '../../services/configMutationsApi.js';
import { ADJUSTMENT_DETAILS_MARKER } from '../../../shared/constants/transactionMarkers.js';
import { useFormatters } from '../../format/index.js';
import { ConfigModalShell } from './ConfigModalShell.js';
import { DateInput } from '../DateInput/index.js';

export interface BalanceAdjustmentModalProps {
  readonly isOpen: boolean;
  readonly account: ConfigAccount | null;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

// Delta amounts below this absolute threshold count as "no change" — guards
// against floating-point dust when subtracting opening balance + transaction
// totals (everything is in EUR with cent precision).
const DELTA_EPSILON = 0.005;

/** Returns YYYY-MM-DD for the local timezone of the browser/runtime. */
function todayLocalIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * BalanceAdjustmentModal — reconciles the displayed balance with reality by
 * creating a regular transaction that absorbs the delta.
 *
 * Event-sourcing-friendly: opening balance + transactions are never rewritten;
 * the adjustment is just another tx (visible, auditable, editable, deletable).
 *
 * Visual parity with AddAccountModal: same `.ot-config-modal__*` skeleton via
 * the shared <ConfigModalShell/>.
 */
export function BalanceAdjustmentModal({
  isOpen,
  account,
  onClose,
  onSaved,
}: BalanceAdjustmentModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const { decimalSep, formatCurrency, formatDate, isValidAmountInput, parseAmount } =
    useFormatters();

  const [currentBalance, setCurrentBalance] = useState<number | null>(null);
  const [target, setTarget] = useState('');
  const [date, setDate] = useState(() => todayLocalIsoDate());
  const [description, setDescription] = useState('');
  const [descriptionTouched, setDescriptionTouched] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Reset state every time the modal is opened so reopening the same modal
  // doesn't carry stale input across accounts.
  useEffect(() => {
    if (!isOpen || !account) return;
    setTarget('');
    setDate(todayLocalIsoDate());
    setDescription('');
    setDescriptionTouched(false);
    setGeneralError(null);
    setSubmitting(false);
    setCurrentBalance(null);
    setLoadingBalance(true);

    let cancelled = false;
    (async () => {
      try {
        const resp = await getAccountBalances();
        if (cancelled) return;
        const net = resp.balances.find((b) => b.accountId === account.id)?.net ?? 0;
        setCurrentBalance(account.openingBalance + net);
      } catch {
        if (cancelled) return;
        // Fall back to opening balance only — better than blocking the modal.
        // The adjustment math is still correct from the user's perspective:
        // they enter what they want the balance to be.
        setCurrentBalance(account.openingBalance);
      } finally {
        if (!cancelled) setLoadingBalance(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, account]);

  // Locale-aware date string for the default description ("Balance adjustment — {{date}}").
  const formattedDateForDescription = useMemo(() => {
    if (!date) return '';
    return formatDate(date);
  }, [date, formatDate]);

  // Locale-tolerant parsing: accept both "1331.85" (en) and "1331,85" / "1.331,85"
  // (es). The "last separator wins" rule in parseLocaleAmount means ambiguous
  // input like "10.000" resolves to 10 (treats `.000` as decimal); users who
  // mean ten thousand should type "10000" or "10000,00". This trade-off is
  // acceptable here because the modal is amounts-in-euros (whole + cents) and
  // the live "Adjustment" preview makes mistakes immediately visible.
  const targetNumber = useMemo(() => {
    if (target.trim() === '') return null;
    const n = parseAmount(target);
    return Number.isFinite(n) ? n : null;
  }, [target, parseAmount]);

  const delta = useMemo(() => {
    if (currentBalance === null || targetNumber === null) return null;
    // Round to cents — input precision should never push us past EUR cents.
    return Math.round((targetNumber - currentBalance) * 100) / 100;
  }, [currentBalance, targetNumber]);

  const isNoChange = delta !== null && Math.abs(delta) < DELTA_EPSILON;
  const accountName = account?.name ?? '';
  const effectiveDescription =
    description.trim() !== ''
      ? description.trim()
      : t('configuracion.cuentas.adjustBalance.modal.descriptionDefault', {
          date: formattedDateForDescription,
        });

  const canSubmit =
    !submitting &&
    !loadingBalance &&
    account !== null &&
    targetNumber !== null &&
    delta !== null &&
    !isNoChange &&
    date.trim() !== '';

  const handleSubmit = useCallback(async () => {
    if (!account || delta === null || isNoChange) return;
    setGeneralError(null);
    setSubmitting(true);
    try {
      const resp = await createTransaction({
        accountId: account.id,
        date,
        type: delta > 0 ? 'income' : 'expense',
        amount: Math.abs(delta),
        currency: 'EUR',
        description: effectiveDescription,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        reference: null,
        details: ADJUSTMENT_DETAILS_MARKER,
      });
      if (!resp.ok) {
        setGeneralError(
          resp.error.message || t('configuracion.cuentas.adjustBalance.modal.errorGeneric'),
        );
        return;
      }
      onSaved();
      onClose();
    } catch (err) {
      setGeneralError(
        err instanceof Error && err.message
          ? err.message
          : t('configuracion.cuentas.adjustBalance.modal.errorGeneric'),
      );
    } finally {
      setSubmitting(false);
    }
  }, [account, delta, isNoChange, date, effectiveDescription, onSaved, onClose, t]);

  const deltaColor =
    delta === null || isNoChange
      ? 'var(--color-text-muted)'
      : delta > 0
        ? 'var(--color-status-success)'
        : 'var(--color-status-error)';

  return (
    <ConfigModalShell
      isOpen={isOpen}
      titleKey="configuracion.cuentas.adjustBalance.modal.title"
      titleValues={{ accountName }}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitting={submitting}
      submitDisabled={!canSubmit}
      generalError={generalError}
      submitLabelKey="configuracion.cuentas.adjustBalance.modal.save"
      submittingLabelKey="common.saving"
    >
      <div className="ot-config-modal__field">
        <span className="ot-config-modal__label">
          {t('configuracion.cuentas.adjustBalance.modal.currentBalance')}
        </span>
        <div
          className="ot-config-modal__preview-box"
          aria-live="polite"
          style={{
            fontWeight: 'var(--font-weight-medium)',
            color:
              currentBalance === null
                ? 'var(--color-text-muted)'
                : currentBalance >= 0
                  ? 'var(--color-status-success)'
                  : 'var(--color-status-error)',
          }}
        >
          {currentBalance === null ? '…' : formatCurrency(currentBalance, 'EUR')}
        </div>
      </div>

      <div className="ot-config-modal__field">
        <label htmlFor="bal-adj-target" className="ot-config-modal__label">
          {t('configuracion.cuentas.adjustBalance.modal.targetBalance')}
        </label>
        <input
          id="bal-adj-target"
          className="ot-config-modal__input"
          // `type="text"` (not `number`) so the field accepts both `.` and `,`
          // as decimal separators in any locale — HTML number inputs reject
          // comma-decimal entirely in en-US-configured browsers, which breaks
          // Spanish users who naturally type "1331,85".
          type="text"
          inputMode="decimal"
          value={target}
          placeholder={`0${decimalSep}00`}
          onChange={(e) => {
            if (isValidAmountInput(e.target.value)) {
              setTarget(e.target.value);
            }
          }}
          autoFocus
        />
      </div>

      <div className="ot-config-modal__field">
        <span className="ot-config-modal__label">
          {t('configuracion.cuentas.adjustBalance.modal.delta')}
        </span>
        <div
          className="ot-config-modal__preview-box"
          aria-live="polite"
          style={{ fontWeight: 'var(--font-weight-medium)', color: deltaColor }}
        >
          {delta === null
            ? '—'
            : isNoChange
              ? t('configuracion.cuentas.adjustBalance.modal.noChange')
              : `${delta > 0 ? '+' : '−'}${formatCurrency(Math.abs(delta), 'EUR')}`}
        </div>
      </div>

      <div className="ot-config-modal__row">
        <div className="ot-config-modal__field">
          <label htmlFor="bal-adj-date" className="ot-config-modal__label">
            {t('configuracion.cuentas.adjustBalance.modal.date')}
          </label>
          <DateInput
            id="bal-adj-date"
            className="ot-config-modal__input"
            value={date}
            onChange={setDate}
          />
        </div>
        <div className="ot-config-modal__field">
          <label htmlFor="bal-adj-desc" className="ot-config-modal__label">
            {t('configuracion.cuentas.adjustBalance.modal.description')}
          </label>
          <input
            id="bal-adj-desc"
            className="ot-config-modal__input"
            type="text"
            value={
              descriptionTouched
                ? description
                : t('configuracion.cuentas.adjustBalance.modal.descriptionDefault', {
                    date: formattedDateForDescription,
                  })
            }
            maxLength={500}
            onChange={(e) => {
              setDescriptionTouched(true);
              setDescription(e.target.value);
            }}
            onFocus={() => {
              if (!descriptionTouched) {
                // Promote the placeholder default into the editable value on
                // first focus so the user can refine without re-typing it.
                setDescription(
                  t('configuracion.cuentas.adjustBalance.modal.descriptionDefault', {
                    date: formattedDateForDescription,
                  }),
                );
                setDescriptionTouched(true);
              }
            }}
          />
        </div>
      </div>
    </ConfigModalShell>
  );
}
