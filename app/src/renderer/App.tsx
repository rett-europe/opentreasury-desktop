import { useCallback, useEffect, useState } from 'react';
import { AppShell } from './screens/AppShell/index.js';
import type { Route } from './screens/AppShell/index.js';
import { ConfiguracionScreen } from './screens/ConfiguracionScreen/index.js';
import { DatosScreen } from './screens/DatosScreen/index.js';
import { ExportScreen } from './screens/ExportScreen/index.js';
import { InsightsScreen } from './screens/InsightsScreen/index.js';
import { InsightsDetailScreen } from './screens/InsightsDetailScreen/index.js';
import { MovementsScreen } from './screens/MovementsScreen/index.js';
import { OnboardingScreen } from './screens/OnboardingScreen/index.js';
import { PanelScreen } from './screens/PanelScreen/index.js';
import { SaldoScreen } from './screens/SaldoScreen/index.js';
import { PreferencesScreen } from './screens/PreferencesScreen/index.js';
import { BootErrorPage, type BootErrorDetails } from './screens/BootErrorPage/index.js';
import { FreshSetupFlow, JoinFlow, RecoveryFlow } from './screens/onboarding/index.js';
import type { WorkspaceState } from '../shared/ipc-contracts/workspace.js';
import { thisMonth, thisYear } from './utils/datePresets.js';

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
  readonly accountId?: string;
};

export function App(): JSX.Element {
  const [route, setRoute] = useState<Route>('panel');
  const [configRevision, setConfigRevision] = useState(0);
  const [insightsDetail, setInsightsDetail] = useState<InsightsDetailState | null>(null);
  const [movementsInitialFilters, setMovementsInitialFilters] =
    useState<MovementsInitialFilters | null>(null);

  // SPEC-024 — Search query state
  const [searchQuery, setSearchQuery] = useState<string>('');

  // #196 — First-run onboarding gate. `null` = unknown (probe in flight),
  // `true` = show the wizard before mounting AppShell, `false` = main app.
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  // #242 — Boot error gate. If bootstrap/hydration failed, show BootErrorPage.
  const [bootError, setBootError] = useState<BootErrorDetails | null>(null);

  // SPEC-026 — Workspace state after onboarding. `null` = detecting in flight.
  // `ready` means workspace is unlocked and the main AppShell can render.
  type WorkspaceRoutingState = WorkspaceState | 'ready';
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceRoutingState | null>(null);
  const [workspaceFolderPath, setWorkspaceFolderPath] = useState<string | undefined>(undefined);
  // SPEC-026 cleanup — surfaced to FreshSetupFlow so it can show a quiet hint
  // when the chosen folder still contains a stray legacy `events.ndjson`.
  const [workspaceHadLegacyFile, setWorkspaceHadLegacyFile] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        // Check boot status first — if boot failed, we can't proceed
        const bootStatus = await window.opentreasury.boot.getStatus();
        if (cancelled) return;

        if (!bootStatus.ok) {
          setBootError({
            code: bootStatus.error.code,
            message: bootStatus.error.message,
            ...(bootStatus.error.filePath ? { filePath: bootStatus.error.filePath } : {}),
            ...(bootStatus.error.folderSchemaVersion
              ? { folderSchemaVersion: bootStatus.error.folderSchemaVersion }
              : {}),
            ...(bootStatus.error.appSchemaVersion
              ? { appSchemaVersion: bootStatus.error.appSchemaVersion }
              : {}),
          });
          setNeedsOnboarding(false); // Not onboarding if boot failed
          return;
        }

        // Boot succeeded — check if we need onboarding
        const response = await window.opentreasury.onboarding.getStatus();
        if (cancelled) return;

        if (response.needsOnboarding) {
          setNeedsOnboarding(true);
          return;
        }

        setNeedsOnboarding(false);

        // SPEC-026 — Workspace detection. Determines which onboarding screen
        // (or silent unlock) to show before the main AppShell.
        try {
          const detectResult = await window.opentreasury.workspace.detect();
          if (cancelled) return;

          if (!detectResult.ok) {
            // Detection failed — fall through to AppShell rather than blocking.
            // eslint-disable-next-line no-console
            console.warn('[App] workspace:detect failed:', detectResult.error.message);
            setWorkspaceStatus('ready');
            return;
          }

          const { state, folderPath } = detectResult;
          setWorkspaceFolderPath(folderPath);
          setWorkspaceHadLegacyFile(detectResult.hadLegacyFile === true);

          if (state === 'unlock') {
            // Attempt silent unlock via safeStorage. On failure, route to recovery.
            const unlockResult = await window.opentreasury.workspace.unlock();
            if (cancelled) return;
            if (unlockResult.ok) {
              setWorkspaceStatus('ready');
            } else if (!unlockResult.ok && unlockResult.error.needsRecovery) {
              setWorkspaceStatus('recovery');
            } else {
              // Unexpected unlock error — log and fall through to AppShell.
              // eslint-disable-next-line no-console
              console.warn('[App] workspace:unlock failed:', unlockResult.error.message);
              setWorkspaceStatus('ready');
            }
          } else {
            setWorkspaceStatus(state);
          }
        } catch (wsErr) {
          // Workspace IPC unavailable (e.g., test harness) — proceed to AppShell.
          // eslint-disable-next-line no-console
          console.warn('[App] workspace detection failed; proceeding to app:', wsErr);
          if (!cancelled) setWorkspaceStatus('ready');
        }
      } catch (err) {
        // Bridge missing (e.g., test harness without preload mock) or IPC
        // failure — fall through to the main app rather than blocking on a
        // wizard that can never resolve.
        // eslint-disable-next-line no-console
        console.warn('[App] boot/onboarding status check failed; assuming normal boot:', err);
        if (!cancelled) {
          setNeedsOnboarding(false);
          setBootError(null);
          setWorkspaceStatus('ready');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // While probing, render nothing — keeps the main app from flashing before
  // the boot/onboarding decision lands. The probe is a single in-process IPC
  // call and resolves immediately under normal conditions.
  if (needsOnboarding === null) {
    return <></>;
  }

  // Boot failed — show error page with recovery options
  if (bootError) {
    return <BootErrorPage error={bootError} />;
  }

  if (needsOnboarding) {
    return <OnboardingScreen />;
  }

  // SPEC-026 — Workspace routing. While workspace:detect (and optional unlock)
  // are in flight, keep the screen blank (same strategy as the needsOnboarding
  // probe — avoids flashing the main app before the decision lands).
  if (workspaceStatus === null) {
    return <></>;
  }

  if (workspaceStatus === 'fresh') {
    return (
      <FreshSetupFlow
        hadLegacyFile={workspaceHadLegacyFile}
        onComplete={() => setWorkspaceStatus('ready')}
      />
    );
  }

  if (workspaceStatus === 'join') {
    return (
      <JoinFlow
        {...(workspaceFolderPath !== undefined ? { initialFolderPath: workspaceFolderPath } : {})}
        onComplete={() => setWorkspaceStatus('ready')}
      />
    );
  }

  if (workspaceStatus === 'recovery') {
    return <RecoveryFlow onComplete={() => setWorkspaceStatus('ready')} />;
  }

  // workspaceStatus === 'ready' (or 'unlock' during silent-unlock, which always
  // resolves to 'ready' / 'recovery' before we render) → fall through to AppShell.

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
        <PanelScreen
          onNavigateToMovementsWithAccount={navigateToMovementsWithFilters}
          onSeeAllMovements={() => {
            const range = thisMonth(new Date());
            navigateToMovementsWithFilters({ windowStart: range.from, windowEnd: range.to });
          }}
        />
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
      ) : route === 'export' ? (
        <ExportScreen configRevision={configRevision} />
      ) : route === 'preferences' ? (
        <PreferencesScreen />
      ) : (
        <SaldoScreen />
      )}
    </AppShell>
  );
}
