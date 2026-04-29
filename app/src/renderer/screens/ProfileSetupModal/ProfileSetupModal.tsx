import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './ProfileSetupModal.css';

export interface ProfileSetupData {
  name: string;
  role: string;
  ngoName: string;
  userId: string;
}

export interface ProfileSetupModalProps {
  readonly isOpen: boolean;
  readonly onComplete: (profile: ProfileSetupData) => void;
}

interface Errors {
  name?: string;
  role?: string;
  ngoName?: string;
}

/**
 * First-launch profile setup modal (P1-4).
 * Minimal subset of UX-001 spec — captures name, role, NGO name only.
 * Full IPC wiring arrives with P0-2 (#146).
 */
export function ProfileSetupModal({ isOpen, onComplete }: ProfileSetupModalProps): JSX.Element {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [ngoName, setNgoName] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) {
      dialog.showModal();
      const firstField = dialog.querySelector<HTMLInputElement>(
        'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([disabled])',
      );
      firstField?.focus();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event): void => {
      e.preventDefault();
    };
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('cancel', handleCancel);
    };
  }, []);

  const validate = useCallback((): boolean => {
    const next: Errors = {};
    if (!name.trim()) next.name = t('profileSetup.errors.nameRequired');
    else if (name.trim().length > 80) next.name = t('profileSetup.errors.nameTooLong');

    if (!role.trim()) next.role = t('profileSetup.errors.roleRequired');
    else if (role.trim().length > 50) next.role = t('profileSetup.errors.roleTooLong');

    if (!ngoName.trim()) next.ngoName = t('profileSetup.errors.ngoNameRequired');
    else if (ngoName.trim().length > 120) next.ngoName = t('profileSetup.errors.ngoNameTooLong');

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [name, role, ngoName, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setSubmitting(true);
      try {
        // TODO(P0-2): wire to profile.json schema once #146 lands
        // For now, generate a placeholder userId and call the stubbed IPC
        const userId = crypto.randomUUID();
        const profile: ProfileSetupData = {
          name: name.trim(),
          role: role.trim(),
          ngoName: ngoName.trim(),
          userId,
        };

        // Stub IPC call — will be replaced with window.api.profile.save(profile) in P0-2
        await new Promise((resolve) => setTimeout(resolve, 300));

        onComplete(profile);
      } finally {
        setSubmitting(false);
      }
    },
    [validate, name, role, ngoName, onComplete],
  );

  return (
    <dialog ref={dialogRef} className="ot-profile-setup-modal">
      <div className="ot-profile-setup-modal__content">
        <div className="ot-profile-setup-modal__header">
          <div className="ot-profile-setup-modal__header-text">
            <h1 className="ot-profile-setup-modal__title">{t('profileSetup.title')}</h1>
            <p className="ot-profile-setup-modal__subtitle">{t('profileSetup.subtitle')}</p>
          </div>
        </div>

        <form className="ot-profile-setup-modal__form" onSubmit={handleSubmit}>
          <div className="ot-profile-setup-modal__field">
            <label htmlFor="profile-name" className="ot-profile-setup-modal__label">
              {t('profileSetup.nameLabel')}
            </label>
            <input
              id="profile-name"
              className="ot-profile-setup-modal__input"
              type="text"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'profile-name-err' : undefined}
              autoFocus
            />
            {errors.name ? (
              <span id="profile-name-err" className="ot-profile-setup-modal__field-error">
                {errors.name}
              </span>
            ) : null}
          </div>

          <div className="ot-profile-setup-modal__field">
            <label htmlFor="profile-role" className="ot-profile-setup-modal__label">
              {t('profileSetup.roleLabel')}
            </label>
            <input
              id="profile-role"
              className="ot-profile-setup-modal__input"
              type="text"
              value={role}
              maxLength={50}
              placeholder={t('profileSetup.rolePlaceholder')}
              onChange={(e) => setRole(e.target.value)}
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? 'profile-role-err' : undefined}
            />
            {errors.role ? (
              <span id="profile-role-err" className="ot-profile-setup-modal__field-error">
                {errors.role}
              </span>
            ) : null}
          </div>

          <div className="ot-profile-setup-modal__field">
            <label htmlFor="profile-ngo" className="ot-profile-setup-modal__label">
              {t('profileSetup.ngoLabel')}
            </label>
            <input
              id="profile-ngo"
              className="ot-profile-setup-modal__input"
              type="text"
              value={ngoName}
              maxLength={120}
              onChange={(e) => setNgoName(e.target.value)}
              aria-invalid={Boolean(errors.ngoName)}
              aria-describedby={errors.ngoName ? 'profile-ngo-err' : undefined}
            />
            {errors.ngoName ? (
              <span id="profile-ngo-err" className="ot-profile-setup-modal__field-error">
                {errors.ngoName}
              </span>
            ) : null}
          </div>

          <div className="ot-profile-setup-modal__footer">
            <button type="submit" className="ot-profile-setup-modal__submit" disabled={submitting}>
              {submitting ? t('profileSetup.submitting') : t('profileSetup.submit')}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
