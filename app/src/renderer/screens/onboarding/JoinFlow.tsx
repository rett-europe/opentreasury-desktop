import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RecoveryCodeInput } from '../../components/onboarding';
import './JoinFlow.css';

type Step = 'entry' | 'success';

interface JoinFlowProps {
  initialFolderPath?: string;
  onComplete: () => void;
}

/**
 * Join flow (2 steps):
 * 1. Folder picker + 12-word entry + device label input
 * 2. Success screen
 *
 * Inline error on invalid mnemonic, no lockout, after 5 attempts show help link (AC7).
 */
export function JoinFlow({ initialFolderPath, onComplete }: JoinFlowProps) {
  const { t } = useTranslation('common');
  const [step, setStep] = useState<Step>('entry');
  const [folderPath, setFolderPath] = useState<string | null>(initialFolderPath || null);
  const [mnemonic, setMnemonic] = useState<string>('');
  const [deviceLabel, setDeviceLabel] = useState<string>('');
  const [isMnemonicValid, setIsMnemonicValid] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBrowse = useCallback(async () => {
    setError(null);
    try {
      const result = await window.opentreasury.dialog.pickFolder();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.path) {
        setFolderPath(result.path);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, []);

  const handleMnemonicChange = useCallback((mnem: string) => {
    setMnemonic(mnem);
  }, []);

  const handleMnemonicValidityChange = useCallback((valid: boolean) => {
    setIsMnemonicValid(valid);
  }, []);

  const handleJoin = useCallback(async () => {
    if (!folderPath || !isMnemonicValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await window.opentreasury.workspace.enroll({
        folderPath,
        mnemonic,
        deviceLabel: deviceLabel || undefined,
      });

      if (!response.ok) {
        const nextAttempts = failedAttempts + 1;
        setFailedAttempts(nextAttempts);
        setIsSubmitting(false);

        // Show help link after 5 attempts (AC7)
        if (nextAttempts >= 5) {
          setError(response.error.message + ' ' + t('onboarding.join.help_after_5'));
        } else {
          setError(response.error.message);
        }
        return;
      }

      setStep('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setIsSubmitting(false);
    }
  }, [folderPath, mnemonic, deviceLabel, isMnemonicValid, failedAttempts, t]);

  if (step === 'success') {
    return (
      <div className="ot-onboarding-screen">
        <div className="ot-onboarding-screen__content">
          <h1 className="ot-onboarding-screen__title">{t('onboarding.join.success.title')}</h1>
          <p className="ot-onboarding-screen__body">{t('onboarding.join.success.body')}</p>
          <div className="ot-onboarding-screen__actions">
            <button
              type="button"
              className="ot-onboarding-screen__btn ot-onboarding-screen__btn--primary"
              onClick={onComplete}
            >
              {t('onboarding.join.success.continue')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ot-onboarding-screen">
      <div className="ot-onboarding-screen__content">
        <h1 className="ot-onboarding-screen__title">{t('onboarding.join.title')}</h1>
        <p className="ot-onboarding-screen__body">{t('onboarding.join.body')}</p>

        <div className="ot-join-flow__folder-section">
          {folderPath ? (
            <div className="ot-onboarding-screen__selected-path">
              <strong>Folder:</strong> {folderPath}
            </div>
          ) : (
            <button
              type="button"
              className="ot-onboarding-screen__btn ot-onboarding-screen__btn--secondary"
              onClick={handleBrowse}
            >
              {t('onboarding.join.btn_folder')}
            </button>
          )}
        </div>

        <RecoveryCodeInput
          label={t('onboarding.join.mnemonic_label')}
          onChange={handleMnemonicChange}
          onValidityChange={handleMnemonicValidityChange}
          errorText={error || undefined}
        />

        <div className="ot-join-flow__device-label">
          <label htmlFor="device-label">{t('onboarding.join.label_prompt')}</label>
          <input
            id="device-label"
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder="This device"
            className="ot-join-flow__device-label-input"
          />
        </div>

        <div className="ot-onboarding-screen__actions">
          <button
            type="button"
            className="ot-onboarding-screen__btn ot-onboarding-screen__btn--primary"
            onClick={handleJoin}
            disabled={!folderPath || !isMnemonicValid || isSubmitting}
          >
            {isSubmitting ? t('onboarding.join.joining') : t('onboarding.join.btn_join')}
          </button>
        </div>
      </div>
    </div>
  );
}
