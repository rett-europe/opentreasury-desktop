import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import './FreshSetupFlow.css';

interface FolderPickerScreenProps {
  onNext: (folderPath: string) => void;
}

export function FolderPickerScreen({ onNext }: FolderPickerScreenProps) {
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
              {t('onboarding.encryption.folder.continue')}\n{' '}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
