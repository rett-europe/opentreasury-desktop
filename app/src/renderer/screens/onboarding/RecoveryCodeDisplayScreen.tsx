import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RecoveryCodeGrid } from '../../components/onboarding';
import './FreshSetupFlow.css';

interface RecoveryCodeDisplayScreenProps {
  mnemonic: string;
  onNext: () => void;
}

export function RecoveryCodeDisplayScreen({ mnemonic, onNext }: RecoveryCodeDisplayScreenProps) {
  const { t } = useTranslation('common');

  const handlePrint = useCallback(() => {
    // Stub: call window.print() for now (spec says implement later)
    window.print();
  }, []);

  const handleSavePdf = useCallback(() => {
    // Stub: implement later (spec says implement later)
    console.log('Save as PDF - not implemented yet');
  }, []);

  return (
    <div className="ot-onboarding-screen">
      <div className="ot-onboarding-screen__content">
        <h1 className="ot-onboarding-screen__title">{t('onboarding.encryption.show.title')}</h1>
        <p className="ot-onboarding-screen__body">{t('onboarding.encryption.show.body')}</p>

        <RecoveryCodeGrid
          mnemonic={mnemonic}
          caption={t('onboarding.encryption.show.grid_caption')}
          onPrint={handlePrint}
          onSavePdf={handleSavePdf}
          onConfirm={onNext}
          confirmLabel={t('onboarding.encryption.show.btn_written')}
        />
      </div>
    </div>
  );
}
