import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import './SettingsScreen.css';

type LoadState = 'loading' | 'loaded' | 'error';

interface SettingsData {
  dataDir: string | null;
  readOnly: boolean;
}

/**
 * Settings screen (P1-5) — exposes app configuration.
 *
 * Currently shows:
 *   - Data folder location (with "Change..." button stub for P1-2)
 *   - Read-only mode indicator when active
 *
 * The "Change..." button is disabled with a tooltip explaining that the
 * folder picker + setDataDir IPC lands in P1-2 (#149). Once that ships,
 * this screen will call window.opentreasury.config.setDataDir() and
 * trigger an app relaunch.
 */
export function SettingsScreen(): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<LoadState>('loading');
  const [data, setData] = useState<SettingsData | null>(null);

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
              {/* P1-2 (#149) — folder picker + setDataDir IPC not yet shipped.
                  The button is disabled with a tooltip until that lands. */}
              <button
                type="button"
                className="ot-settings__button"
                disabled
                title={t('settings.dataFolder.changeDisabledTooltip') satisfies string}
                aria-label={t('settings.dataFolder.changeButton') satisfies string}
              >
                {t('settings.dataFolder.changeButton')}
              </button>
            </div>
          </div>

          {/* Info note explaining the folder picker is coming */}
          <p className="ot-settings__note">{t('settings.dataFolder.changeComingSoon')}</p>
        </section>
      </div>
    </div>
  );
}
