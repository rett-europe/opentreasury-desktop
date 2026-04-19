import { useState } from 'react';
import { AppShell } from './screens/AppShell/index.js';
import type { Route } from './screens/AppShell/index.js';
import { MovementsScreen } from './screens/MovementsScreen/index.js';
import { ComingSoonScreen } from './screens/ComingSoonScreen/index.js';

/**
 * App entry — wires AppShell (UX-006) around the current route. M1 routes in
 * scope: Movimientos (UX-003). Panel and Saldo show ComingSoon placeholders
 * until their screens ship.
 *
 * No router library at v0.1 — a single useState is sufficient for the 3-route
 * shell and keeps the bundle small. Wire React Router or TanStack Router when
 * deep-linking / history becomes a requirement.
 */
export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('movements');

  return (
    <AppShell currentRoute={route} onNavigate={setRoute}>
      {route === 'movements' ? (
        <MovementsScreen />
      ) : route === 'panel' ? (
        <ComingSoonScreen />
      ) : (
        <ComingSoonScreen />
      )}
    </AppShell>
  );
}
