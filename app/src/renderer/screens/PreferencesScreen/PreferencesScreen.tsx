import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile } from '../../../shared/ipc-contracts/profile.js';
import type { ConfigSetDataDirErrorCode } from '../../../shared/ipc-contracts/config.js';
import {
  DATE_FORMATS,
  NUMBER_FORMATS,
  type DateFormat,
  type NumberFormat,
} from '../../../shared/format/index.js';
import { DatasetErrorDialog } from '../../components/DatasetErrorDialog/DatasetErrorDialog.js';
import { useFormatPrefs } from '../../format/index.js';
import './PreferencesScreen.css';

type LoadState = 'loading' | 'loaded' | 'error';
type ChangeState = 'idle' | 'picking' | 'changing' | 'error' | 'restarting';
type ProfileState = 'idle' | 'editing' | 'saving' | 'saved' | 'error';

interface ConfigData {
  dataDir: string | null;
  effectiveDataDir: string;
  readOnly: boolean;
}

interface ChangeError {
  code: ConfigSetDataDirErrorCode | 'PICKER_FAILED' | 'UNEXPECTED';
  message: string;
  details?:
    | {
        currentDatasetId?: string | undefined;
        newDatasetId?: string | undefined;
        schemaVersion?: number | undefined;
        folderSchemaVersion?: number | undefined;
        appSchemaVersion?: number | undefined;
      }
    | undefined;
}

interface ProfileData {
  name: string;
  role: string;
  ngoName: string;
}

interface ProfileErrors {
  name?: string;
  role?: string;
  ngoName?: string;
}

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

/**
 * Preferences screen — unified settings and user profile management.
 *
 * Replaces the old SettingsScreen with cards for profile, appearance,
 * language, formatting, dataset location, and about details.
 *
 * Plus a footer with Switch Dataset button.
 */
export function PreferencesScreen(): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const { dateFormat, numberFormat, setDateFormat, setNumberFormat } = useFormatPrefs();
  const [state, setState] = useState<LoadState>('loading');
  const [configData, setConfigData] = useState<ConfigData | null>(null);
  const [changeState, setChangeState] = useState<ChangeState>('idle');
  const [changeError, setChangeError] = useState<ChangeError | null>(null);

  // Dataset error dialog
  const [showDatasetErrorDialog, setShowDatasetErrorDialog] = useState(false);
  const [pendingFolderPath, setPendingFolderPath] = useState<string | null>(null);

  // App version
  const [appVersion, setAppVersion] = useState<string>('0.0.0');

  // Profile state
  const [profileState, setProfileState] = useState<ProfileState>('idle');
  const [profileData, setProfileData] = useState<ProfileData>({ name: '', role: '', ngoName: '' });
  const [profileOriginal, setProfileOriginal] = useState<ProfileData>({
    name: '',
    role: '',
    ngoName: '',
  });
  const [fullProfile, setFullProfile] = useState<Profile | null>(null); // Store full profile for save
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [otherRoleText, setOtherRoleText] = useState<string>('');
  const [saveAttemptFailed, setSaveAttemptFailed] = useState(false); // Track failed save/validation to re-enable button
  const [validationAttempted, setValidationAttempted] = useState(false); // Track that user tried to save at least once

  // Theme state (localStorage)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    const stored = localStorage.getItem('ot-theme');
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
    return 'system';
  });

  // Load config on mount
  useEffect(() => {
    let cancelled = false;

    async function loadConfig(): Promise<void> {
      try {
        const response = await window.opentreasury.config.get();
        if (cancelled) return;

        if (!response.ok) {
          setState('error');
          return;
        }

        setConfigData({
          dataDir: response.config.dataDir,
          effectiveDataDir: response.effectiveDataDir,
          readOnly: response.config.readOnly,
        });
        setState('loaded');
      } catch (err) {
        if (cancelled) return;
        console.error('[PreferencesScreen] Failed to load config:', err);
        setState('error');
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load profile on mount
  useEffect(() => {
    void (async () => {
      try {
        const response = await window.opentreasury.profile.get();
        if (response.ok && response.profile) {
          const { name, role, ngoName } = response.profile;
          const profileSnapshot = { name, role, ngoName };
          setProfileData(profileSnapshot);
          setProfileOriginal(profileSnapshot);
          setFullProfile(response.profile); // Store full profile

          // Parse role into dropdown selection
          const normalizedRole = role.toLowerCase();
          const knownRoleKey = ROLE_OPTIONS.slice(0, -1).find(
            (k) => k.toLowerCase() === normalizedRole,
          );
          if (knownRoleKey) {
            setSelectedRole(knownRoleKey);
            setOtherRoleText('');
          } else {
            setSelectedRole('other');
            setOtherRoleText(role);
          }
        }
      } catch (err) {
        console.error('[PreferencesScreen] Failed to load profile:', err);
      }
    })();
  }, []);

  // Load app version on mount
  useEffect(() => {
    void (async () => {
      try {
        const response = await window.opentreasury.app.getVersion();
        setAppVersion(response.version);
      } catch (err) {
        console.error('[PreferencesScreen] Failed to load app version:', err);
        // Keep default '0.0.0' on error
      }
    })();
  }, []);

  // Apply theme to document
  useEffect(() => {
    const applyTheme = (t: 'light' | 'dark' | 'system') => {
      const root = document.documentElement;
      if (t === 'system') {
        // Guard for test environment where matchMedia may not exist
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
          const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
          root.setAttribute('data-theme', 'light');
        }
      } else {
        root.setAttribute('data-theme', t);
      }
    };

    applyTheme(theme);
    localStorage.setItem('ot-theme', theme);
  }, [theme]);

  // Handle folder change
  const handleChangeFolder = async (): Promise<void> => {
    setChangeState('picking');
    setChangeError(null);

    try {
      const pickerResult = await window.opentreasury.dialog.pickFolder();

      if (!pickerResult.ok) {
        setChangeState('error');
        setChangeError({ code: 'PICKER_FAILED', message: pickerResult.error });
        return;
      }

      if (pickerResult.path === null) {
        return;
      }

      const selectedPath = pickerResult.path;
      if (!selectedPath) {
        return;
      }

      // No allowlist gating: trust the user's folder choice. The main-process
      // setDataDir handler enforces (a) writability via a probe write and
      // (b) not-same-as-current-effective-dataDir.
      await attemptSetDataDir(selectedPath, false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setChangeState('error');
      setChangeError({ code: 'UNEXPECTED', message });
    } finally {
      // Reset to idle unless we're in error or success path
      // Every exit path must show user feedback.
      setChangeState((current) =>
        current === 'restarting' || current === 'error' ? current : 'idle',
      );
    }
  };

  const attemptSetDataDir = async (path: string, confirmDatasetSwitch: boolean): Promise<void> => {
    setChangeState('changing');
    const setDirResult = await window.opentreasury.config.setDataDir({
      newDir: path,
      confirmDatasetSwitch,
    });

    if (!setDirResult.ok) {
      // Show DatasetErrorDialog for all errors
      const errorData: ChangeError = {
        code: setDirResult.error.code,
        message: setDirResult.error.message,
      };
      if (setDirResult.error.details) {
        errorData.details = setDirResult.error.details;
      }
      setChangeState('error');
      setChangeError(errorData);

      // If it's a bypassable error (DATASET_MISMATCH with newDatasetId, or SCHEMA_MIGRATION_AVAILABLE),
      // store the pending path for retry on confirm
      if (
        (setDirResult.error.code === 'DATASET_MISMATCH' &&
          setDirResult.error.details?.newDatasetId) ||
        setDirResult.error.code === 'SCHEMA_MIGRATION_AVAILABLE'
      ) {
        setPendingFolderPath(path);
      }

      setShowDatasetErrorDialog(true);
      return;
    }

    setChangeState('restarting');
  };

  const handleConfirmDatasetError = async (): Promise<void> => {
    if (!pendingFolderPath || !changeError) return;

    setShowDatasetErrorDialog(false);

    // For DATASET_MISMATCH, retry with confirmDatasetSwitch: true
    if (changeError.code === 'DATASET_MISMATCH') {
      await attemptSetDataDir(pendingFolderPath, true);
    }
    // For SCHEMA_MIGRATION_AVAILABLE, retry (migration confirmation handled by main process)
    else if (changeError.code === 'SCHEMA_MIGRATION_AVAILABLE') {
      await attemptSetDataDir(pendingFolderPath, false);
    }

    setPendingFolderPath(null);
  };

  const handleDismissDatasetError = (): void => {
    setShowDatasetErrorDialog(false);
    setPendingFolderPath(null);
    setChangeState('idle');
    setChangeError(null);
  };

  const handlePickAnotherFolder = async (): Promise<void> => {
    setShowDatasetErrorDialog(false);
    setChangeError(null);
    setPendingFolderPath(null);
    setChangeState('idle');
    // Immediately trigger folder picker
    await handleChangeFolder();
  };

  // Validate profile
  const validateProfile = useCallback((): boolean => {
    const next: ProfileErrors = {};

    if (!profileData.name.trim()) {
      next.name = t('preferences.profile.errors.nameRequired');
    } else if (profileData.name.trim().length > 100) {
      next.name = t('preferences.profile.errors.nameTooLong');
    }

    const effectiveRole = selectedRole === 'other' ? otherRoleText : selectedRole;
    if (!effectiveRole.trim()) {
      next.role = t('preferences.profile.errors.roleRequired');
    } else if (effectiveRole.trim().length > 50) {
      next.role = t('preferences.profile.errors.roleTooLong');
    }

    if (!profileData.ngoName.trim()) {
      next.ngoName = t('preferences.profile.errors.ngoNameRequired');
    } else if (profileData.ngoName.trim().length > 200) {
      next.ngoName = t('preferences.profile.errors.ngoNameTooLong');
    }

    setProfileErrors(next);
    return Object.keys(next).length === 0;
  }, [profileData, selectedRole, otherRoleText, t]);

  // Save profile
  const handleSaveProfile = useCallback(async () => {
    setValidationAttempted(true); // User attempted to save

    if (!validateProfile()) {
      // Validation failed — field errors are already set by validateProfile
      // Don't set profileState to 'error' (that's for IPC failures)
      return;
    }

    if (!fullProfile) {
      console.error('[PreferencesScreen] Cannot save: full profile not loaded');
      setProfileState('error');
      setSaveAttemptFailed(true);
      return;
    }

    setProfileState('saving');

    try {
      const effectiveRole = selectedRole === 'other' ? otherRoleText.trim() : selectedRole;

      const response = await window.opentreasury.profile.save({
        userId: fullProfile.userId,
        name: profileData.name.trim(),
        role: effectiveRole,
        ngoName: profileData.ngoName.trim(),
        identitySource: fullProfile.identitySource,
        createdAt: fullProfile.createdAt,
      });

      if (!response.ok) {
        console.error('[PreferencesScreen] Profile save failed:', response.error);
        setProfileState('error');
        setSaveAttemptFailed(true);
        return;
      }

      const updatedData = {
        name: profileData.name.trim(),
        role: effectiveRole,
        ngoName: profileData.ngoName.trim(),
      };
      setProfileData(updatedData);
      setProfileOriginal(updatedData);
      setFullProfile(response.profile); // Update full profile with response
      setProfileState('saved');
      setSaveAttemptFailed(false);
      setValidationAttempted(false); // Reset on successful save

      setTimeout(() => {
        setProfileState('idle');
      }, 2000);

      // Reload page to update sidebar
      window.location.reload();
    } catch (err) {
      console.error('[PreferencesScreen] Failed to save profile:', err);
      setProfileState('error');
      setSaveAttemptFailed(true);
    }
  }, [profileData, selectedRole, otherRoleText, fullProfile, validateProfile]);

  // Detect if profile changed
  const profileChanged =
    profileData.name !== profileOriginal.name ||
    profileData.ngoName !== profileOriginal.ngoName ||
    (selectedRole === 'other'
      ? otherRoleText !== profileOriginal.role
      : selectedRole !== profileOriginal.role);

  // Clear errors when user edits any field (but keep saveAttemptFailed to allow retry)
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileData({ ...profileData, name: e.target.value });
    setProfileErrors({});
    setProfileState('idle');
  };

  const handleNgoNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProfileData({ ...profileData, ngoName: e.target.value });
    setProfileErrors({});
    setProfileState('idle');
  };

  const handleRoleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRole(e.target.value);
    if (e.target.value !== 'other') {
      setOtherRoleText('');
    }
    setProfileErrors({});
    setProfileState('idle');
  };

  const handleOtherRoleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setOtherRoleText(e.target.value);
    setProfileErrors({});
    setProfileState('idle');
  };

  useEffect(() => {
    if (profileChanged && profileState === 'idle') {
      setProfileState('editing');
    }
  }, [profileChanged, profileState]);

  if (state === 'loading') {
    return (
      <div className="ot-preferences">
        <div className="ot-preferences__header">
          <h1 className="ot-preferences__title">{t('preferences.title')}</h1>
        </div>
        <div className="ot-preferences__loading">{t('common.loading')}</div>
      </div>
    );
  }

  if (state === 'error' || !configData) {
    return (
      <div className="ot-preferences">
        <div className="ot-preferences__header">
          <h1 className="ot-preferences__title">{t('preferences.title')}</h1>
        </div>
        <div className="ot-preferences__error">
          Failed to load preferences. Please refresh the app.
        </div>
      </div>
    );
  }

  return (
    <div className="ot-preferences">
      <div className="ot-preferences__header">
        <h1 className="ot-preferences__title">{t('preferences.title')}</h1>
      </div>

      <div className="ot-preferences__cards">
        {/* Card 1: Profile */}
        <section className="ot-preferences__card">
          <h2 className="ot-preferences__card-title">{t('preferences.profile.title')}</h2>
          <div className="ot-preferences__card-content">
            <div className="ot-preferences__field">
              <label className="ot-preferences__label" htmlFor="pref-name">
                {t('preferences.profile.nameLabel')}
              </label>
              <input
                id="pref-name"
                type="text"
                className="ot-preferences__input"
                value={profileData.name}
                maxLength={100}
                onChange={handleNameChange}
                aria-invalid={!!profileErrors.name}
              />
              {profileErrors.name && (
                <span className="ot-preferences__error-msg">{profileErrors.name}</span>
              )}
            </div>

            <div className="ot-preferences__field">
              <label className="ot-preferences__label" htmlFor="pref-role">
                {t('preferences.profile.roleLabel')}
              </label>
              <select
                id="pref-role"
                className="ot-preferences__select"
                value={selectedRole}
                onChange={handleRoleChange}
                aria-invalid={!!profileErrors.role}
              >
                {ROLE_OPTIONS.map((roleKey) => (
                  <option key={roleKey} value={roleKey}>
                    {t(`profile.roles.${roleKey}`)}
                  </option>
                ))}
              </select>
              {selectedRole === 'other' && (
                <input
                  type="text"
                  className="ot-preferences__input ot-preferences__input--other-role"
                  placeholder={t('profile.otherRoleLabel')}
                  value={otherRoleText}
                  maxLength={50}
                  onChange={handleOtherRoleChange}
                  aria-label={t('profile.otherRoleLabel')}
                />
              )}
              {profileErrors.role && (
                <span className="ot-preferences__error-msg">{profileErrors.role}</span>
              )}
            </div>

            <div className="ot-preferences__field">
              <label className="ot-preferences__label" htmlFor="pref-ngo">
                {t('preferences.profile.ngoLabel')}
              </label>
              <input
                id="pref-ngo"
                type="text"
                className="ot-preferences__input"
                value={profileData.ngoName}
                maxLength={200}
                onChange={handleNgoNameChange}
                aria-invalid={!!profileErrors.ngoName}
              />
              {profileErrors.ngoName && (
                <span className="ot-preferences__error-msg">{profileErrors.ngoName}</span>
              )}
            </div>

            <button
              type="button"
              className="ot-preferences__button"
              disabled={
                (!profileChanged && !saveAttemptFailed && !validationAttempted) ||
                profileState === 'saving'
              }
              onClick={handleSaveProfile}
            >
              {profileState === 'saving'
                ? t('preferences.profile.saving')
                : profileState === 'saved'
                  ? t('preferences.profile.saved')
                  : t('preferences.profile.saveButton')}
            </button>

            {profileState === 'error' && Object.keys(profileErrors).length === 0 && (
              <p className="ot-preferences__error-msg">
                {t('preferences.profile.errors.saveFailed')}
              </p>
            )}
          </div>
        </section>

        {/* Card 2: Appearance */}
        <section className="ot-preferences__card">
          <h2 className="ot-preferences__card-title">{t('preferences.appearance.title')}</h2>
          <div className="ot-preferences__card-content">
            <div className="ot-preferences__field">
              <label className="ot-preferences__label">
                {t('preferences.appearance.themeLabel')}
              </label>
              <div className="ot-preferences__segmented" role="radiogroup">
                <button
                  type="button"
                  className={`ot-preferences__segment ${theme === 'light' ? 'ot-preferences__segment--active' : ''}`}
                  role="radio"
                  aria-checked={theme === 'light'}
                  onClick={() => setTheme('light')}
                >
                  {t('preferences.appearance.light')}
                </button>
                <button
                  type="button"
                  className={`ot-preferences__segment ${theme === 'dark' ? 'ot-preferences__segment--active' : ''}`}
                  role="radio"
                  aria-checked={theme === 'dark'}
                  onClick={() => setTheme('dark')}
                >
                  {t('preferences.appearance.dark')}
                </button>
                <button
                  type="button"
                  className={`ot-preferences__segment ${theme === 'system' ? 'ot-preferences__segment--active' : ''}`}
                  role="radio"
                  aria-checked={theme === 'system'}
                  onClick={() => setTheme('system')}
                >
                  {t('preferences.appearance.system')}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Card 3: Language */}
        <section className="ot-preferences__card">
          <h2 className="ot-preferences__card-title">{t('preferences.language.title')}</h2>
          <div className="ot-preferences__card-content">
            <div className="ot-preferences__field">
              <label className="ot-preferences__label" htmlFor="pref-language">
                {t('preferences.language.label')}
              </label>
              <select
                id="pref-language"
                className="ot-preferences__select ot-preferences__select--narrow"
                value={i18n.language.startsWith('es') ? 'es' : 'en'}
                onChange={(e) => {
                  const lang = e.target.value as 'en' | 'es';
                  void i18n.changeLanguage(lang);
                  localStorage.setItem('ot-language', lang);
                }}
              >
                <option value="en">{t('preferences.language.en')}</option>
                <option value="es">{t('preferences.language.es')}</option>
              </select>
            </div>
          </div>
        </section>

        {/* Card 4: Date format */}
        <section className="ot-preferences__card">
          <h2 className="ot-preferences__card-title">{t('preferences.dateFormat.title')}</h2>
          <div className="ot-preferences__card-content">
            <div className="ot-preferences__field">
              <label className="ot-preferences__label" htmlFor="pref-date-format">
                {t('preferences.dateFormat.label')}
              </label>
              <select
                id="pref-date-format"
                className="ot-preferences__select ot-preferences__select--narrow"
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as DateFormat)}
              >
                {DATE_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {t(`preferences.dateFormat.options.${format}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Card 5: Number format */}
        <section className="ot-preferences__card">
          <h2 className="ot-preferences__card-title">{t('preferences.numberFormat.title')}</h2>
          <div className="ot-preferences__card-content">
            <div className="ot-preferences__field">
              <label className="ot-preferences__label" htmlFor="pref-number-format">
                {t('preferences.numberFormat.label')}
              </label>
              <select
                id="pref-number-format"
                className="ot-preferences__select ot-preferences__select--narrow"
                value={numberFormat}
                onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
              >
                {NUMBER_FORMATS.map((format) => (
                  <option key={format} value={format}>
                    {t(`preferences.numberFormat.options.${format}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Card 6: Dataset (merged: dataset info + folder location & change) */}
        <section className="ot-preferences__card">
          <h2 className="ot-preferences__card-title">{t('preferences.dataset.title')}</h2>
          <div className="ot-preferences__card-content">
            <div className="ot-preferences__field">
              <span className="ot-preferences__label">
                {t('preferences.dataset.locationLabel')}
              </span>
              <code className="ot-preferences__code">{configData.effectiveDataDir}</code>
              {configData.dataDir === null && (
                <span className="ot-preferences__badge ot-preferences__badge--info">
                  {t('preferences.dataset.defaultBadge')}
                </span>
              )}
              {configData.readOnly && (
                <span className="ot-preferences__badge ot-preferences__badge--readonly">
                  {t('preferences.dataset.readonlyBadge')}
                </span>
              )}
              {/* Drift warning: configured path differs from effective path */}
              {configData.dataDir !== null &&
                configData.dataDir.toLowerCase().replace(/\\/g, '/') !==
                  configData.effectiveDataDir.toLowerCase().replace(/\\/g, '/') && (
                  <div className="ot-preferences__warning">
                    {t('preferences.dataset.driftWarning', {
                      effectivePath: configData.effectiveDataDir,
                    })}
                  </div>
                )}
            </div>

            <div className="ot-preferences__button-group">
              <button
                type="button"
                className="ot-preferences__button ot-preferences__button--secondary"
                disabled={
                  (changeState !== 'idle' && changeState !== 'error') || configData.readOnly
                }
                onClick={handleChangeFolder}
              >
                {changeState === 'picking' || changeState === 'changing'
                  ? t('common.loading')
                  : t('preferences.dataFolder.changeButton')}
              </button>
            </div>

            {changeState === 'restarting' && (
              <p className="ot-preferences__note ot-preferences__note--info">
                {t('preferences.dataFolder.restarting')}
              </p>
            )}
          </div>
        </section>

        {/* Card 7: About */}
        <section className="ot-preferences__card">
          <h2 className="ot-preferences__card-title">{t('preferences.about.title')}</h2>
          <div className="ot-preferences__card-content">
            <p className="ot-preferences__version">
              {t('preferences.about.version', { version: appVersion })}
            </p>
          </div>
        </section>
      </div>

      {/* Dataset error dialog */}
      {showDatasetErrorDialog &&
        changeError &&
        changeError.code !== 'PICKER_FAILED' &&
        changeError.code !== 'UNEXPECTED' && (
          <DatasetErrorDialog
            errorCode={changeError.code}
            errorMessage={changeError.message}
            errorDetails={changeError.details}
            onDismiss={handleDismissDatasetError}
            onConfirm={handleConfirmDatasetError}
            onPickAnother={handlePickAnotherFolder}
          />
        )}
    </div>
  );
}
