import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CuentasTab } from './CuentasTab.js';
import { CategoriasTab } from './CategoriasTab.js';
import { EtiquetasTab } from './EtiquetasTab.js';
import './ConfiguracionScreen.css';

export type ConfigTabId = 'cuentas' | 'categorias' | 'etiquetas';

const TABS: readonly { readonly id: ConfigTabId; readonly labelKey: string }[] = [
  { id: 'categorias', labelKey: 'configuracion.tabs.categorias' },
  { id: 'etiquetas', labelKey: 'configuracion.tabs.etiquetas' },
  { id: 'cuentas', labelKey: 'configuracion.tabs.cuentas' },
];

export interface ConfiguracionScreenProps {
  /** Fires whenever any tab's list mutates (create). The MovementsScreen
   *  listens for this so the Add-Transaction modal hydrates fresh data. */
  readonly onConfigChanged?: () => void;
  readonly initialTab?: ConfigTabId;
  /** Keep the AppShell route in sync when user clicks an internal tab. */
  readonly onTabChange?: (tab: ConfigTabId) => void;
}

/**
 * WI-15-lite — Configuración screen (PR#2 parity 2026-04-21).
 * Three tabs (Categorías / Etiquetas / Cuentas) each with list + "+ Añadir".
 * Tabs are now mirrored as sidebar sub-routes; the tab strip stays for quick
 * in-screen switching and deep-link fallback.
 */
export function ConfiguracionScreen({
  onConfigChanged,
  initialTab = 'categorias',
  onTabChange,
}: ConfiguracionScreenProps): JSX.Element {
  const { t } = useTranslation('common');
  const [active, setActive] = useState<ConfigTabId>(initialTab);

  useEffect(() => {
    setActive(initialTab);
  }, [initialTab]);

  const handleSelect = (id: ConfigTabId): void => {
    setActive(id);
    onTabChange?.(id);
  };

  return (
    <div className="ot-config">
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
            onClick={() => handleSelect(tab.id)}
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
        ) : (
          <EtiquetasTab onListChanged={onConfigChanged} />
        )}
      </section>
    </div>
  );
}
