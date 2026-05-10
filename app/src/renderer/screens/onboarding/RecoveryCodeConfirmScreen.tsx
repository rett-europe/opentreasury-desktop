import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { WordConfirmChallenge } from '../../components/onboarding';
import './FreshSetupFlow.css';

interface RecoveryCodeConfirmScreenProps {
  mnemonic: string;
  onConfirm: () => void;
}

export function RecoveryCodeConfirmScreen({ mnemonic, onConfirm }: RecoveryCodeConfirmScreenProps) {
  const { t } = useTranslation('common');
  const [isValid, setIsValid] = useState(false);

  const handleValidityChange = useCallback((valid: boolean) => {
    setIsValid(valid);
  }, []);

  return (
    <div className="ot-onboarding-screen">
      <div className="ot-onboarding-screen__content">
        <h1 className="ot-onboarding-screen__title">{t('onboarding.encryption.confirm.title')}</h1>
        <p className="ot-onboarding-screen__body">{t('onboarding.encryption.confirm.prompt')}</p>

        <WordConfirmChallenge mnemonic={mnemonic} onValidityChange={handleValidityChange} />

        <p className="ot-onboarding-screen__footer-note">
          {t('onboarding.encryption.confirm.footer')}
        </p>

        <div className="ot-onboarding-screen__actions">
          <button
            type="button"
            className="ot-onboarding-screen__btn ot-onboarding-screen__btn--primary"
            onClick={onConfirm}
            disabled={!isValid}
          >
            {t('onboarding.encryption.confirm.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
