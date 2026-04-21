import { useCallback, useState } from 'react';
import { AppShell } from './screens/AppShell/index.js';
import type { Route } from './screens/AppShell/index.js';
import { ConfiguracionScreen } from './screens/ConfiguracionScreen/index.js';
import { DatosScreen } from './screens/DatosScreen/index.js';
import { MovementsScreen } from './screens/MovementsScreen/index.js';
import { PanelScreen } from './screens/PanelScreen/index.js';
import { SaldoScreen } from './screens/SaldoScreen/index.js';

/**
 * App entry — wires AppShell (UX-006) around the current route.
 *
 * PR#2 parity (2026-04-21) — the Configuración section now exposes three
 * sibling routes ('cuentas' / 'categorias' / 'etiquetas'). The single
 * 'configuracion' route was replaced; ConfiguracionScreen receives the active
 * sub-tab via `initialTab` so its internal tab strip still works for users who
 * deep-link to one sub-route and want to jump to another without touching the
 * sidebar.
 */
export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('panel');
  const [configRevision, setConfigRevision] = useState(0);

  const bumpConfigRevision = useCallback(() => {
    setConfigRevision((n) => n + 1);
  }, []);

  const isConfigRoute = route === 'cuentas' || route === 'categorias' || route === 'etiquetas';

  return (
    <AppShell currentRoute={route} onNavigate={setRoute}>
      {route === 'movements' ? (
        <MovementsScreen configRevision={configRevision} />
      ) : route === 'panel' ? (
        <PanelScreen />
      ) : isConfigRoute ? (
        <ConfiguracionScreen
          onConfigChanged={bumpConfigRevision}
          initialTab={route}
          onTabChange={setRoute}
        />
      ) : route === 'datos' ? (
        <DatosScreen onImportComplete={bumpConfigRevision} />
      ) : (
        <SaldoScreen />
      )}
    </AppShell>
  );
}
