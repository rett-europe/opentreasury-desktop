import { useTranslation } from 'react-i18next';
import './FreshSetupFlow.css';

interface SetupCompleteScreenProps {
  onContinue: () => void;
}

export function SetupCompleteScreen({ onContinue }: SetupCompleteScreenProps) {
  const { t } = useTranslation('common');

  return (
    <div className="ot-onboarding-screen">
      <div className="ot-onboarding-screen__content">
        <h1 className="ot-onboarding-screen__title">{t('onboarding.encryption.done.title')}</h1>
        <p className="ot-onboarding-screen__body">{t('onboarding.encryption.done.body')}</p>

        <div className="ot-onboarding-screen__actions">
          <button
            type="button"
            className="ot-onboarding-screen__btn ot-onboarding-screen__btn--primary"
            onClick={onContinue}
          >
            {t('onboarding.encryption.done.continue')}
          </button>
        </div>
      </div>
    </div>
  );
}
