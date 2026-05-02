// Boot hydration error page (#242).
//
// Full-screen error surface shown when app bootstrap/hydration fails at boot.
// Unlike DatasetErrorDialog (folder-change errors), this is fatal — the app
// cannot proceed without a valid dataset. The user must either restore from
// backup or pick a different folder.
//
// Error scenarios:
// - DATASET_CORRUPT: dataset.json is unreadable, invalid JSON, or schema-invalid
// - SCHEMA_TOO_NEW: folder schema version > app schema version (update required)
// - SCHEMA_TOO_OLD_NO_MIGRATION: no migration path available
// - HYDRATION_FAILED: event replay failed (logic error or corrupt events.ndjson)
//
// Recovery actions:
// - Restore from backup (M1: disabled with tooltip; wiring TBD in future issue)
// - Pick a different folder (re-runs folder picker)
// - Contact support (copy error details to clipboard)

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './BootErrorPage.css';

export interface BootErrorDetails {
  code: string;
  message: string;
  filePath?: string;
  folderSchemaVersion?: number;
  appSchemaVersion?: number;
}

export interface BootErrorPageProps {
  error: BootErrorDetails;
}

export function BootErrorPage({ error }: BootErrorPageProps): JSX.Element {
  const { t } = useTranslation('common');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyDiagnostics = useCallback(() => {
    const diagnostics = JSON.stringify(error, null, 2);
    navigator.clipboard
      .writeText(diagnostics)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Failed to copy diagnostics:', err);
      });
  }, [error]);

  const handlePickDifferentFolder = useCallback(async () => {
    try {
      const result = await window.opentreasury.dialog.pickFolder();
      if (!result.ok || result.path === null) return; // user cancelled

      await window.opentreasury.config.setDataDir({
        newDir: result.path,
        confirmDatasetSwitch: true,
      });

      // If setDataDir succeeds, the main process will relaunch the app
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to pick folder:', err);
    }
  }, []);

  const handleRestoreFromBackup = useCallback(() => {
    // M1: backup restore not implemented yet — show tooltip
    // This will be wired in a future issue when backup/restore lands
  }, []);

  const renderErrorTitle = (): string => {
    switch (error.code) {
      case 'DATASET_CORRUPT':
        return t('boot.error.DATASET_CORRUPT.title');
      case 'SCHEMA_TOO_NEW':
        return t('boot.error.SCHEMA_TOO_NEW.title');
      case 'SCHEMA_TOO_OLD_NO_MIGRATION':
        return t('boot.error.SCHEMA_TOO_OLD_NO_MIGRATION.title');
      case 'HYDRATION_FAILED':
        return t('boot.error.HYDRATION_FAILED.title');
      default:
        return t('boot.error.generic.title');
    }
  };

  const renderErrorBody = (): JSX.Element => {
    switch (error.code) {
      case 'DATASET_CORRUPT':
        return (
          <>
            <p>{t('boot.error.DATASET_CORRUPT.body')}</p>
            {error.filePath && (
              <div className="ot-boot-error__file-path">
                <span className="ot-boot-error__file-path-label">{t('boot.error.filePath')}:</span>
                <code className="ot-boot-error__file-path-value">{error.filePath}</code>
              </div>
            )}
            <p className="ot-boot-error__detail">{error.message}</p>
          </>
        );

      case 'SCHEMA_TOO_NEW':
        return (
          <>
            <p>{t('boot.error.SCHEMA_TOO_NEW.body')}</p>
            {error.folderSchemaVersion && error.appSchemaVersion && (
              <div className="ot-boot-error__version-info">
                <p>
                  {t('boot.error.SCHEMA_TOO_NEW.folderVersion', {
                    version: error.folderSchemaVersion,
                  })}
                </p>
                <p>
                  {t('boot.error.SCHEMA_TOO_NEW.appVersion', {
                    version: error.appSchemaVersion,
                  })}
                </p>
              </div>
            )}
          </>
        );

      case 'SCHEMA_TOO_OLD_NO_MIGRATION':
        return (
          <>
            <p>{t('boot.error.SCHEMA_TOO_OLD_NO_MIGRATION.body')}</p>
            {error.folderSchemaVersion && error.appSchemaVersion && (
              <div className="ot-boot-error__version-info">
                <p>
                  {t('boot.error.SCHEMA_TOO_OLD_NO_MIGRATION.folderVersion', {
                    version: error.folderSchemaVersion,
                  })}
                </p>
                <p>
                  {t('boot.error.SCHEMA_TOO_OLD_NO_MIGRATION.appVersion', {
                    version: error.appSchemaVersion,
                  })}
                </p>
              </div>
            )}
          </>
        );

      case 'HYDRATION_FAILED':
        return (
          <>
            <p>{t('boot.error.HYDRATION_FAILED.body')}</p>
            {error.filePath && (
              <div className="ot-boot-error__file-path">
                <span className="ot-boot-error__file-path-label">{t('boot.error.filePath')}:</span>
                <code className="ot-boot-error__file-path-value">{error.filePath}</code>
              </div>
            )}
            <p className="ot-boot-error__detail">{error.message}</p>
          </>
        );

      default:
        return (
          <>
            <p>{t('boot.error.generic.body')}</p>
            <p className="ot-boot-error__detail">{error.message}</p>
          </>
        );
    }
  };

  return (
    <div className="ot-boot-error">
      <div className="ot-boot-error__container">
        <div className="ot-boot-error__icon">⚠</div>
        <h1 className="ot-boot-error__title">{renderErrorTitle()}</h1>
        <div className="ot-boot-error__body">{renderErrorBody()}</div>

        <div className="ot-boot-error__actions">
          <button
            type="button"
            className="ot-boot-error__button ot-boot-error__button--disabled"
            onClick={handleRestoreFromBackup}
            disabled
            title={t('boot.error.actions.restoreBackupDisabledTooltip')}
          >
            {t('boot.error.actions.restoreBackup')}
          </button>
          <button
            type="button"
            className="ot-boot-error__button ot-boot-error__button--secondary"
            onClick={handlePickDifferentFolder}
          >
            {t('boot.error.actions.pickDifferentFolder')}
          </button>
        </div>

        <div className="ot-boot-error__support">
          <p>{t('boot.error.supportNote')}</p>
          <button
            type="button"
            className="ot-boot-error__diagnostics-toggle"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
          >
            {showDiagnostics ? t('boot.error.diagnostics.hide') : t('boot.error.diagnostics.show')}
          </button>
        </div>

        {showDiagnostics && (
          <div className="ot-boot-error__diagnostics">
            <pre className="ot-boot-error__diagnostics-content">
              {JSON.stringify(error, null, 2)}
            </pre>
            <button
              type="button"
              className="ot-boot-error__copy-button"
              onClick={handleCopyDiagnostics}
            >
              {copied ? t('boot.error.diagnostics.copied') : t('boot.error.diagnostics.copy')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
