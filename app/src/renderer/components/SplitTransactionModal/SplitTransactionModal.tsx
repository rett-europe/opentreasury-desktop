import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import { formatDate } from '../../utils/dateFormat.js';
import {
  parseLocaleAmount,
  isValidAmountInput,
  decimalSeparatorForLocale,
} from '../../utils/numberFormat.js';
import { newUlid } from '../../utils/ulid.js';
import { createSplit, removeSplit, getSplits } from '../../services/splitsApi.js';
import { useCloseDialogOnUnmount } from '../../hooks/useCloseDialogOnUnmount.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { CategoryRecord } from '../../types/config.js';
import {
  MAX_SPLITS_PER_TX,
  SPLIT_COMMENT_MAX,
} from '../../../shared/ipc-contracts/transaction-splits.js';
import './SplitTransactionModal.css';

export interface SplitTransactionModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly transaction: MovementRecord | null;
  readonly categories?: readonly CategoryRecord[];
  readonly onSplitSaved: () => void;
}

interface SplitRow {
  id: string;
  amountEur: string;
  categoryId: string;
  subcategoryId: string;
  comment: string;
}

export function SplitTransactionModal({
  isOpen,
  onClose,
  transaction,
  categories = [],
  onSplitSaved,
}: SplitTransactionModalProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';
  // Decimal separator for the active locale — drives the per-row input sanitizer.
  const decimalSep = decimalSeparatorForLocale(i18n.language);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [initialSplits, setInitialSplits] = useState<SplitRow[]>([]);

  const isEditMode = transaction?.hasSplits ?? false;

  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: 'always',
  } as unknown as Intl.NumberFormatOptions);

  useEffect(() => {
    if (!isOpen || !transaction) return;

    const loadSplits = async (): Promise<void> => {
      if (transaction.hasSplits) {
        const result = await getSplits({ parentTxId: transaction.id });
        if (result.ok) {
          const rows: SplitRow[] = result.splits.map((s) => ({
            id: s.splitId,
            amountEur: (s.amountCents / 100).toFixed(2),
            categoryId: s.categoryId ?? '',
            subcategoryId: s.subcategoryId ?? '',
            comment: s.comment ?? '',
          }));
          setSplits(rows);
          setInitialSplits(JSON.parse(JSON.stringify(rows)));
        } else {
          setGeneralError(
            t(`split.errors.${result.error.code}`, { defaultValue: result.error.message }),
          );
        }
      } else {
        const empty: SplitRow[] = [
          { id: newUlid(), amountEur: '', categoryId: '', subcategoryId: '', comment: '' },
          { id: newUlid(), amountEur: '', categoryId: '', subcategoryId: '', comment: '' },
        ];
        setSplits(empty);
        setInitialSplits(JSON.parse(JSON.stringify(empty)));
      }
      setHasChanges(false);
      setGeneralError(null);
    };

    loadSplits().catch((err) => {
      console.error('Failed to load splits:', err);
      setGeneralError(t('splits.modal.saveError', { reason: 'INTERNAL' }));
    });
  }, [isOpen, transaction, t]);

  useEffect(() => {
    if (splits.length === 0) return;
    const changed = JSON.stringify(splits) !== JSON.stringify(initialSplits);
    setHasChanges(changed);
  }, [splits, initialSplits]);

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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      handleCancelClick();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog) {
        handleCancelClick();
      }
    };
    // SPEC-023 UX-007 §7 — Ctrl+Enter (or Cmd+Enter on Mac) saves the modal.
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSubmit && !isSubmitting) {
        e.preventDefault();
        handleSave().catch((err) => console.error('Save failed:', err));
      }
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    dialog.addEventListener('keydown', handleKeyDown);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
      dialog.removeEventListener('keydown', handleKeyDown);
    };
  });

  const handleCancelClick = (): void => {
    if (hasChanges) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleAddPart = (): void => {
    if (splits.length >= MAX_SPLITS_PER_TX) return;
    setSplits([
      ...splits,
      { id: newUlid(), amountEur: '', categoryId: '', subcategoryId: '', comment: '' },
    ]);
  };

  const handleRemovePart = (id: string): void => {
    if (splits.length <= 2) return;
    setSplits(splits.filter((s) => s.id !== id));
  };

  const handleAmountChange = (id: string, value: string): void => {
    // Reject garbage keystrokes at the input boundary so the field can't fill
    // up with invalid characters. parseLocaleAmount would still return NaN
    // for them, but the UX of allowing typed garbage is unacceptable.
    if (!isValidAmountInput(value, decimalSep)) return;
    setSplits(splits.map((s) => (s.id === id ? { ...s, amountEur: value } : s)));
  };

  const handleCategoryChange = (id: string, categoryId: string): void => {
    setSplits(splits.map((s) => (s.id === id ? { ...s, categoryId, subcategoryId: '' } : s)));
  };

  const handleSubcategoryChange = (id: string, subcategoryId: string): void => {
    setSplits(splits.map((s) => (s.id === id ? { ...s, subcategoryId } : s)));
  };

  const handleCommentChange = (id: string, comment: string): void => {
    setSplits(splits.map((s) => (s.id === id ? { ...s, comment } : s)));
  };

  const calculateTotals = (): { distributedCents: number; remainingCents: number } => {
    if (!transaction) return { distributedCents: 0, remainingCents: 0 };
    const parentCents = Math.round(transaction.amount * 100);
    const distributedCents = splits.reduce((sum, s) => {
      const parsed = parseLocaleAmount(s.amountEur);
      return sum + (isNaN(parsed) ? 0 : Math.round(parsed * 100));
    }, 0);
    return { distributedCents, remainingCents: parentCents - distributedCents };
  };

  const { distributedCents, remainingCents } = calculateTotals();
  const isBalanced = remainingCents === 0;
  const allAmountsValid = splits.every((s) => {
    const parsed = parseLocaleAmount(s.amountEur);
    return !isNaN(parsed) && parsed > 0;
  });
  const canSubmit = isBalanced && allAmountsValid && splits.length >= 2;

  // SPEC-023 AC11 — Helper to check if a specific split row has an invalid amount.
  const isRowAmountInvalid = (split: SplitRow): boolean => {
    const parsed = parseLocaleAmount(split.amountEur);
    return isNaN(parsed) || parsed <= 0;
  };

  const handleSave = async (): Promise<void> => {
    if (!transaction || !canSubmit) return;
    setIsSubmitting(true);
    setGeneralError(null);

    try {
      const splitsPayload = splits.map((s) => ({
        amountCents: Math.round(parseLocaleAmount(s.amountEur) * 100),
        categoryId: s.categoryId || null,
        subcategoryId: s.subcategoryId || null,
        comment: s.comment.trim() || null,
      }));

      const result = await createSplit({
        parentTxId: transaction.id,
        splits: splitsPayload,
      });

      if (result.ok) {
        onSplitSaved();
        onClose();
      } else {
        setGeneralError(
          t(`split.errors.${result.error.code}`, { defaultValue: result.error.message }),
        );
      }
    } catch (err) {
      console.error('Failed to save split:', err);
      setGeneralError(t('splits.modal.saveError', { reason: 'INTERNAL' }));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveSplit = (): void => {
    setShowRemoveConfirm(true);
  };

  const handleRemoveConfirm = async (): Promise<void> => {
    if (!transaction) return;
    setShowRemoveConfirm(false);
    setIsRemoving(true);
    setGeneralError(null);

    try {
      const result = await removeSplit({ parentTxId: transaction.id });
      if (result.ok) {
        onSplitSaved();
        onClose();
      } else {
        setGeneralError(
          t(`split.errors.${result.error.code}`, { defaultValue: result.error.message }),
        );
      }
    } catch (err) {
      console.error('Failed to remove split:', err);
      setGeneralError(t('splits.modal.removeError'));
    } finally {
      setIsRemoving(false);
    }
  };

  if (!transaction) return <></>;

  const subcategoriesForRow = (categoryId: string): readonly { id: string; name: string }[] => {
    if (!categoryId) return [];
    const cat = categories.find((c) => c.id === categoryId);
    return cat?.subcategories ?? [];
  };

  const distributedEur = distributedCents / 100;
  const remainingEur = remainingCents / 100;
  const totalEur = transaction.amount;

  const deltaState: 'balanced' | 'over' | 'under' = isBalanced
    ? 'balanced'
    : remainingEur < 0
      ? 'over'
      : 'under';

  const deltaLabelKey =
    deltaState === 'balanced'
      ? 'splits.modal.summaryBalanced'
      : deltaState === 'over'
        ? 'splits.modal.summaryOver'
        : 'splits.modal.summaryRemaining';

  return (
    <dialog ref={dialogRef} className="ot-split-modal" aria-labelledby="split-modal-title">
      <div className="ot-split-modal__content">
        <header className="ot-split-modal__header">
          <div className="ot-split-modal__header-text">
            <h2 id="split-modal-title" className="ot-split-modal__title">
              {isEditMode ? t('splits.modal.editTitle') : t('splits.modal.title')}
            </h2>
            <p className="ot-split-modal__subtitle">
              <span className="ot-split-modal__subtitle-date">
                {formatDate(transaction.date, locale)}
              </span>
              <span className="ot-split-modal__subtitle-sep" aria-hidden="true">
                ·
              </span>
              <span className="ot-split-modal__subtitle-desc">{transaction.description}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancelClick}
            className="ot-split-modal__close"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </header>

        <section
          className={`ot-split-summary ot-split-summary--${deltaState}`}
          role="status"
          aria-live="polite"
        >
          <div className="ot-split-summary__cell">
            <span className="ot-split-summary__label">{t('splits.modal.summaryOriginal')}</span>
            <span className="ot-split-summary__value">{formatter.format(totalEur)}</span>
          </div>
          <div className="ot-split-summary__cell">
            <span className="ot-split-summary__label">{t('splits.modal.summaryDistributed')}</span>
            <span className="ot-split-summary__value">{formatter.format(distributedEur)}</span>
          </div>
          <div className="ot-split-summary__cell ot-split-summary__cell--delta">
            <span className="ot-split-summary__label">{t(deltaLabelKey)}</span>
            <span className="ot-split-summary__value ot-split-summary__value--delta">
              {deltaState === 'balanced'
                ? formatter.format(0)
                : formatter.format(Math.abs(remainingEur))}
            </span>
          </div>
        </section>

        {generalError && (
          <div className="ot-split-modal__error" role="alert">
            {generalError}
          </div>
        )}

        <div className="ot-split-modal__parts" role="group" aria-label={t('splits.modal.title')}>
          <div className="ot-split-modal__parts-head" aria-hidden="true">
            <span className="ot-split-modal__parts-head-cell ot-split-modal__parts-head-cell--index">
              #
            </span>
            <span className="ot-split-modal__parts-head-cell ot-split-modal__parts-head-cell--amount">
              {t('splits.modal.colAmount')}
            </span>
            <span className="ot-split-modal__parts-head-cell">{t('splits.modal.colCategory')}</span>
            <span className="ot-split-modal__parts-head-cell">
              {t('splits.modal.colSubcategory')}
            </span>
            <span className="ot-split-modal__parts-head-cell ot-split-modal__parts-head-cell--remove" />
          </div>

          <ul className="ot-split-modal__parts-list">
            {splits.map((split, index) => {
              const rowHasError = !isBalanced && isRowAmountInvalid(split);
              return (
                <li
                  key={split.id}
                  className={`ot-split-row ${rowHasError ? 'ot-split-row--error' : ''}`}
                  aria-invalid={rowHasError}
                  aria-describedby={rowHasError ? 'split-sum-warning' : undefined}
                >
                  <span className="ot-split-row__index" aria-hidden="true">
                    {index + 1}
                  </span>
                  <div className="ot-split-row__amount">
                    <label className="ot-sr-only" htmlFor={`split-amount-${split.id}`}>
                      {t('splits.modal.colAmount')}
                    </label>
                    <input
                      id={`split-amount-${split.id}`}
                      type="text"
                      inputMode="decimal"
                      value={split.amountEur}
                      onChange={(e) => handleAmountChange(split.id, e.target.value)}
                      placeholder="0,00"
                      className="ot-split-row__amount-input"
                      aria-invalid={rowHasError}
                    />
                  </div>
                  <div className="ot-split-row__category">
                    <label className="ot-sr-only" htmlFor={`split-category-${split.id}`}>
                      {t('splits.modal.colCategory')}
                    </label>
                    <select
                      id={`split-category-${split.id}`}
                      value={split.categoryId}
                      onChange={(e) => handleCategoryChange(split.id, e.target.value)}
                      className="ot-split-row__select"
                    >
                      <option value="">— {t('configuracion.categorias.none')} —</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="ot-split-row__subcategory">
                    <label className="ot-sr-only" htmlFor={`split-subcategory-${split.id}`}>
                      {t('splits.modal.colSubcategory')}
                    </label>
                    <select
                      id={`split-subcategory-${split.id}`}
                      value={split.subcategoryId}
                      onChange={(e) => handleSubcategoryChange(split.id, e.target.value)}
                      disabled={!split.categoryId}
                      className="ot-split-row__select"
                    >
                      <option value="">— {t('configuracion.categorias.none')} —</option>
                      {subcategoriesForRow(split.categoryId).map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemovePart(split.id)}
                    disabled={splits.length <= 2}
                    className="ot-split-row__remove"
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                  >
                    <X size={16} />
                  </button>
                  <div className="ot-split-row__comment">
                    <label className="ot-sr-only" htmlFor={`split-comment-${split.id}`}>
                      {t('splits.modal.colComment')}
                    </label>
                    <input
                      id={`split-comment-${split.id}`}
                      type="text"
                      value={split.comment}
                      onChange={(e) => handleCommentChange(split.id, e.target.value)}
                      maxLength={SPLIT_COMMENT_MAX}
                      placeholder={t('splits.modal.colComment')}
                      className="ot-split-row__comment-input"
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={handleAddPart}
            disabled={splits.length >= MAX_SPLITS_PER_TX}
            className="ot-split-modal__add-part"
            title={
              splits.length >= MAX_SPLITS_PER_TX ? t('splits.modal.maxPartsWarning') : undefined
            }
          >
            {t('splits.modal.addPart')}
          </button>
        </div>

        {(!isBalanced || splits.length < 2) && (
          <div className="ot-split-modal__warnings" aria-live="polite">
            {!isBalanced && (
              <p className="ot-split-modal__warning" id="split-sum-warning">
                {t('splits.modal.sumWarning', { amount: formatter.format(totalEur) })}
              </p>
            )}
            {splits.length < 2 && (
              <p className="ot-split-modal__warning">{t('splits.modal.minPartsWarning')}</p>
            )}
          </div>
        )}
      </div>

      <footer className="ot-split-modal__footer">
        <div className="ot-split-modal__footer-left">
          {isEditMode && (
            <Button
              variant="destructive"
              onClick={handleRemoveSplit}
              disabled={isRemoving || isSubmitting}
            >
              {isRemoving ? t('common.saving') : t('splits.modal.remove')}
            </Button>
          )}
        </div>
        <div className="ot-split-modal__footer-right">
          <Button
            variant="secondary"
            onClick={handleCancelClick}
            disabled={isSubmitting || isRemoving}
          >
            {t('splits.modal.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!canSubmit || isSubmitting || isRemoving}
          >
            {isSubmitting ? t('splits.modal.saving') : t('splits.modal.save')}
          </Button>
          <span
            className="ot-split-modal__save-hint"
            aria-hidden="true"
            title={t('splits.modal.saveHint')}
          >
            {t('splits.modal.saveHint')}
          </span>
        </div>
      </footer>

      {showDiscardConfirm && (
        <div className="ot-split-modal__confirm-overlay">
          <div className="ot-split-modal__confirm" role="dialog" aria-labelledby="discard-title">
            <h3 id="discard-title">{t('splits.modal.discardTitle')}</h3>
            <p>{t('splits.modal.discardBody')}</p>
            <div className="ot-split-modal__confirm-actions">
              <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>
                {t('splits.modal.discardCancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
              >
                {t('splits.modal.discardConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRemoveConfirm && (
        <div className="ot-split-modal__confirm-overlay">
          <div className="ot-split-modal__confirm" role="dialog" aria-labelledby="remove-title">
            <h3 id="remove-title">{t('splits.modal.removeTitle')}</h3>
            <p>{t('splits.modal.removeBody', { amount: formatter.format(totalEur) })}</p>
            <div className="ot-split-modal__confirm-actions">
              <Button variant="secondary" onClick={() => setShowRemoveConfirm(false)}>
                {t('splits.modal.removeCancel')}
              </Button>
              <Button variant="destructive" onClick={handleRemoveConfirm}>
                {t('splits.modal.removeConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
