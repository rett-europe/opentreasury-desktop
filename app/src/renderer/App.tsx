import { useCallback, useState } from 'react';
import { AppShell } from './screens/AppShell/index.js';
import type { Route } from './screens/AppShell/index.js';
import { ConfiguracionScreen } from './screens/ConfiguracionScreen/index.js';
import { DatosScreen } from './screens/DatosScreen/index.js';
import { InsightsScreen } from './screens/InsightsScreen/index.js';
import { InsightsDetailScreen } from './screens/InsightsDetailScreen/index.js';
import { MovementsScreen } from './screens/MovementsScreen/index.js';
import { PanelScreen } from './screens/PanelScreen/index.js';
import { SaldoScreen } from './screens/SaldoScreen/index.js';
import { thisYear } from './utils/datePresets.js';

/**
 * App entry — wires AppShell (UX-006) around the current route.
 *
 * PR#2 parity (2026-04-21) — the Configuración section now exposes three
 * sibling routes ('cuentas' / 'categorias' / 'etiquetas'). The single
 * 'configuracion' route was replaced; ConfiguracionScreen receives the active
 * sub-tab via `initialTab` so its internal tab strip still works for users who
 * deep-link to one sub-route and want to jump to another without touching the
 * sidebar.
 *
 * Insights drilldown (UX-005 PR 4b/4) — a real router still hasn't landed,
 * so the drilldown route ('insights-detail') is encoded as `Route` plus a
 * separate `insightsDetail` state slice carrying `{ tagIds, windowStart,
 * windowEnd }`. Same pattern is used for the Movimientos pre-filter handoff
 * (`movementsInitialFilters`) when the user follows the drilldown's "Ver
 * todos los movimientos →" footer link (locked by spec OQ-3). When a real
 * router lands, both slices collapse into route params.
 */
type InsightsDetailState = {
  readonly tagIds: ReadonlyArray<string>;
  readonly windowStart: string;
  readonly windowEnd: string;
};

type MovementsInitialFilters = {
  readonly tagIds?: ReadonlyArray<string>;
  readonly windowStart?: string;
  readonly windowEnd?: string;
};

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('panel');
  const [configRevision, setConfigRevision] = useState(0);
  const [insightsDetail, setInsightsDetail] = useState<InsightsDetailState | null>(null);
  const [movementsInitialFilters, setMovementsInitialFilters] =
    useState<MovementsInitialFilters | null>(null);

  // SPEC-024 — Search query state
  const [searchQuery, setSearchQuery] = useState<string>('');

  const bumpConfigRevision = useCallback(() => {
    setConfigRevision((n) => n + 1);
  }, []);

  // Navigation helpers crossing screens.
  const navigateToInsightsDetail = useCallback((next: InsightsDetailState) => {
    setInsightsDetail(next);
    setRoute('insights-detail');
  }, []);

  const navigateBackToInsights = useCallback(() => {
    setInsightsDetail(null);
    setRoute('insights');
  }, []);

  const navigateToMovementsWithFilters = useCallback((filters: MovementsInitialFilters) => {
    setMovementsInitialFilters(filters);
    setRoute('movements');
  }, []);

  const handleNavigate = useCallback((next: Route) => {
    // Switching routes via the sidebar clears any in-flight pre-applied
    // filters from cross-screen handoffs so they don't bleed across visits.
    setMovementsInitialFilters(null);
    if (next !== 'insights-detail') {
      setInsightsDetail(null);
    }
    // SPEC-024 — Clear search when navigating away from movements
    if (next !== 'movements') {
      setSearchQuery('');
    }
    setRoute(next);
  }, []);

  const isConfigRoute = route === 'cuentas' || route === 'categorias' || route === 'etiquetas';

  const renderInsightsDetail = (): JSX.Element => {
    if (insightsDetail && insightsDetail.tagIds.length > 0) {
      return (
        <InsightsDetailScreen
          tagIds={insightsDetail.tagIds}
          initialWindow={{
            windowStart: insightsDetail.windowStart,
            windowEnd: insightsDetail.windowEnd,
          }}
          onBack={navigateBackToInsights}
          onTagsChange={(nextTagIds) => {
            if (nextTagIds.length === 0) {
              navigateBackToInsights();
              return;
            }
            setInsightsDetail({
              tagIds: nextTagIds,
              windowStart: insightsDetail.windowStart,
              windowEnd: insightsDetail.windowEnd,
            });
          }}
          onSeeAllMovements={(filters) => navigateToMovementsWithFilters(filters)}
        />
      );
    }
    // Defensive fallback — bare detail route with no state means we shouldn't
    // be here. Send the user back to the landing.
    return (
      <InsightsScreen
        onTagSelect={(tagId) => {
          const range = thisYear(new Date());
          navigateToInsightsDetail({
            tagIds: [tagId],
            windowStart: range.from,
            windowEnd: range.to,
          });
        }}
      />
    );
  };

  return (
    <AppShell
      currentRoute={route}
      onNavigate={handleNavigate}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
    >
      {route === 'movements' ? (
        <MovementsScreen
          configRevision={configRevision}
          searchQuery={searchQuery}
          {...(movementsInitialFilters ? { initialFilters: movementsInitialFilters } : {})}
        />
      ) : route === 'panel' ? (
        <PanelScreen />
      ) : route === 'insights' ? (
        <InsightsScreen
          onTagSelect={(tagId) => {
            const range = thisYear(new Date());
            navigateToInsightsDetail({
              tagIds: [tagId],
              windowStart: range.from,
              windowEnd: range.to,
            });
          }}
        />
      ) : route === 'insights-detail' ? (
        renderInsightsDetail()
      ) : isConfigRoute ? (
        <ConfiguracionScreen onConfigChanged={bumpConfigRevision} initialTab={route} />
      ) : route === 'datos' ? (
        <DatosScreen
          onImportComplete={bumpConfigRevision}
          onNavigateToMovements={() => setRoute('movements')}
        />
      ) : (
        <SaldoScreen />
      )}
    </AppShell>
  );
}
