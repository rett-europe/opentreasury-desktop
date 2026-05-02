// First-run onboarding wizard (#196).
//
// Shown by App.tsx when `app:needsOnboarding` returns true (i.e., no
// `dataDir` has been deliberately persisted in app-config.json yet).
//
// The wizard is a single screen: explain the choice, let the user browse for
// any folder OR accept the suggested default (`<userData>/my-data`), then
// confirm. On confirm we call `config:setDataDir` which persists the choice
// and schedules an app relaunch. If the picked folder already contains a
// dataset.json, the main-process handler treats it as "load that dataset"
// (we pass `confirmDatasetSwitch: true` so the workspace mismatch is
// auto-accepted — there is nothing to switch *from* on first run).
//
// Quitting the wizard window without choosing exits the app cleanly via
// Electron's `window-all-closed` handler — we deliberately do NOT silently
// fall back to a default. Picking a folder is required.

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DatasetErrorDialog } from '../../components/DatasetErrorDialog/DatasetErrorDialog.js';
import type { ConfigSetDataDirErrorCode } from '../../../shared/ipc-contracts/config.js';
import './OnboardingScreen.css';

type Status = 'loading' | 'ready' | 'submitting' | 'restarting' | 'error';

interface ErrorState {
  code: ConfigSetDataDirErrorCode | 'STATUS_FAILED' | 'PICKER_FAILED';
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

export function OnboardingScreen(): JSX.Element {
  const { t } = useTranslation('common');

  const [status, setStatus] = useState<Status>('loading');
  const [defaultDataDir, setDefaultDataDir] = useState<string>('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<ErrorState | null>(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await window.opentreasury.onboarding.getStatus();
        if (cancelled) return;
        setDefaultDataDir(response.defaultDataDir);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError({ code: 'STATUS_FAILED', message });
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBrowse = useCallback(async () => {
    setError(null);
    try {
      const result = await window.opentreasury.dialog.pickFolder();
      if (!result.ok) {
        setError({ code: 'PICKER_FAILED', message: result.error });
        return;
      }
      if (result.path === null) return; // user cancelled the OS dialog
      setSelectedPath(result.path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError({ code: 'PICKER_FAILED', message });
    }
  }, []);

  const handleUseDefault = useCallback(() => {
    setError(null);
    setSelectedPath(defaultDataDir);
  }, [defaultDataDir]);

  const handleConfirm = useCallback(async () => {
    if (!selectedPath) return;
    setStatus('submitting');
    setError(null);
    setShowErrorDialog(false);
    try {
      const result = await window.opentreasury.config.setDataDir({
        newDir: selectedPath,
        // First-run: pass confirmDatasetSwitch: true to auto-accept existing
        // dataset.json in the picked folder (there's no current workspace to
        // switch FROM, so the bypass is safe per #206 decision).
        confirmDatasetSwitch: true,
      });
      if (!result.ok) {
        const errorData: ErrorState = {
          code: result.error.code,
          message: result.error.message,
        };
        if (result.error.details) {
          errorData.details = result.error.details;
        }
        setError(errorData);
        setShowErrorDialog(true);
        setStatus('error');
        return;
      }
      // setDataDir schedules a relaunch — render a transient "restarting"
      // notice until the process exits.
      setStatus('restarting');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError({ code: 'SCHEMA_INVALID', message });
      setShowErrorDialog(true);
      setStatus('error');
    }
  }, [selectedPath]);

  const handleDismissError = (): void => {
    setShowErrorDialog(false);
    setStatus('ready');
  };

  const handlePickAnother = async (): Promise<void> => {
    setShowErrorDialog(false);
    setError(null);
    setStatus('ready');
    // Immediately trigger folder picker
    await handleBrowse();
  };

  const isBusy = status === 'submitting' || status === 'restarting';

  return (
    <div
      className="ot-onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ot-onboarding-title"
    >
      <div className="ot-onboarding__card">
        <h1 id="ot-onboarding-title" className="ot-onboarding__title">
          {t('onboarding.welcome.title')}
        </h1>

        <p className="ot-onboarding__body">{t('onboarding.welcome.body')}</p>

        <ul className="ot-onboarding__body ot-onboarding__body--list">
          <li>{t('onboarding.welcome.bulletAnyFolder')}</li>
          <li>{t('onboarding.welcome.bulletCloudSync')}</li>
          <li>{t('onboarding.welcome.bulletNoLockIn')}</li>
        </ul>

        <div className="ot-onboarding__path">
          <span className="ot-onboarding__path-label">{t('onboarding.welcome.selectedLabel')}</span>
          {selectedPath ? (
            <code className="ot-onboarding__path-value" data-testid="ot-onboarding-selected-path">
              {selectedPath}
            </code>
          ) : (
            <span className="ot-onboarding__path-value ot-onboarding__path-value--placeholder">
              {t('onboarding.welcome.noFolderYet')}
            </span>
          )}
        </div>

        {status === 'restarting' && (
          <p className="ot-onboarding__body">{t('onboarding.welcome.restarting')}</p>
        )}

        <div className="ot-onboarding__actions">
          <button
            type="button"
            className="ot-onboarding__button"
            onClick={handleUseDefault}
            disabled={isBusy || status === 'loading'}
          >
            {t('onboarding.welcome.useDefaultLabel')}
          </button>
          <button
            type="button"
            className="ot-onboarding__button"
            onClick={handleBrowse}
            disabled={isBusy || status === 'loading'}
          >
            {t('onboarding.welcome.browseLabel')}
          </button>
          <button
            type="button"
            className="ot-onboarding__button ot-onboarding__button--primary"
            onClick={handleConfirm}
            disabled={!selectedPath || isBusy || status === 'loading'}
          >
            {status === 'submitting' || status === 'restarting'
              ? t('common.loading')
              : t('onboarding.welcome.confirmLabel')}
          </button>
        </div>
      </div>

      {/* Dataset error dialog */}
      {showErrorDialog &&
        error &&
        error.code !== 'STATUS_FAILED' &&
        error.code !== 'PICKER_FAILED' && (
          <DatasetErrorDialog
            errorCode={error.code}
            errorMessage={error.message}
            errorDetails={error.details}
            onDismiss={handleDismissError}
            onPickAnother={handlePickAnother}
          />
        )}
    </div>
  );
}
