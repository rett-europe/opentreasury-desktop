import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { ImportWizard } from '../../components/ImportWizard/index.js';

export interface DatosTabProps {
  readonly onImportComplete?: (() => void) | undefined;
}

/**
 * DATOS tab (WI-17) — import/export entry point.
 * Currently only shows import wizard trigger. Export deferred.
 */
export function DatosTab({ onImportComplete }: DatosTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [wizardOpen, setWizardOpen] = useState(false);

  const handleComplete = () => {
    setWizardOpen(false);
    onImportComplete?.();
  };

  return (
    <>
      <div className="ot-config__tab-actions">
        <h2 className="ot-config__tab-title">{t('configuracion.datos.heading')}</h2>
        <Button
          variant="primary"
          size="md"
          leadingIcon={<Upload size={16} />}
          onClick={() => setWizardOpen(true)}
        >
          {t('configuracion.datos.importCta')}
        </Button>
      </div>

      <EmptyState
        icon={<Upload size={32} aria-hidden="true" />}
        title={t('configuracion.datos.empty.title')}
        body={t('configuracion.datos.empty.body')}
        actions={
          <Button
            variant="primary"
            leadingIcon={<Upload size={16} />}
            onClick={() => setWizardOpen(true)}
          >
            {t('configuracion.datos.importCta')}
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
    </>
  );
}
