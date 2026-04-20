import { useCallback, useState } from 'react';
import { AppShell } from './screens/AppShell/index.js';
import type { Route } from './screens/AppShell/index.js';
import { ConfiguracionScreen } from './screens/ConfiguracionScreen/index.js';
import { DatosScreen } from './screens/DatosScreen/index.js';
import { MovementsScreen } from './screens/MovementsScreen/index.js';
import { PanelScreen } from './screens/PanelScreen/index.js';
import { SaldoScreen } from './screens/SaldoScreen/index.js';

/**
 * App entry — wires AppShell (UX-006) around the current route. Routes in
 * scope: Panel (default, per Pedro), Movimientos, Saldo, Configuración.
 *
 * `configRevision` is a monotonically-increasing counter bumped whenever the
 * Configuración screen creates an account/category/tag. MovementsScreen keys
 * its reference-data fetch on this value so its selects hydrate fresh data
 * without page reload (WI-15-lite integration).
 *
 * No router library at v0.1 — a single useState is sufficient and keeps the
 * bundle small. Wire React Router or TanStack Router when deep-linking /
 * history becomes a requirement.
 */
export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('panel');
  const [configRevision, setConfigRevision] = useState(0);

  const bumpConfigRevision = useCallback(() => {
    setConfigRevision((n) => n + 1);
  }, []);

  return (
    <AppShell currentRoute={route} onNavigate={setRoute}>
      {route === 'movements' ? (
        <MovementsScreen configRevision={configRevision} />
      ) : route === 'panel' ? (
        <PanelScreen />
      ) : route === 'configuracion' ? (
        <ConfiguracionScreen onConfigChanged={bumpConfigRevision} />
      ) : route === 'datos' ? (
        <DatosScreen onImportComplete={bumpConfigRevision} />
      ) : (
        <SaldoScreen />
      )}
    </AppShell>
  );
}
