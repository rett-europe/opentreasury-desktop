import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { classifySyncRoot } from '../../utils/syncRoot.js';
import './SettingsScreen.css';

type LoadState = 'loading' | 'loaded' | 'error';
type ChangeState = 'idle' | 'picking' | 'changing' | 'error' | 'restarting';

interface SettingsData {
  dataDir: string | null;
  effectiveDataDir: string;
  readOnly: boolean;
}

interface ChangeError {
  code: string;
  message: string;
}

/**
 * Settings screen (P1-5) — exposes app configuration.
 *
 * Currently shows:
 *   - Data folder location (with "Change..." button)
 *   - Read-only mode indicator when active
 *
 * The "Change..." button (P2-4 #156) opens a folder picker, validates
 * the selection (rejecting OneDrive Personal per UX-001 E1), and calls
 * window.opentreasury.config.setDataDir() to trigger an app relaunch.
 */
export function SettingsScreen(): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<SettingsData | null>(null);
  const [changeState, setChangeState] = useState<ChangeState>('idle');
  const [changeError, setChangeError] = useState<ChangeError | null>(null);

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

        setData({
          dataDir: response.config.dataDir,
          effectiveDataDir: response.effectiveDataDir,
          readOnly: response.config.readOnly,
        });
        setState('loaded');
      } catch (err) {
        if (cancelled) return;
        console.error('[SettingsScreen] Failed to load config:', err);
        setState('error');
      }
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleChangeFolder = async (): Promise<void> => {
    setChangeState('picking');
    setChangeError(null);

    try {
      // 1. Open folder picker
      const pickerResult = await window.opentreasury.dialog.pickFolder();

      if (!pickerResult.ok) {
        setChangeState('error');
        setChangeError({ code: 'PICKER_FAILED', message: pickerResult.error });
        return;
      }

      if (pickerResult.path === null) {
        // User cancelled or no path selected
        setChangeState('idle');
        return;
      }

      const selectedPath = pickerResult.path;
      if (!selectedPath) {
        setChangeState('idle');
        return;
      }

      // 2. Validate corp-folder requirement
      const kind = classifySyncRoot(selectedPath);
      if (kind === 'onedrive-personal') {
        setChangeState('error');
        setChangeError({ code: 'ONEDRIVE_PERSONAL', message: '' });
        return;
      }
      if (kind === 'other') {
        setChangeState('error');
        setChangeError({ code: 'NOT_CORP_LOCATION', message: '' });
        return;
      }

      // 3. Call setDataDir
      setChangeState('changing');
      const setDirResult = await window.opentreasury.config.setDataDir({
        newDir: selectedPath,
      });

      if (!setDirResult.ok) {
        setChangeState('error');
        setChangeError({
          code: setDirResult.error.code,
          message: setDirResult.error.message,
        });
        return;
      }

      // 4. Success — app will relaunch shortly
      setChangeState('restarting');
    } catch (err) {
      setChangeState('error');
      const message = err instanceof Error ? err.message : String(err);
      setChangeError({ code: 'UNEXPECTED', message });
    }
  };

  if (state === 'loading') {
    return (
      <div className="ot-settings">
        <div className="ot-settings__header">
          <h1 className="ot-settings__title">{t('settings.title')}</h1>
        </div>
        <div className="ot-settings__loading">{t('common.loading')}</div>
      </div>
    );
  }

  if (state === 'error' || !data) {
    return (
      <div className="ot-settings">
        <div className="ot-settings__header">
          <h1 className="ot-settings__title">{t('settings.title')}</h1>
        </div>
        <div className="ot-settings__error">Failed to load settings. Please refresh the app.</div>
      </div>
    );
  }

  // Resolve display path: always show the effective absolute path
  const displayPath = data.effectiveDataDir;

  return (
    <div className="ot-settings">
      <div className="ot-settings__header">
        <h1 className="ot-settings__title">{t('settings.title')}</h1>
      </div>

      <div className="ot-settings__content">
        <section className="ot-settings__section">
          <div className="ot-settings__row">
            <div className="ot-settings__row-label">
              <span className="ot-settings__row-title">{t('settings.dataFolder.title')}</span>
              {data.readOnly && (
                <span className="ot-settings__badge ot-settings__badge--readonly">
                  {t('settings.dataFolder.readonlyBadge')}
                </span>
              )}
            </div>
            <div className="ot-settings__row-value">
              <code className="ot-settings__path">{displayPath}</code>
              {data.dataDir === null && (
                <span className="ot-settings__badge ot-settings__badge--info">
                  {t('settings.dataFolder.defaultLocationNote')}
                </span>
              )}
            </div>
            <div className="ot-settings__row-action">
              <p className="ot-settings__hint">{t('settings.dataFolder.requirement')}</p>
              <button
                type="button"
                className="ot-settings__button"
                disabled={changeState !== 'idle' || data.readOnly}
                aria-label={t('settings.dataFolder.changeButton') satisfies string}
                onClick={handleChangeFolder}
              >
                {changeState === 'picking' || changeState === 'changing'
                  ? t('common.loading')
                  : t('settings.dataFolder.changeButton')}
              </button>
            </div>
          </div>

          {/* Status messages */}
          {changeState === 'restarting' && (
            <p className="ot-settings__note ot-settings__note--info">
              {t('settings.dataFolder.restarting')}
            </p>
          )}

          {changeState === 'error' && changeError && (
            <div className="ot-settings__error-card">
              {changeError.code === 'ONEDRIVE_PERSONAL' ? (
                <p>{t('settings.dataFolder.errors.oneDrivePersonal')}</p>
              ) : changeError.code === 'NOT_CORP_LOCATION' ? (
                <p>{t('settings.dataFolder.errors.notCorpLocation')}</p>
              ) : changeError.code === 'SAME_DIR' ? (
                <p>{t('settings.dataFolder.errors.sameDir')}</p>
              ) : changeError.code === 'INVALID_LOCATION' ? (
                <p>{t('settings.dataFolder.errors.invalidLocation')}</p>
              ) : changeError.code === 'NOT_WRITABLE' ? (
                <p>{t('settings.dataFolder.errors.notWritable')}</p>
              ) : changeError.code === 'DATASET_MISMATCH' ? (
                <p>{t('settings.dataFolder.errors.datasetMismatch')}</p>
              ) : (
                <p>
                  {t('settings.dataFolder.errors.generic')}: {changeError.message}
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
