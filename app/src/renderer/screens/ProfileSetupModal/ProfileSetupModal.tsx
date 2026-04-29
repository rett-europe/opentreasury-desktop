import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { newUlid } from '../../utils/ulid.js';
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
  const [selectedRole, setSelectedRole] = useState('');
  const [otherRoleText, setOtherRoleText] = useState('');
  const [ngoName, setNgoName] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const ROLE_OPTIONS = [
    'treasurer',
    'accountant',
    'financeManager',
    'executiveDirector',
    'boardMember',
    'volunteer',
    'admin',
    'other',
  ] as const;

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
    else if (name.trim().length > 100) next.name = t('profileSetup.errors.nameTooLong');

    const effectiveRole = selectedRole === 'other' ? otherRoleText : selectedRole;
    if (!effectiveRole.trim()) next.role = t('profileSetup.errors.roleRequired');
    else if (effectiveRole.trim().length > 50) next.role = t('profileSetup.errors.roleTooLong');

    if (!ngoName.trim()) next.ngoName = t('profileSetup.errors.ngoNameRequired');
    else if (ngoName.trim().length > 200) next.ngoName = t('profileSetup.errors.ngoNameTooLong');

    setErrors(next);
    return Object.keys(next).length === 0;
  }, [name, selectedRole, otherRoleText, ngoName, t]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!validate()) return;

      setSubmitting(true);
      try {
        // userId is a 26-char ULID (matches profileSchema in shared/ipc-contracts/profile.ts).
        // crypto.randomUUID() would produce a 36-char UUID and fail schema validation.
        const userId = newUlid();
        const effectiveRole = selectedRole === 'other' ? otherRoleText.trim() : selectedRole;
        const profile: ProfileSetupData = {
          name: name.trim(),
          role: effectiveRole,
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
    [validate, name, selectedRole, otherRoleText, ngoName, onComplete],
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
              maxLength={100}
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
            <select
              id="profile-role"
              className="ot-profile-setup-modal__input"
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value);
                if (e.target.value !== 'other') {
                  setOtherRoleText('');
                }
              }}
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? 'profile-role-err' : undefined}
            >
              <option value="">{t('profileSetup.rolePlaceholder')}</option>
              {ROLE_OPTIONS.map((roleKey) => (
                <option key={roleKey} value={roleKey}>
                  {t(`profile.roles.${roleKey}`)}
                </option>
              ))}
            </select>
            {selectedRole === 'other' && (
              <input
                type="text"
                className="ot-profile-setup-modal__input"
                placeholder={t('profile.otherRoleLabel')}
                value={otherRoleText}
                maxLength={50}
                onChange={(e) => setOtherRoleText(e.target.value)}
                aria-label={t('profile.otherRoleLabel')}
                style={{ marginTop: 'var(--space-3)' }}
              />
            )}
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
              maxLength={200}
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
