import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RecoveryCodeInput } from '../../components/onboarding';
import { mockWorkspaceIpc } from '../../mocks/workspaceIpc';
import './RecoveryFlow.css';

interface RecoveryFlowProps {
  onComplete: () => void;
}

/**
 * Recovery flow (1 step):
 * - 12-word entry, calls workspace:recover
 * - Same error handling as join: inline error, no lockout, help link after 5 attempts (AC7)
 */
export function RecoveryFlow({ onComplete }: RecoveryFlowProps) {
  const { t } = useTranslation('common');
  const [mnemonic, setMnemonic] = useState<string>('');
  const [isMnemonicValid, setIsMnemonicValid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleMnemonicChange = useCallback((mnem: string) => {
    setMnemonic(mnem);
  }, []);

  const handleMnemonicValidityChange = useCallback((valid: boolean) => {
    setIsMnemonicValid(valid);
  }, []);

  const handleUnlock = useCallback(async () => {
    if (!isMnemonicValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await mockWorkspaceIpc.recover({ mnemonic });

      if (!response.ok) {
        setError(response.error.message);
        setIsSubmitting(false);

        // Show help link after 5 attempts (AC7)
        const attempts = mockWorkspaceIpc.__getFailedAttempts();
        if (attempts >= 5) {
          setError(response.error.message + ' ' + t('recovery.help_after_5'));
        }
        return;
      }

      onComplete();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setIsSubmitting(false);
    }
  }, [mnemonic, isMnemonicValid, onComplete, t]);

  return (
    <div className="ot-onboarding-screen">
      <div className="ot-onboarding-screen__content">
        <h1 className="ot-onboarding-screen__title">{t('recovery.title')}</h1>
        <p className="ot-onboarding-screen__body">{t('recovery.body')}</p>

        <RecoveryCodeInput
          onChange={handleMnemonicChange}
          onValidityChange={handleMnemonicValidityChange}
          errorText={error || undefined}
        />

        <div className="ot-onboarding-screen__actions">
          <button
            type="button"
            className="ot-onboarding-screen__btn ot-onboarding-screen__btn--primary"
            onClick={handleUnlock}
            disabled={!isMnemonicValid || isSubmitting}
          >
            {isSubmitting ? t('recovery.unlocking') : t('recovery.unlock')}
          </button>
        </div>
      </div>
    </div>
  );
}
