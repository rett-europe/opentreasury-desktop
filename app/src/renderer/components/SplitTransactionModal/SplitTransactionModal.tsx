import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import { formatDate } from '../../utils/dateFormat.js';
import { parseLocaleAmount } from '../../utils/numberFormat.js';
import { newUlid } from '../../utils/ulid.js';
import { createSplit, removeSplit, getSplits } from '../../services/splitsApi.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { CategoryRecord } from '../../types/config.js';
import {
  MAX_SPLITS_PER_TX,
  SPLIT_COMMENT_MAX,
} from '../../../shared/ipc-contracts/transaction-splits.js';

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
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
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

  return (
    <dialog ref={dialogRef} className="ot-split-modal" aria-labelledby="split-modal-title">
      <div className="ot-split-modal__header">
        <h2 id="split-modal-title">
          {isEditMode ? t('splits.modal.editTitle') : t('splits.modal.title')}
        </h2>
        <button
          type="button"
          onClick={handleCancelClick}
          className="ot-split-modal__close"
          aria-label={t('common.close')}
        >
          <X size={20} />
        </button>
      </div>

      <div className="ot-split-modal__body">
        <div className="ot-split-modal__original">
          <strong>{t('splits.modal.originalLabel')}:</strong> {formatDate(transaction.date, locale)}{' '}
          · {transaction.description} · {formatter.format(totalEur)}
        </div>

        {generalError && (
          <div className="ot-split-modal__error" role="alert">
            {generalError}
          </div>
        )}

        <div className="ot-split-modal__table">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('splits.modal.colAmount')}</th>
                <th>{t('splits.modal.colCategory')}</th>
                <th>{t('splits.modal.colSubcategory')}</th>
                <th>{t('splits.modal.colComment')}</th>
                <th aria-label={t('common.delete')}></th>
              </tr>
            </thead>
            <tbody>
              {splits.map((split, index) => (
                <tr key={split.id} className="ot-split-row">
                  <td className="ot-split-row__index">{index + 1}</td>
                  <td className="ot-split-row__amount">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={split.amountEur}
                      onChange={(e) => handleAmountChange(split.id, e.target.value)}
                      placeholder="0,00"
                      className="ot-split-row__amount-input"
                    />
                  </td>
                  <td className="ot-split-row__category">
                    <select
                      value={split.categoryId}
                      onChange={(e) => handleCategoryChange(split.id, e.target.value)}
                      className="ot-split-row__category-select"
                    >
                      <option value="">— {t('configuracion.categorias.none')} —</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ot-split-row__subcategory">
                    <select
                      value={split.subcategoryId}
                      onChange={(e) => handleSubcategoryChange(split.id, e.target.value)}
                      disabled={!split.categoryId}
                      className="ot-split-row__subcategory-select"
                    >
                      <option value="">— {t('configuracion.categorias.none')} —</option>
                      {subcategoriesForRow(split.categoryId).map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="ot-split-row__comment">
                    <input
                      type="text"
                      value={split.comment}
                      onChange={(e) => handleCommentChange(split.id, e.target.value)}
                      maxLength={SPLIT_COMMENT_MAX}
                      placeholder="…"
                      className="ot-split-row__comment-input"
                    />
                  </td>
                  <td className="ot-split-row__actions">
                    <button
                      type="button"
                      onClick={() => handleRemovePart(split.id)}
                      disabled={splits.length <= 2}
                      className="ot-split-row__remove"
                      aria-label={t('common.delete')}
                    >
                      <X size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

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

        <div
          className={`ot-split-delta ${isBalanced ? 'ot-split-delta--balanced' : remainingEur > 0 ? 'ot-split-delta--positive' : 'ot-split-delta--negative'}`}
          role="status"
          aria-live="polite"
        >
          <div>
            {t('splits.modal.distributed', {
              distributed: formatter.format(distributedEur),
              total: formatter.format(totalEur),
            })}
          </div>
          <div>
            {t('splits.modal.remaining', { amount: formatter.format(Math.abs(remainingEur)) })}
          </div>
          {!isBalanced && (
            <div className="ot-split-delta__warning">
              ⚠ {t('splits.modal.sumWarning', { amount: formatter.format(totalEur) })}
            </div>
          )}
          {splits.length < 2 && (
            <div className="ot-split-delta__warning">⚠ {t('splits.modal.minPartsWarning')}</div>
          )}
        </div>
      </div>

      <div className="ot-split-modal__footer">
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
        </div>
      </div>

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
