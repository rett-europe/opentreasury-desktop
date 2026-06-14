import { useCallback, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/index.js';
import { useCloseDialogOnUnmount } from '../../hooks/useCloseDialogOnUnmount.js';
import './ReportConfirmModal.css';

export interface ReportConfirmModalProps {
  readonly isOpen: boolean;
  readonly busy: boolean;
  readonly onCancel: () => void;
  /** Called when the treasurer acknowledges the decrypted-artifact warning. */
  readonly onConfirm: () => void;
}

/**
 * SPEC-030 REP-1.confirming — **lightweight** decrypted-artifact confirmation.
 *
 * Unlike SPEC-027 Export (which gates behind typing `EXPORTAR`/`EXPORT`), the
 * report PDF confirm is a single acknowledgement: the body explains the file is
 * not encrypted and a single primary button proceeds to the OS save dialog.
 * Focus moves to the confirm button on open and Esc/backdrop cancels.
 */
export function ReportConfirmModal({
  isOpen,
  busy,
  onCancel,
  onConfirm,
}: ReportConfirmModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  // <dialog> open/close lifecycle — mirrors ConfirmDialog / ExportConfirmModal.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      // Focus the confirm action once the dialog is shown (focus management).
      requestAnimationFrame(() => confirmRef.current?.focus());
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useCloseDialogOnUnmount(dialogRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      if (!busy) onCancel();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog && !busy) onCancel();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onCancel, busy]);

  const handleConfirm = useCallback(() => {
    if (!busy) onConfirm();
  }, [busy, onConfirm]);

  return (
    <dialog
      ref={dialogRef}
      className="ot-report-confirm"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      role="alertdialog"
      aria-modal="true"
    >
      <div className="ot-report-confirm__content">
        <h2 id={titleId} className="ot-report-confirm__title">
          {t('report.confirm.title')}
        </h2>
        <ul id={bodyId} className="ot-report-confirm__warnings">
          <li>{t('report.confirm.b1')}</li>
          <li>{t('report.confirm.b2')}</li>
          <li>{t('report.confirm.b3')}</li>
        </ul>

        <div className="ot-report-confirm__actions">
          <Button type="button" variant="ghost" size="md" disabled={busy} onClick={onCancel}>
            {t('report.btn.cancel')}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant="primary"
            size="md"
            loading={busy}
            onClick={handleConfirm}
          >
            {t('report.confirm.continue')}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
