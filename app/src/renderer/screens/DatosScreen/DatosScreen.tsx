import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { ImportWizard } from '../../components/ImportWizard/index.js';
import './DatosScreen.css';

export interface DatosScreenProps {
  readonly onImportComplete?: (() => void) | undefined;
}

/**
 * DATOS screen (top-level route). Entry point for bank-statement import.
 * Promoted out of Configuración tabs after WI-17 review (see decision
 * `trinity-datos-top-level-route.md`). Export is deferred.
 */
export function DatosScreen({ onImportComplete }: DatosScreenProps): JSX.Element {
  const { t } = useTranslation('common');
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleComplete = () => {
    setWizardOpen(false);
    onImportComplete?.();
  };

  return (
    <div className="ot-datos">
      <header className="ot-page-header">
        <div>
          <h1>{t('datos.title')}</h1>
          <p className="ot-page-header__subtitle">{t('datos.subtitle')}</p>
        </div>
      </header>

      <div className="ot-datos__actions">
        <h2 className="ot-datos__heading">{t('datos.heading')}</h2>
        <Button
          variant="primary"
          size="md"
          leadingIcon={<Upload size={16} />}
          onClick={() => setWizardOpen(true)}
        >
          {t('datos.importCta')}
        </Button>
      </div>

      <EmptyState
        icon={<Upload size={32} aria-hidden="true" />}
        title={t('datos.empty.title')}
        body={t('datos.empty.body')}
        actions={
          <Button
            variant="primary"
            leadingIcon={<Upload size={16} />}
            onClick={() => setWizardOpen(true)}
          >
            {t('datos.importCta')}
          </Button>
        }
      />

      {wizardOpen ? (
        <ImportWizard
          isOpen={wizardOpen}
          onClose={() => setWizardOpen(false)}
          onComplete={handleComplete}
        />
      ) : null}
    </div>
  );
}
