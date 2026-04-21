import { CuentasTab } from './CuentasTab.js';
import { CategoriasTab } from './CategoriasTab.js';
import { EtiquetasTab } from './EtiquetasTab.js';
import './ConfiguracionScreen.css';

export type ConfigTabId = 'cuentas' | 'categorias' | 'etiquetas';

export interface ConfiguracionScreenProps {
  /** Fires whenever any tab's list mutates (create). The MovementsScreen
   *  listens for this so the Add-Transaction modal hydrates fresh data. */
  readonly onConfigChanged?: () => void;
  /**
   * The active config sub-route, selected from the sidebar. Each of the three
   * config entities is a sibling top-level route — there is no internal tab
   * chrome anymore, the screen simply renders the matching sub-tab's content.
   */
  readonly initialTab?: ConfigTabId;
  /**
   * Retained for API stability with AppShell. With the sidebar owning the
   * active route there is nothing for the screen itself to report back today,
   * but the prop lets us re-introduce in-screen navigation without churning
   * callers if we ever want to.
   */
  readonly onTabChange?: (tab: ConfigTabId) => void;
}

/**
 * WI-15-lite — Configuración screen (PR#2 parity, round 2).
 *
 * The sidebar exposes Categorías / Etiquetas / Cuentas as sibling routes, so
 * this screen is a pure render-by-route host: no internal tab strip, no
 * role="tablist" chrome. Each sub-route renders its own standalone page.
 */
export function ConfiguracionScreen({
  onConfigChanged,
  initialTab = 'categorias',
}: ConfiguracionScreenProps): JSX.Element {
  return (
    <div className="ot-config">
      {initialTab === 'cuentas' ? (
        <CuentasTab onListChanged={onConfigChanged} />
      ) : initialTab === 'categorias' ? (
        <CategoriasTab onListChanged={onConfigChanged} />
      ) : (
        <EtiquetasTab onListChanged={onConfigChanged} />
      )}
    </div>
  );
}
