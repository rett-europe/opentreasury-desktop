import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { Button } from '../Button/index.js';
import './ConfigModal.css';

export type ArchiveEntity = 'cuentas' | 'categorias' | 'etiquetas' | 'subcategorias';

export interface ArchiveConfirmModalProps {
  readonly isOpen: boolean;
  readonly entity: ArchiveEntity;
  readonly name: string;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
}

/**
 * Shared archive-confirm dialog for WI-21. Uses Niobe's `configuracion.*`
 * keys and the Archive variant per Switch's ruling (archive-only, no hard
 * delete). Usage count renders `—` — we don't block on usage in M1.
 */
export function ArchiveConfirmModal({
  isOpen,
  entity,
  name,
  onClose,
  onConfirm,
}: ArchiveConfirmModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
    if (isOpen) {
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      onClose();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog) onClose();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onClose]);

  const handleConfirm = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('configuracion.delete.error.generic'));
    } finally {
      setSubmitting(false);
    }
  }, [onConfirm, onClose, t]);

  return (
    <dialog
      ref={dialogRef}
      className="ot-config-modal"
      aria-labelledby="ot-archive-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-config-modal__content">
        <header className="ot-config-modal__header">
          <h2 id="ot-archive-modal-title" className="ot-config-modal__title">
            {t(`configuracion.${entity}.deleteConfirm.archiveTitle`)}
          </h2>
          <button
            type="button"
            className="ot-config-modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="ot-config-modal__form">
          {error ? (
            <div className="ot-config-modal__error" role="alert">
              {error}
            </div>
          ) : null}

          <p style={{ margin: 0, fontWeight: 'var(--font-weight-medium)' }}>
            {t(`configuracion.${entity}.deleteConfirm.confirmArchive`, { name })}
          </p>

          <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
            {t(`configuracion.${entity}.deleteConfirm.bodyArchive`)}
          </p>

          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            {t('configuracion.delete.usage.unknown')}
          </p>

          <p style={{ margin: 0, color: 'var(--color-text-muted)' }}>
            {t('configuracion.delete.warning.archive')}
          </p>

          <footer className="ot-config-modal__footer">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              {t('configuracion.delete.buttons.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => void handleConfirm()}
              disabled={submitting}
            >
              {submitting
                ? t('configuracion.delete.buttons.archiving')
                : t('configuracion.delete.buttons.archive')}
            </Button>
          </footer>
        </div>
      </div>
    </dialog>
  );
}
