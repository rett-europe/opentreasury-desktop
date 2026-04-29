import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './SettingsScreen.css';

// Helper to detect if a path is OneDrive Personal.
// OneDrive Personal paths on Windows typically look like:
//   C:\Users\{username}\OneDrive\...
// OneDrive for Business paths look like:
//   C:\Users\{username}\OneDrive - {orgname}\...
// This is a best-effort heuristic — it checks for the "OneDrive -" pattern.
function isOneDrivePersonal(path: string): boolean {
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  // Match OneDrive folder that doesn't have " - " suffix (Personal)
  // Positive: /onedrive/ or /onedrive at end
  // Negative: /onedrive - orgname/
  const onedriveMatch = /\/onedrive(?:\/|$)/i.test(normalized);
  const businessMatch = /\/onedrive\s*-\s*/i.test(normalized);
  return onedriveMatch && !businessMatch;
}

type LoadState = 'loading' | 'loaded' | 'error';
type ChangeState = 'idle' | 'picking' | 'changing' | 'error' | 'restarting';

interface SettingsData {
  dataDir: string | null;
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

      // 2. Check for OneDrive Personal (UX-001 E1)
      if (isOneDrivePersonal(selectedPath)) {
        setChangeState('error');
        setChangeError({ code: 'ONEDRIVE_PERSONAL', message: '' });
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

  // Resolve display path: if dataDir is null, show a placeholder message
  // indicating the default path is in use. The actual default path
  // (<userData>/dev-events) is computed server-side in bootstrap.ts.
  const displayPath = data.dataDir ?? t('settings.dataFolder.defaultMarker');

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
                <span className="ot-settings__path-note">
                  {t('settings.dataFolder.defaultMarker')}
                </span>
              )}
            </div>
            <div className="ot-settings__row-action">
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
