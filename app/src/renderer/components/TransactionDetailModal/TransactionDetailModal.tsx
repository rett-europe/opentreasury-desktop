import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Edit, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../Button/index.js';
import { NotesThread } from '../NotesThread/index.js';
import { TransactionFormFields } from '../TransactionFormFields/index.js';
import { formatDate } from '../../utils/dateFormat.js';
import type { Account, RecentTransaction } from '../../../shared/ipc-contracts/panel.js';
import type { MovementRecord } from '../../../shared/ipc-contracts/movements.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import type { UpdateTransactionRequest } from '../../../shared/ipc-contracts/transaction.js';
import { useCloseDialogOnUnmount } from '../../hooks/useCloseDialogOnUnmount.js';
import { ConfirmDialog } from '../ConfirmDialog/index.js';
import { getSplits } from '../../services/splitsApi.js';
import { getTagColor } from '../../utils/tagColor.js';
import { getStatusBadgeClass } from '../../utils/statusBadge.js';
import './TransactionDetailModal.css';

// SPEC-023 — local type for split child (mirrors core/query/types.TransactionSplit
// but defined here to avoid renderer→core import violation per ADR-002 §4.1).
interface SplitChild {
  readonly splitId: string;
  readonly amountCents: number;
  readonly categoryId: string | null;
  readonly subcategoryId: string | null;
  readonly comment: string | null;
}

export interface TransactionDetailModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly transaction: RecentTransaction | null;
  readonly rawRecord?: MovementRecord | null;
  readonly accounts?: readonly Account[];
  readonly categories?: readonly CategoryRecord[];
  readonly tags?: readonly TagRecord[];
  readonly categoryLabel?: string | null;
  readonly subcategoryLabel?: string | null;
  readonly tagLabels?: readonly string[];
  readonly onUpdate: (input: UpdateTransactionRequest) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
  readonly onOpenSplit?: () => void;
  readonly transactionIds?: readonly string[];
  readonly currentIndex?: number;
  readonly onNavigate?: (direction: 'prev' | 'next') => void;
}

interface FormErrors {
  date?: string;
  type?: string;
  amount?: string;
  description?: string;
  accountId?: string;
  reference?: string;
  details?: string;
  [key: string]: string | undefined;
}

/**
 * Transaction Detail modal — WI-19 + WI-20 (edit/delete).
 *
 * In-place swap pattern (Option A, Pedro-approved):
 * - Read-only view: displays transaction fields + notes thread, footer has "Editar" button
 * - Edit mode: SAME dialog swaps body to editable form (using TransactionFormFields),
 *   footer swaps to "Cancelar / Guardar". Notes thread collapses in edit mode.
 * - Delete button (trash icon) hidden during edit mode to avoid confusion.
 *
 * Width: 640px for read-only, widens to 720px in edit mode for better form breathing room.
 */
export function TransactionDetailModal({
  isOpen,
  onClose,
  transaction,
  rawRecord,
  accounts = [],
  categories = [],
  tags = [],
  categoryLabel,
  subcategoryLabel,
  tagLabels,
  onUpdate,
  onDelete,
  onOpenSplit,
  transactionIds,
  currentIndex,
  onNavigate,
}: TransactionDetailModalProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Edit mode state — true when user clicked "Editar", false when viewing/after cancel
  const [isEditMode, setIsEditMode] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state (only used in edit mode)
  const [date, setDate] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'pending' | 'approved'>('approved');
  const [reference, setReference] = useState('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // SPEC-023 — split children state for read-only view
  const [splitsExpanded, setSplitsExpanded] = useState(false);
  const [splitChildren, setSplitChildren] = useState<readonly SplitChild[]>([]);

  // State-driven confirmations — `window.confirm()` corrupts Electron's
  // keyboard-input routing when called from inside an open <dialog>,
  // freezing every input in the app until window blur+focus. Replaced
  // with ConfirmDialog. See that component's header for the full story.
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  // For the "discard unsaved changes" prompt fired during prev/next nav,
  // capture the pending direction so onConfirm knows where to go next.
  const [pendingNavDirection, setPendingNavDirection] = useState<'prev' | 'next' | null>(null);

  // Populate form when entering edit mode
  useEffect(() => {
    if (isEditMode && transaction) {
      setDate(transaction.date);
      setType(transaction.type);
      setAmount(transaction.amount.toString());
      setDescription(transaction.description);
      setAccountId(transaction.accountId);
      setCategoryId(transaction.categoryId ?? '');
      setSubcategoryId(transaction.subcategoryId ?? '');
      setTagIds(transaction.tagIds ?? []);
      setStatus(transaction.status);
      setReference(transaction.reference ?? '');
      setDetails(transaction.details ?? '');
      setErrors({});
      setGeneralError(null);
    }
  }, [isEditMode, transaction]);

  // SPEC-023 — Load split children when opening a split parent (read-only mode).
  useEffect(() => {
    if (!transaction || !rawRecord?.hasSplits || isEditMode) {
      setSplitChildren([]);
      return;
    }
    const loadSplitChildren = async (): Promise<void> => {
      try {
        const result = await getSplits({ parentTxId: transaction.id });
        if (result.ok) {
          setSplitChildren(result.splits);
        }
      } catch (err) {
        console.error('Failed to load split children:', err);
      }
    };
    loadSplitChildren().catch(() => {
      // Silent failure — splits UI will remain collapsed if load fails.
    });
  }, [transaction, rawRecord, isEditMode]);

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

  // Belt-and-braces: if React unmounts us while the dialog is still open
  // (e.g. a parent's conditional render flips), force-close so Chromium
  // releases the top-layer and the rest of the page stays interactive.
  // See hooks/useCloseDialogOnUnmount for the full bug story.
  useCloseDialogOnUnmount(dialogRef);

  // Close on Escape + backdrop click
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      // If in edit mode, cancel edit instead of closing modal
      if (isEditMode) {
        setIsEditMode(false);
      } else {
        onClose();
      }
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog) {
        if (isEditMode) {
          setIsEditMode(false);
        } else {
          onClose();
        }
      }
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose, isEditMode]);

  const handleEdit = (): void => {
    setIsEditMode(true);
  };

  const handleCancelEdit = (): void => {
    setIsEditMode(false);
    setErrors({});
    setGeneralError(null);
  };

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
  }, [date, type, amount, description, accountId, reference, details, t]);

  const handleSaveEdit = async (): Promise<void> => {
    if (!transaction) return;
    setGeneralError(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const input: UpdateTransactionRequest = {
        id: transaction.id,
        date,
        type,
        amount: Number(amount),
        description: description.trim(),
        categoryId: categoryId || undefined,
        subcategoryId: subcategoryId || undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
        status,
        reference: reference.trim() || undefined,
        details: details.trim() || undefined,
      };
      await onUpdate(input);
      // Parent will refresh and pass updated transaction — exit edit mode
      setIsEditMode(false);
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : t('movements.form.errors.submitFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (): void => {
    if (!transaction) return;
    setIsDeleteConfirmOpen(true);
  };

  const cancelDeleteConfirm = useCallback(() => {
    setIsDeleteConfirmOpen(false);
  }, []);

  const confirmDelete = useCallback(async (): Promise<void> => {
    if (!transaction) {
      setIsDeleteConfirmOpen(false);
      return;
    }
    setIsDeleteConfirmOpen(false);
    setIsDeleting(true);
    try {
      await onDelete(transaction.id);
      onClose();
    } catch (err) {
      // Error handling — parent will show error
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [transaction, onDelete, onClose]);

  // Navigation handlers — Issue #280
  const hasUnsavedChanges = useCallback((): boolean => {
    if (!isEditMode || !transaction) return false;
    // Check if any field has changed from the original transaction
    return (
      date !== transaction.date ||
      type !== transaction.type ||
      amount !== transaction.amount.toString() ||
      description !== transaction.description ||
      categoryId !== (transaction.categoryId ?? '') ||
      subcategoryId !== (transaction.subcategoryId ?? '') ||
      JSON.stringify(tagIds) !== JSON.stringify(transaction.tagIds ?? []) ||
      status !== transaction.status ||
      reference !== (transaction.reference ?? '') ||
      details !== (transaction.details ?? '')
    );
  }, [
    isEditMode,
    transaction,
    date,
    type,
    amount,
    description,
    categoryId,
    subcategoryId,
    tagIds,
    status,
    reference,
    details,
  ]);

  const handleNavigate = useCallback(
    (direction: 'prev' | 'next'): void => {
      if (!onNavigate) return;

      // If in edit mode with unsaved changes, prompt before navigating.
      // The prompt is a state-driven ConfirmDialog (see top-of-file
      // note re: window.confirm + Electron input freezing). We stash
      // the pending direction so onConfirm can resume the navigation.
      if (hasUnsavedChanges()) {
        setPendingNavDirection(direction);
        return;
      }

      onNavigate(direction);
    },
    [onNavigate, hasUnsavedChanges],
  );

  const cancelDiscardConfirm = useCallback(() => {
    setPendingNavDirection(null);
  }, []);

  const confirmDiscardAndNavigate = useCallback(() => {
    const direction = pendingNavDirection;
    setPendingNavDirection(null);
    if (!direction || !onNavigate) return;
    // Exit edit mode before navigating — the user has agreed to drop
    // their in-flight edits, so the next render should start clean.
    setIsEditMode(false);
    onNavigate(direction);
  }, [pendingNavDirection, onNavigate]);

  // Keyboard navigation — ArrowLeft (prev), ArrowRight (next)
  // Only active when modal is open and focus is NOT in a text input/textarea
  useEffect(() => {
    if (!isOpen || !onNavigate) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Don't trigger navigation if focus is in a text input or textarea
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleNavigate('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNavigate('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onNavigate, handleNavigate]);

  if (!transaction) {
    return (
      <dialog
        ref={dialogRef}
        className="ot-transaction-detail-modal"
        aria-labelledby="ot-transaction-detail-title"
        role="dialog"
        aria-modal="true"
      />
    );
  }

  const account = accounts.find((a) => a.id === transaction.accountId);
  const accountLabel = account?.accountLabel ?? transaction.accountId;
  const accountColor = account?.color ?? 'var(--color-brand-primary)';

  // Resolve FK IDs to display names — never show raw IDs in the UI
  const category = categories.find((c) => c.id === transaction.categoryId);
  const resolvedCategoryLabel = categoryLabel ?? category?.name ?? null;
  const subcategory = categories
    .flatMap((c) => c.subcategories ?? [])
    .find((s) => s?.id === transaction.subcategoryId);
  const resolvedSubcategoryLabel = subcategoryLabel ?? subcategory?.name ?? null;
  // For chip rendering we need (id, name, color) tuples in the
  // transaction's tag order. We resolve from `tags` + `transaction.tagIds`
  // and fall back to `tagLabels` (positional) when no tag record is found.
  const resolvedTagChips: ReadonlyArray<{ id: string; name: string; color: string }> = (
    transaction.tagIds ?? []
  ).map((tid, idx) => {
    const tag = tags.find((t) => t.id === tid);
    const name = tag?.name ?? tagLabels?.[idx] ?? tid;
    return {
      id: tid,
      name,
      color: getTagColor({ color: tag?.color, name }, tid),
    };
  });

  const amountClass = transaction.type === 'income' ? 'ot-amount--income' : 'ot-amount--expense';
  const signed = transaction.type === 'expense' ? -transaction.amount : transaction.amount;
  const formattedAmount = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: transaction.currency,
    signDisplay: 'auto',
    useGrouping: 'always',
  } as unknown as Intl.NumberFormatOptions).format(signed);

  // Modal title changes in edit mode
  const modalTitle = isEditMode ? t('movements.form.editTitle') : t('transactionDetail.title');

  return (
    <>
      <dialog
        ref={dialogRef}
        className={`ot-transaction-detail-modal ${isEditMode ? 'ot-transaction-detail-modal--edit' : ''}`}
        aria-labelledby="ot-transaction-detail-title"
        role="dialog"
        aria-modal="true"
      >
        <div className="ot-transaction-detail-modal__content">
          {/* Header stays visible in both modes */}
          <header className="ot-transaction-detail-modal__header">
            <h1 id="ot-transaction-detail-title" className="ot-transaction-detail-modal__title">
              {modalTitle}
            </h1>
            <div className="ot-transaction-detail-modal__header-actions">
              {/* Navigation buttons — Issue #280 */}
              {onNavigate && transactionIds && currentIndex !== undefined && (
                <>
                  <button
                    type="button"
                    className="ot-transaction-detail-modal__action-btn"
                    onClick={() => handleNavigate('prev')}
                    disabled={currentIndex === 0}
                    aria-label={t('transactionDetail.prevButton')}
                    title={t('transactionDetail.prevButton')}
                  >
                    <ChevronLeft size={18} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="ot-transaction-detail-modal__action-btn"
                    onClick={() => handleNavigate('next')}
                    disabled={currentIndex >= transactionIds.length - 1}
                    aria-label={t('transactionDetail.nextButton')}
                    title={t('transactionDetail.nextButton')}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </button>
                </>
              )}
              {/* Hide delete button during edit mode to avoid confusion */}
              {!isEditMode && (
                <button
                  type="button"
                  className="ot-transaction-detail-modal__action-btn"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  aria-label={t('transactionDetail.deleteButton')}
                  title={t('transactionDetail.deleteButton')}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              )}
              <button
                type="button"
                className="ot-transaction-detail-modal__close"
                onClick={isEditMode ? handleCancelEdit : onClose}
                aria-label={t('common.close')}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* Body: swaps between read-only view and editable form */}
          {isEditMode ? (
            /* EDIT MODE: Same layout as view, only value cells become inputs */
            <div className="ot-transaction-detail-modal__edit-body">
              {/* SPEC-025 §5 — Summary banner only for `approved` (form fields ARE
                 the source of truth in pending mode). */}
              {transaction.status === 'approved' && (
                <div className="ot-transaction-detail-modal__summary">
                  <span className="ot-transaction-detail-modal__date">
                    {formatDate(transaction.date, locale)}
                  </span>
                  <p className="ot-transaction-detail-modal__description">
                    {transaction.description}
                  </p>
                  <span className={`ot-transaction-detail-modal__amount ${amountClass}`}>
                    {formattedAmount}
                  </span>
                </div>
              )}

              {generalError && (
                <div className="ot-transaction-detail-modal__error" role="alert">
                  {generalError}
                </div>
              )}
              {/* SPEC-023 — amount-locked notice (defense-in-depth; UI prevents editing) */}
              {rawRecord?.hasSplits && (
                <div className="ot-transaction-detail-modal__info-notice" role="status">
                  <strong>{t('splits.modal.amountLockedTitle')}</strong>
                  <p>{t('splits.modal.amountLockedBody')}</p>
                </div>
              )}
              <TransactionFormFields
                date={date}
                onDateChange={setDate}
                type={type}
                onTypeChange={setType}
                amount={amount}
                onAmountChange={setAmount}
                description={description}
                onDescriptionChange={setDescription}
                accountId={accountId}
                onAccountIdChange={setAccountId}
                categoryId={categoryId}
                onCategoryIdChange={setCategoryId}
                subcategoryId={subcategoryId}
                onSubcategoryIdChange={setSubcategoryId}
                tagIds={tagIds}
                onTagIdsChange={setTagIds}
                status={status}
                onStatusChange={setStatus}
                reference={reference}
                onReferenceChange={setReference}
                details={details}
                onDetailsChange={setDetails}
                accounts={accounts}
                categories={categories}
                tags={tags}
                errors={errors}
                mode="edit"
                currency={transaction.currency}
                amountDisabled={rawRecord?.hasSplits ?? false}
                originalStatus={transaction.status}
                hasSplits={rawRecord?.hasSplits ?? false}
              />
            </div>
          ) : (
            /* READ-ONLY MODE: Show transaction details + notes thread */
            <>
              <div className="ot-transaction-detail-modal__read-body">
                <div className="ot-transaction-detail-modal__summary">
                  <span className="ot-transaction-detail-modal__date">
                    {formatDate(transaction.date, locale)}
                  </span>
                  <p className="ot-transaction-detail-modal__description">
                    {transaction.description}
                  </p>
                  <span className={`ot-transaction-detail-modal__amount ${amountClass}`}>
                    {formattedAmount}
                  </span>
                </div>

                <section
                  className="ot-transaction-detail-modal__metadata"
                  aria-label={t('transactionDetail.metadata.heading')}
                >
                  <dl className="ot-transaction-detail-modal__grid">
                    <div className="ot-transaction-detail-modal__field">
                      <dt>{t('transactionDetail.fields.account')}</dt>
                      <dd>
                        <span
                          className="ot-account-pill"
                          title={accountLabel}
                          style={{
                            background: `color-mix(in oklch, ${accountColor} 18%, transparent)`,
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          <span
                            className="ot-account-pill__dot"
                            aria-hidden="true"
                            style={{ background: accountColor }}
                          />
                          {accountLabel}
                        </span>
                      </dd>
                    </div>
                    <div className="ot-transaction-detail-modal__field">
                      <dt>{t('transactionDetail.fields.category')}</dt>
                      <dd>
                        {resolvedCategoryLabel ? (
                          resolvedCategoryLabel
                        ) : (
                          <span className="ot-badge ot-badge--uncategorized">
                            {t('movements.uncategorized')}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="ot-transaction-detail-modal__field">
                      <dt>{t('transactionDetail.fields.subcategory')}</dt>
                      <dd>
                        {resolvedSubcategoryLabel ?? (
                          <span className="ot-text-muted">
                            {t('transactionDetail.fields.none')}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="ot-transaction-detail-modal__field">
                      <dt>{t('transactionDetail.fields.tags')}</dt>
                      <dd>
                        {resolvedTagChips.length > 0 ? (
                          <span className="ot-tag-chip-row">
                            {resolvedTagChips.map((chip) => (
                              <span
                                key={chip.id}
                                className="ot-tag-chip"
                                style={{ ['--ot-tag-color' as string]: chip.color }}
                                title={chip.name}
                              >
                                {chip.name}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="ot-text-muted">
                            {t('transactionDetail.fields.none')}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="ot-transaction-detail-modal__field">
                      <dt>{t('transactionDetail.fields.status')}</dt>
                      <dd>
                        <span className={getStatusBadgeClass(transaction.status)}>
                          {t(`movements.status.${transaction.status}`)}
                        </span>
                      </dd>
                    </div>
                    <div className="ot-transaction-detail-modal__field">
                      <dt>{t('transactionDetail.fields.currency')}</dt>
                      <dd>{transaction.currency}</dd>
                    </div>
                  </dl>
                </section>

                {/* Reference + Details are rendered as standalone "extra" sections
                  using the shared ``__longtext`` block (subtle bg pill, padding,
                  rounded corners) so the two free-form fields look visually
                  consistent. Always rendered, even when empty, with the ``—``
                  placeholder. */}
                <section
                  className="ot-transaction-detail-modal__extra"
                  aria-label={t('transactionDetail.fields.reference')}
                >
                  <h2 className="ot-transaction-detail-modal__extra-label">
                    {t('transactionDetail.fields.reference')}
                  </h2>
                  <p className="ot-transaction-detail-modal__longtext">
                    {transaction.reference ?? t('transactionDetail.fields.none')}
                  </p>
                </section>

                <section
                  className="ot-transaction-detail-modal__extra"
                  aria-label={t('transactionDetail.fields.details')}
                >
                  <h2 className="ot-transaction-detail-modal__extra-label">
                    {t('transactionDetail.fields.details')}
                  </h2>
                  <p className="ot-transaction-detail-modal__longtext">
                    {transaction.details ?? t('transactionDetail.fields.none')}
                  </p>
                </section>

                {/* SPEC-023 — split children display (collapsed by default) */}
                {rawRecord?.hasSplits && splitChildren.length > 0 && (
                  <section
                    className="ot-transaction-detail-modal__splits"
                    aria-label={t('splits.detail.childrenHeading', { count: rawRecord.splitCount })}
                  >
                    <button
                      type="button"
                      className="ot-transaction-detail-modal__splits-toggle"
                      onClick={() => setSplitsExpanded((prev) => !prev)}
                      aria-expanded={splitsExpanded}
                    >
                      <span>
                        {t('splits.detail.childrenHeading', { count: rawRecord.splitCount })}
                      </span>
                      {splitsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {splitsExpanded && (
                      <div className="ot-transaction-detail-modal__splits-list">
                        {splitChildren.map((split) => {
                          const cat = categories.find((c) => c.id === split.categoryId);
                          const subcat = categories
                            .flatMap((c) => c.subcategories)
                            .find((s) => s?.id === split.subcategoryId);
                          const amountEur = split.amountCents / 100;
                          const formattedAmt = new Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: 'EUR',
                            useGrouping: 'always',
                          } as unknown as Intl.NumberFormatOptions).format(amountEur);
                          return (
                            <div
                              key={split.splitId}
                              className="ot-transaction-detail-modal__split-row"
                            >
                              <span className="ot-transaction-detail-modal__split-amount">
                                {formattedAmt}
                              </span>
                              <span className="ot-transaction-detail-modal__split-category">
                                {cat?.name ?? t('transactionDetail.fields.none')}
                                {subcat && ` → ${subcat.name}`}
                              </span>
                              {split.comment && (
                                <span className="ot-transaction-detail-modal__split-comment">
                                  {split.comment}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        {onOpenSplit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onOpenSplit}
                            className="ot-transaction-detail-modal__edit-split-btn"
                          >
                            {t('splits.actions.editSplit')}
                          </Button>
                        )}
                      </div>
                    )}
                  </section>
                )}

                <hr className="ot-transaction-detail-modal__divider" />

                <NotesThread txId={transaction.id} />
              </div>
            </>
          )}

          {/* Footer: swaps between "Editar" (read) and "Cancelar / Guardar" (edit) */}
          <footer className="ot-transaction-detail-modal__footer">
            {isEditMode ? (
              /* Edit mode footer: Cancel / Save */
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleCancelEdit}
                  disabled={isSubmitting}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleSaveEdit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? t('common.saving') : t('common.save')}
                </Button>
              </>
            ) : (
              /* Read-only mode footer: Edit button + Close */
              <>
                <div className="ot-transaction-detail-modal__footer-actions">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleEdit}
                    leadingIcon={<Edit size={16} />}
                  >
                    {t('transactionDetail.editButton')}
                  </Button>
                </div>
                <Button type="button" variant="ghost" onClick={onClose}>
                  {t('common.close')}
                </Button>
              </>
            )}
          </footer>
        </div>
      </dialog>

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title={t('transactionDetail.deleteConfirmTitle')}
        message={t('transactionDetail.deleteConfirm')}
        confirmLabel={t('transactionDetail.deleteConfirmCta')}
        variant="destructive"
        onConfirm={() => {
          void confirmDelete();
        }}
        onCancel={cancelDeleteConfirm}
      />

      <ConfirmDialog
        isOpen={pendingNavDirection !== null}
        title={t('transactionDetail.discardChangesConfirmTitle')}
        message={t('transactionDetail.discardChangesConfirm')}
        confirmLabel={t('transactionDetail.discardChangesConfirmCta')}
        variant="destructive"
        onConfirm={confirmDiscardAndNavigate}
        onCancel={cancelDiscardConfirm}
      />
    </>
  );
}
