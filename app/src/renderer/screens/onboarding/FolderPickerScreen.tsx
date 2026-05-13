import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './FreshSetupFlow.css';

interface FolderPickerScreenProps {
  onNext: (folderPath: string) => void;
  /**
   * SPEC-026 cleanup — when true, render a quiet hint that a legacy
   * unencrypted file was found in the chosen folder and will be ignored.
   */
  hadLegacyFile?: boolean;
}

export function FolderPickerScreen({ onNext, hadLegacyFile = false }: FolderPickerScreenProps) {
  const { t } = useTranslation('common');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBrowse = useCallback(async () => {
    setError(null);
    try {
      const result = await window.opentreasury.dialog.pickFolder();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.path) {
        setSelectedPath(result.path);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (selectedPath) {
      onNext(selectedPath);
    }
  }, [selectedPath, onNext]);

  return (
    <div className="ot-onboarding-screen">
      <div className="ot-onboarding-screen__content">
        <h1 className="ot-onboarding-screen__title">{t('onboarding.encryption.folder.title')}</h1>
        <p className="ot-onboarding-screen__body">{t('onboarding.encryption.folder.body')}</p>

        {selectedPath && (
          <div className="ot-onboarding-screen__selected-path">
            <strong>Selected:</strong> {selectedPath}
          </div>
        )}

        {error && (
          <div className="ot-onboarding-screen__error" role="alert">
            {error}
          </div>
        )}

        <div className="ot-onboarding-screen__actions">
          <button
            type="button"
            className="ot-onboarding-screen__btn ot-onboarding-screen__btn--secondary"
            onClick={handleBrowse}
          >
            {t('onboarding.encryption.folder.btn_choose')}
          </button>
          {selectedPath && (
            <button
              type="button"
              className="ot-onboarding-screen__btn ot-onboarding-screen__btn--primary"
              onClick={handleNext}
            >
              {t('onboarding.encryption.folder.continue')}
            </button>
          )}
        </div>

        {hadLegacyFile && (
          <p className="ot-onboarding-screen__footer-note">
            {t('onboarding.encryption.folder.legacy_file_hint')}
          </p>
        )}
      </div>
    </div>
  );
}
