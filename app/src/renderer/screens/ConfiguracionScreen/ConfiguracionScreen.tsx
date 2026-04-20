import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CuentasTab } from './CuentasTab.js';
import { CategoriasTab } from './CategoriasTab.js';
import { EtiquetasTab } from './EtiquetasTab.js';
import { DatosTab } from './DatosTab.js';
import './ConfiguracionScreen.css';

type TabId = 'cuentas' | 'categorias' | 'etiquetas' | 'datos';

const TABS: readonly { readonly id: TabId; readonly labelKey: string }[] = [
  { id: 'cuentas', labelKey: 'configuracion.tabs.cuentas' },
  { id: 'categorias', labelKey: 'configuracion.tabs.categorias' },
  { id: 'etiquetas', labelKey: 'configuracion.tabs.etiquetas' },
  { id: 'datos', labelKey: 'configuracion.tabs.datos' },
];

export interface ConfiguracionScreenProps {
  /** Fires whenever any tab's list mutates (create). The MovementsScreen
   *  listens for this so the Add-Transaction modal hydrates fresh data. */
  readonly onConfigChanged?: () => void;
  readonly initialTab?: TabId;
}

/**
 * WI-15-lite — Configuración screen.
 * Three tabs (Cuentas / Categorías / Etiquetas) each with list + "+ Añadir".
 * CSS-tab pattern with `role="tablist"` + `role="tab"` + `aria-selected`.
 */
export function ConfiguracionScreen({
  onConfigChanged,
  initialTab = 'cuentas',
}: ConfiguracionScreenProps): JSX.Element {
  const { t } = useTranslation('common');
  const [active, setActive] = useState<TabId>(initialTab);

  return (
    <div className="ot-config">
      <header className="ot-page-header">
        <div>
          <h1>{t('configuracion.title')}</h1>
          <p className="ot-page-header__subtitle">{t('configuracion.subtitle')}</p>
        </div>
      </header>

      <div className="ot-config__tabs" role="tablist" aria-label={t('configuracion.tabs.label')}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`config-tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`config-panel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            className="ot-config__tab"
            onClick={() => setActive(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <section
        role="tabpanel"
        id={`config-panel-${active}`}
        aria-labelledby={`config-tab-${active}`}
      >
        {active === 'cuentas' ? (
          <CuentasTab onListChanged={onConfigChanged} />
        ) : active === 'categorias' ? (
          <CategoriasTab onListChanged={onConfigChanged} />
        ) : active === 'etiquetas' ? (
          <EtiquetasTab onListChanged={onConfigChanged} />
        ) : (
          <DatosTab onImportComplete={onConfigChanged} />
        )}
      </section>
    </div>
  );
}
