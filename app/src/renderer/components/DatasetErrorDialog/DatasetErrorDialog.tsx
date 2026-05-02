// Dataset error dialog — handles all dataset-handshake error codes (#241).
//
// Used by PreferencesScreen (folder-change) and OnboardingScreen (first-run)
// to surface actionable error messages when config:setDataDir returns {ok: false}.
//
// Error codes per docs/specs/error-codes.md:
// - DATASET_MISMATCH (bypassable if newDatasetId present)
// - SCHEMA_TOO_NEW (upgrade app)
// - SCHEMA_TOO_OLD_NO_MIGRATION (contact support)
// - SCHEMA_MIGRATION_AVAILABLE (upgrade folder)
// - SCHEMA_INVALID / DATASET_CORRUPT / NOT_WRITABLE / INVALID_LOCATION / SAME_DIR (hard reject)

import { useTranslation } from 'react-i18next';
import type { ConfigSetDataDirErrorCode } from '../../../shared/ipc-contracts/config.js';
import './DatasetErrorDialog.css';

export interface DatasetErrorDialogProps {
  errorCode: ConfigSetDataDirErrorCode;
  errorMessage: string;
  errorDetails?:
    | {
        currentDatasetId?: string | undefined;
        newDatasetId?: string | undefined;
        schemaVersion?: number | undefined;
        folderSchemaVersion?: number | undefined;
        appSchemaVersion?: number | undefined;
      }
    | undefined;
  onDismiss: () => void;
  onConfirm?: () => void;
  onPickAnother?: () => void;
}

export function DatasetErrorDialog({
  errorCode,
  errorMessage,
  errorDetails,
  onDismiss,
  onConfirm,
  onPickAnother,
}: DatasetErrorDialogProps): JSX.Element {
  const { t } = useTranslation('common');

  const renderContent = (): JSX.Element => {
    switch (errorCode) {
      case 'DATASET_MISMATCH':
        if (errorDetails?.newDatasetId) {
          // Bypassable workspace switch
          return (
            <>
              <h2 className="ot-dataset-error-dialog__title">
                {t('dataset.errors.DATASET_MISMATCH.switchTitle')}
              </h2>
              <div className="ot-dataset-error-dialog__body">
                <p>{t('dataset.errors.DATASET_MISMATCH.switchBody')}</p>
                <div className="ot-dataset-error-dialog__workspace-ids">
                  <div className="ot-dataset-error-dialog__workspace-row">
                    <span className="ot-dataset-error-dialog__workspace-label">
                      {t('dataset.errors.DATASET_MISMATCH.currentWorkspace')}:
                    </span>
                    <code className="ot-dataset-error-dialog__workspace-id">
                      {errorDetails.currentDatasetId?.slice(0, 8) ?? 'unknown'}...
                    </code>
                  </div>
                  <div className="ot-dataset-error-dialog__workspace-row">
                    <span className="ot-dataset-error-dialog__workspace-label">
                      {t('dataset.errors.DATASET_MISMATCH.newWorkspace')}:
                    </span>
                    <code className="ot-dataset-error-dialog__workspace-id">
                      {errorDetails.newDatasetId.slice(0, 8)}...
                    </code>
                  </div>
                </div>
                <p className="ot-dataset-error-dialog__note">
                  {t('dataset.errors.DATASET_MISMATCH.switchNote')}
                </p>
              </div>
              <div className="ot-dataset-error-dialog__actions">
                <button
                  type="button"
                  className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--secondary"
                  onClick={onDismiss}
                >
                  {t('dataset.errors.DATASET_MISMATCH.cancelButton')}
                </button>
                <button
                  type="button"
                  className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                  onClick={onConfirm}
                >
                  {t('dataset.errors.DATASET_MISMATCH.confirmButton')}
                </button>
              </div>
            </>
          );
        }
        // Foreign folder (events without dataset.json) — hard reject
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.DATASET_MISMATCH.foreignTitle')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.DATASET_MISMATCH.foreignBody')}</p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              {onPickAnother && (
                <button
                  type="button"
                  className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--secondary"
                  onClick={onPickAnother}
                >
                  {t('dataset.errors.DATASET_MISMATCH.pickAnotherButton')}
                </button>
              )}
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );

      case 'SCHEMA_TOO_NEW':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.SCHEMA_TOO_NEW.title')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.SCHEMA_TOO_NEW.body')}</p>
              {errorDetails?.folderSchemaVersion && errorDetails?.appSchemaVersion && (
                <div className="ot-dataset-error-dialog__version-info">
                  <p>
                    {t('dataset.errors.SCHEMA_TOO_NEW.folderVersion', {
                      version: errorDetails.folderSchemaVersion,
                    })}
                  </p>
                  <p>
                    {t('dataset.errors.SCHEMA_TOO_NEW.appVersion', {
                      version: errorDetails.appSchemaVersion,
                    })}
                  </p>
                </div>
              )}
            </div>
            <div className="ot-dataset-error-dialog__actions">
              {onPickAnother && (
                <button
                  type="button"
                  className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--secondary"
                  onClick={onPickAnother}
                >
                  {t('dataset.errors.SCHEMA_TOO_NEW.pickAnotherButton')}
                </button>
              )}
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );

      case 'SCHEMA_TOO_OLD_NO_MIGRATION':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.SCHEMA_TOO_OLD_NO_MIGRATION.title')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.SCHEMA_TOO_OLD_NO_MIGRATION.body')}</p>
              {errorDetails?.folderSchemaVersion && errorDetails?.appSchemaVersion && (
                <div className="ot-dataset-error-dialog__version-info">
                  <p>
                    {t('dataset.errors.SCHEMA_TOO_OLD_NO_MIGRATION.folderVersion', {
                      version: errorDetails.folderSchemaVersion,
                    })}
                  </p>
                  <p>
                    {t('dataset.errors.SCHEMA_TOO_OLD_NO_MIGRATION.appVersion', {
                      version: errorDetails.appSchemaVersion,
                    })}
                  </p>
                </div>
              )}
              <p className="ot-dataset-error-dialog__note">
                {t('dataset.errors.SCHEMA_TOO_OLD_NO_MIGRATION.contactSupport')}
              </p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              {onPickAnother && (
                <button
                  type="button"
                  className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--secondary"
                  onClick={onPickAnother}
                >
                  {t('dataset.errors.SCHEMA_TOO_OLD_NO_MIGRATION.pickAnotherButton')}
                </button>
              )}
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );

      case 'SCHEMA_MIGRATION_AVAILABLE':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.SCHEMA_MIGRATION_AVAILABLE.title')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.SCHEMA_MIGRATION_AVAILABLE.body')}</p>
              {errorDetails?.folderSchemaVersion && errorDetails?.appSchemaVersion && (
                <div className="ot-dataset-error-dialog__version-info">
                  <p>
                    {t('dataset.errors.SCHEMA_MIGRATION_AVAILABLE.folderVersion', {
                      version: errorDetails.folderSchemaVersion,
                    })}
                  </p>
                  <p>
                    {t('dataset.errors.SCHEMA_MIGRATION_AVAILABLE.appVersion', {
                      version: errorDetails.appSchemaVersion,
                    })}
                  </p>
                </div>
              )}
              <p className="ot-dataset-error-dialog__note">
                {t('dataset.errors.SCHEMA_MIGRATION_AVAILABLE.upgradeNote')}
              </p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--secondary"
                onClick={onDismiss}
              >
                {t('dataset.errors.SCHEMA_MIGRATION_AVAILABLE.deferButton')}
              </button>
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onConfirm}
              >
                {t('dataset.errors.SCHEMA_MIGRATION_AVAILABLE.upgradeButton')}
              </button>
            </div>
          </>
        );

      case 'SCHEMA_INVALID':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.SCHEMA_INVALID.title')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.SCHEMA_INVALID.body')}</p>
              <p className="ot-dataset-error-dialog__technical">{errorMessage}</p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );

      case 'DATASET_CORRUPT':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.DATASET_CORRUPT.title')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.DATASET_CORRUPT.body')}</p>
              <p className="ot-dataset-error-dialog__technical">{errorMessage}</p>
              <p className="ot-dataset-error-dialog__note">
                {t('dataset.errors.DATASET_CORRUPT.restoreNote')}
              </p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              {onPickAnother && (
                <button
                  type="button"
                  className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--secondary"
                  onClick={onPickAnother}
                >
                  {t('dataset.errors.DATASET_CORRUPT.pickAnotherButton')}
                </button>
              )}
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );

      case 'INVALID_LOCATION':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.INVALID_LOCATION.title')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.INVALID_LOCATION.body')}</p>
              <p className="ot-dataset-error-dialog__note">
                {t('dataset.errors.INVALID_LOCATION.cloudNote')}
              </p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              {onPickAnother && (
                <button
                  type="button"
                  className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--secondary"
                  onClick={onPickAnother}
                >
                  {t('dataset.errors.INVALID_LOCATION.pickAnotherButton')}
                </button>
              )}
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );

      case 'NOT_WRITABLE':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.NOT_WRITABLE.title')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.NOT_WRITABLE.body')}</p>
              <p className="ot-dataset-error-dialog__technical">{errorMessage}</p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              {onPickAnother && (
                <button
                  type="button"
                  className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--secondary"
                  onClick={onPickAnother}
                >
                  {t('dataset.errors.NOT_WRITABLE.pickAnotherButton')}
                </button>
              )}
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );

      case 'SAME_DIR':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">{t('dataset.errors.SAME_DIR.title')}</h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.SAME_DIR.body')}</p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );

      case 'WRITE_FAILED':
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">
              {t('dataset.errors.WRITE_FAILED.title')}
            </h2>
            <div className="ot-dataset-error-dialog__body">
              <p>{t('dataset.errors.WRITE_FAILED.body')}</p>
              <p className="ot-dataset-error-dialog__technical">{errorMessage}</p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.retry')}
              </button>
            </div>
          </>
        );

      default:
        // Fallback for any unexpected error code
        return (
          <>
            <h2 className="ot-dataset-error-dialog__title">{t('dataset.errors.generic.title')}</h2>
            <div className="ot-dataset-error-dialog__body">
              <p>
                {t('dataset.errors.generic.body')}: {errorCode}
              </p>
              <p className="ot-dataset-error-dialog__technical">{errorMessage}</p>
            </div>
            <div className="ot-dataset-error-dialog__actions">
              <button
                type="button"
                className="ot-dataset-error-dialog__button ot-dataset-error-dialog__button--primary"
                onClick={onDismiss}
              >
                {t('common.close')}
              </button>
            </div>
          </>
        );
    }
  };

  return (
    <div
      className="ot-dataset-error-dialog__overlay"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
    >
      <div className="ot-dataset-error-dialog__modal" onClick={(e) => e.stopPropagation()}>
        {renderContent()}
      </div>
    </div>
  );
}
