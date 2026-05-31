import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button/index.js';
import { useCloseDialogOnUnmount } from '../../hooks/useCloseDialogOnUnmount.js';
import type { ExportLocaleCode } from '../../../shared/ipc-contracts/export.js';
import { CONFIRM_WORD, MISTYPE_LOCKOUT_MS, MISTYPE_LOCKOUT_THRESHOLD } from './constants.js';
import './ExportConfirmModal.css';

export interface ExportConfirmModalProps {
  readonly isOpen: boolean;
  readonly locale: ExportLocaleCode;
  readonly onCancel: () => void;
  /** Called only after the user types the exact confirmation word. */
  readonly onConfirm: () => void;
}

/**
 * SPEC-027 EXP-2 — typed-confirmation modal.
 *
 * The treasurer must type the locale-specific word (`EXPORTAR` / `EXPORT`) to
 * proceed. The typed value is validated entirely in the renderer and is never
 * logged or sent over IPC. Repeated mistypes trigger a local cooldown
 * (gate condition 4): after {@link MISTYPE_LOCKOUT_THRESHOLD} consecutive
 * wrong submissions the Continue action is disabled for
 * {@link MISTYPE_LOCKOUT_MS}.
 */
export function ExportConfirmModal({
  isOpen,
  locale,
  onCancel,
  onConfirm,
}: ExportConfirmModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const inputId = useId();

  const [typed, setTyped] = useState('');
  const [mistypes, setMistypes] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const word = CONFIRM_WORD[locale];
  const lockedOut = lockoutUntil !== null && now < lockoutUntil;
  const remainingMs = lockedOut ? lockoutUntil - now : 0;

  // Tick a clock while locked out so the disabled state lifts on its own.
  useEffect(() => {
    if (!lockedOut) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockedOut]);

  // Reset transient state each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setTyped('');
      setNow(Date.now());
      // Focus the gate field once the dialog is shown.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // <dialog> open/close lifecycle — mirrors ConfirmDialog.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useCloseDialogOnUnmount(dialogRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
      onCancel();
    };
    const handleClick = (e: MouseEvent): void => {
      if (e.target === dialog) onCancel();
    };
    dialog.addEventListener('cancel', handleCancel);
    dialog.addEventListener('click', handleClick);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
      dialog.removeEventListener('click', handleClick);
    };
  }, [onCancel]);

  const submit = useCallback(() => {
    if (lockedOut) return;
    if (typed === word) {
      setMistypes(0);
      setLockoutUntil(null);
      onConfirm();
      return;
    }
    // Mistype — count it; never log the typed value.
    const next = mistypes + 1;
    setMistypes(next);
    setTyped('');
    if (next >= MISTYPE_LOCKOUT_THRESHOLD) {
      setLockoutUntil(Date.now() + MISTYPE_LOCKOUT_MS);
      setMistypes(0);
    }
  }, [lockedOut, typed, word, mistypes, onConfirm]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      submit();
    },
    [submit],
  );

  const remainingMinutes = Math.ceil(remainingMs / 60000);

  return (
    <dialog
      ref={dialogRef}
      className="ot-export-confirm"
      aria-labelledby={titleId}
      role="alertdialog"
      aria-modal="true"
    >
      <form className="ot-export-confirm__content" onSubmit={handleSubmit}>
        <h2 id={titleId} className="ot-export-confirm__title">
          {t('export.confirm.title')}
        </h2>
        <ul className="ot-export-confirm__warnings">
          <li>{t('export.confirm.b1')}</li>
          <li>{t('export.confirm.b2')}</li>
          <li>{t('export.confirm.b3')}</li>
          <li>{t('export.confirm.b4')}</li>
        </ul>

        <label className="ot-export-confirm__label" htmlFor={inputId}>
          {t('export.confirm.typed', { word })}
        </label>
        <input
          id={inputId}
          className="ot-export-confirm__input"
          type="text"
          ref={inputRef}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={typed}
          disabled={lockedOut}
          onChange={(e) => setTyped(e.target.value)}
        />

        {lockedOut && (
          <p className="ot-export-confirm__lockout" role="alert">
            {t('export.confirm.lockout', { minutes: remainingMinutes })}
          </p>
        )}

        <div className="ot-export-confirm__actions">
          <Button type="button" variant="ghost" size="md" onClick={onCancel}>
            {t('export.btn.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={lockedOut || typed !== word}
            aria-disabled={lockedOut || typed !== word}
          >
            {t('export.confirm.continue')}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
