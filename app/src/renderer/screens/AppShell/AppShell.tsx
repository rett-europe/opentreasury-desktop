import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile } from '../../../shared/ipc-contracts/profile.js';
import {
  ArrowLeftRight,
  ChartLine,
  Download,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Scale,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Upload,
} from 'lucide-react';
import { ProfileSetupModal } from '../ProfileSetupModal/index.js';
import type { ProfileSetupData } from '../ProfileSetupModal/index.js';
import './AppShell.css';

// Helper to compute 2-letter initials from a name
function getInitials(name: string | null | undefined): string {
  if (!name || name.trim() === '') return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    // Single word: take first 2 chars
    const word = words[0];
    if (!word) return '?';
    return word.length >= 2 ? word.slice(0, 2).toUpperCase() : (word[0] ?? '').toUpperCase();
  }
  // Multiple words: first letter of first word + first letter of last word
  const firstWord = words[0];
  const lastWord = words[words.length - 1];
  const first = firstWord?.[0] ?? '';
  const last = lastWord?.[0] ?? '';
  return (first + last).toUpperCase();
}

export type Route =
  | 'panel'
  | 'movements'
  | 'balance'
  | 'insights'
  | 'insights-detail'
  | 'datos'
  | 'export'
  | 'audit'
  | 'cuentas'
  | 'categorias'
  | 'etiquetas'
  | 'preferences';

export interface AppShellProps {
  readonly currentRoute: Route;
  readonly onNavigate: (next: Route) => void;
  readonly children: ReactNode;
  readonly searchQuery?: string;
  readonly onSearchQueryChange?: (query: string) => void;
}

interface NavItem {
  readonly id: Route;
  readonly labelKey: string;
  readonly icon: ReactNode;
}

interface NavSection {
  readonly labelKey: string;
  readonly items: readonly NavItem[];
}

/**
 * PR#2 parity — Configuración section exposes Categorías / Etiquetas / Cuentas
 * as three sibling routes (folder / tag / bank icons) instead of one tabbed
 * entry point. Datos is its own section with Importación (upload). The old
 * single "configuracion" route is gone.
 */
/**
 * localStorage key for the user-controlled sidebar collapse preference.
 * v0.1 stand-in until the preload/main user-prefs bridge exists (mirrors the
 * pattern in `useTheme.ts`). Auto-collapse at ≤960px stays purely CSS-driven.
 */
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'opentreasury.sidebar.collapsed';

function readStoredSidebarCollapsed(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Auto-collapse breakpoint. Must stay in lockstep with the `@media (max-width:
 * 960px)` rule in `AppShell.css` so `aria-expanded` reflects the actual
 * visual state across viewport widths (WCAG 4.1.2 — Name, Role, Value).
 */
const NARROW_VIEWPORT_QUERY = '(max-width: 960px)';

/**
 * SPEC-024 — Trailing-edge debounce window for the global search input.
 * Pedro feedback: 200ms felt too eager (filter pipeline kicked in mid-word);
 * 500ms gives more breathing room while still feeling responsive.
 * Enter / Esc / clear paths flush immediately and bypass this delay.
 */
const SEARCH_DEBOUNCE_MS = 500;

function readInitialNarrowViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia(NARROW_VIEWPORT_QUERY).matches;
  } catch {
    return false;
  }
}

const NAV_SECTIONS: readonly NavSection[] = [
  {
    labelKey: 'shell.sections.main',
    items: [
      { id: 'panel', labelKey: 'shell.nav.panel', icon: <LayoutDashboard size={18} /> },
      { id: 'movements', labelKey: 'shell.nav.movements', icon: <ArrowLeftRight size={18} /> },
      { id: 'balance', labelKey: 'shell.nav.balance', icon: <Scale size={18} /> },
      { id: 'insights', labelKey: 'shell.nav.insights', icon: <ChartLine size={18} /> },
    ],
  },
  {
    labelKey: 'shell.sections.config',
    items: [
      { id: 'categorias', labelKey: 'shell.nav.categorias', icon: <FolderOpen size={18} /> },
      { id: 'etiquetas', labelKey: 'shell.nav.etiquetas', icon: <Tag size={18} /> },
      { id: 'cuentas', labelKey: 'shell.nav.cuentas', icon: <Landmark size={18} /> },
    ],
  },
  {
    labelKey: 'shell.sections.datos',
    items: [
      { id: 'datos', labelKey: 'shell.nav.datos', icon: <Upload size={18} /> },
      { id: 'export', labelKey: 'shell.nav.export', icon: <Download size={18} /> },
      // SPEC-028 §2 — Auditoría sits immediately after Exportar (the real shell
      // has no single "Configuración" nav item; Auditoría stays adjacent to
      // Exportar per UX-006, giving the spec's `… · Exportar · Auditoría` order).
      { id: 'audit', labelKey: 'shell.nav.audit', icon: <ShieldCheck size={18} /> },
    ],
  },
];

export function AppShell({
  currentRoute,
  onNavigate,
  children,
  searchQuery = '',
  onSearchQueryChange,
}: AppShellProps): JSX.Element {
  const { t } = useTranslation('common');

  // P1-1: Load profile from IPC on mount
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await window.opentreasury.profile.get();
        if (response.ok) {
          setProfile(response.profile);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[AppShell] failed to load profile:', err);
      } finally {
        setProfileLoading(false);
      }
    })();
  }, []);

  // SPEC-024 — Search state
  //
  // PERF: the topbar input keeps a *local* immediate value (`searchInputValue`)
  // and only propagates to the parent (`onSearchQueryChange`) on the trailing
  // edge of a 500 ms debounce. Wiring the input straight to the parent setter
  // re-renders MovementsScreen on every keystroke and re-runs the 10k-row
  // filter pipeline ("c" → "ca" → "cal" …) which Pedro experienced as
  // visible per-keystroke lag. The prop `searchQuery` is the *applied* query
  // (debounced); the local state is the *typed* query (instantaneous).
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchDebounceTimerRef = useRef<number | null>(null);
  const [searchInputValue, setSearchInputValue] = useState<string>(searchQuery);
  // Tracks the most recent value we've dispatched to the parent so the prop
  // → local sync effect can distinguish our own echoes (skip) from genuine
  // external updates (e.g. App clearing the query on route change → adopt).
  const lastDispatchedSearchRef = useRef<string>(searchQuery);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readStoredSidebarCollapsed);
  const [viewportNarrow, setViewportNarrow] = useState<boolean>(readInitialNarrowViewport);

  // Track the auto-collapse breakpoint in JS so ARIA state stays truthful at
  // all widths. Without this, `aria-expanded` would diverge from the visual
  // state at ≤960px (CSS forces collapsed regardless of preference) — that
  // would violate WCAG 4.1.2.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mql = window.matchMedia(NARROW_VIEWPORT_QUERY);
    const onChange = (event: MediaQueryListEvent): void => {
      setViewportNarrow(event.matches);
    };
    // Modern API; fall back to deprecated `addListener` for older WebViews.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => {
        mql.removeEventListener('change', onChange);
      };
    }
    mql.addListener(onChange);
    return () => {
      mql.removeListener(onChange);
    };
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        try {
          window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, next ? 'true' : 'false');
        } catch {
          /* swallow — quotas / private mode */
        }
      }
      return next;
    });
  }, []);

  // Cross-tab sync: if another window toggles the preference, mirror it here
  // so the shell stays consistent. (Note: `useTheme.ts` does NOT do this yet;
  // this hook intentionally extends the v0.1 pattern with cross-tab parity.)
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== SIDEBAR_COLLAPSED_STORAGE_KEY) return;
      // Ignore key removal (newValue === null) — leaves the in-memory
      // preference intact rather than silently expanding the sidebar.
      if (event.newValue === null) return;
      setSidebarCollapsed(event.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // CSS at ≤960px forces the collapsed visual state regardless of preference.
  // ARIA must reflect what the user sees, not just the stored preference.
  const effectiveCollapsed = viewportNarrow || sidebarCollapsed;

  const sidebarToggleLabel = t(
    effectiveCollapsed ? 'shell.sidebar.expand' : 'shell.sidebar.collapse',
  );

  // SPEC-024 — Search handlers
  //
  // The debounce now wraps *both* the parent state propagation and the
  // navigation. The input's `value` is local, so typing never re-renders
  // MovementsScreen — only the trailing-edge dispatch does.
  const dispatchSearch = useCallback(
    (query: string) => {
      lastDispatchedSearchRef.current = query;
      if (onSearchQueryChange) {
        onSearchQueryChange(query);
      }
      // FR14 — Navigate to movements with applied query. No-op on empty
      // query (covers the "user typed then cleared" case) and when already
      // on the movements route.
      if (query.trim() && currentRoute !== 'movements') {
        onNavigate('movements');
      }
    },
    [currentRoute, onNavigate, onSearchQueryChange],
  );

  const cancelPendingSearch = useCallback(() => {
    if (searchDebounceTimerRef.current !== null) {
      window.clearTimeout(searchDebounceTimerRef.current);
      searchDebounceTimerRef.current = null;
    }
  }, []);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Local state updates instantaneously — input feels responsive even
      // while the (potentially expensive) filter is debounced.
      setSearchInputValue(value);

      // FR13 — Trailing-edge 500ms debounce on the *applied* query.
      cancelPendingSearch();
      searchDebounceTimerRef.current = window.setTimeout(() => {
        searchDebounceTimerRef.current = null;
        dispatchSearch(value);
      }, SEARCH_DEBOUNCE_MS);
    },
    [cancelPendingSearch, dispatchSearch],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cancelPendingSearch();
        dispatchSearch(searchInputValue);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (searchInputValue) {
          // First Esc clears the query (both local input and applied filter).
          cancelPendingSearch();
          setSearchInputValue('');
          dispatchSearch('');
        } else {
          // Second Esc blurs.
          searchInputRef.current?.blur();
        }
      }
    },
    [searchInputValue, cancelPendingSearch, dispatchSearch],
  );

  const handleSearchClear = useCallback(() => {
    cancelPendingSearch();
    setSearchInputValue('');
    dispatchSearch('');
    searchInputRef.current?.focus();
  }, [cancelPendingSearch, dispatchSearch]);

  // FR12 — ⌘K / Ctrl+K global keyboard shortcut
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // ⌘K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (searchDebounceTimerRef.current !== null) {
        window.clearTimeout(searchDebounceTimerRef.current);
      }
    };
  }, []);

  // Sync external `searchQuery` prop changes into the local input value.
  // We compare against `lastDispatchedSearchRef` so our own debounced echoes
  // don't clobber the user's in-flight typing — e.g. if they type "ca" while
  // an earlier "c" dispatch is just landing in the parent, the prop arrives
  // as "c" but `lastDispatched === "c"` so we skip and leave "ca" intact.
  // Genuine external resets (App clearing on route change) flow through.
  useEffect(() => {
    if (searchQuery === lastDispatchedSearchRef.current) return;
    lastDispatchedSearchRef.current = searchQuery;
    setSearchInputValue(searchQuery);
  }, [searchQuery]);

  const handleProfileComplete = useCallback(async (profileData: ProfileSetupData) => {
    try {
      // P1-1: Save profile via IPC (includes generated userId from ProfileSetupModal)
      const response = await window.opentreasury.profile.save({
        userId: profileData.userId,
        name: profileData.name,
        role: profileData.role,
        ngoName: profileData.ngoName,
        identitySource: 'local',
        createdAt: new Date().toISOString(),
      });

      if (response.ok) {
        setProfile(response.profile);
      } else {
        // eslint-disable-next-line no-console
        console.error('[AppShell] failed to save profile:', response.error);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[AppShell] failed to save profile:', err);
    }
  }, []);

  // Render-gate: if no profile, show setup modal instead of shell
  if (!profileLoading && profile === null) {
    return <ProfileSetupModal isOpen={true} onComplete={handleProfileComplete} />;
  }

  return (
    <div className="ot-shell" data-sidebar-collapsed={effectiveCollapsed ? 'true' : undefined}>
      {/* ── Topbar ────────────────────────────────────────── */}
      <header className="ot-shell__topbar" role="banner">
        <button
          type="button"
          className="ot-shell__brand"
          onClick={toggleSidebar}
          aria-expanded={!effectiveCollapsed}
          aria-controls="ot-shell-sidebar"
          aria-label={sidebarToggleLabel satisfies string}
          title={sidebarToggleLabel satisfies string}
          // At ≤960px the CSS auto-collapse wins regardless of preference, so
          // the toggle is meaningless there — disable it to match what the
          // user sees and avoid an interactive control with no effect.
          disabled={viewportNarrow}
        >
          <span className="ot-shell__brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 L22 12 L12 22 L2 12 Z" />
            </svg>
          </span>
          <span className="ot-shell__brand-name">{t('shell.brand')}</span>
        </button>

        <span className="ot-shell__divider-v" aria-hidden="true" />
        <span className="ot-shell__tenant">
          {profileLoading ? '…' : (profile?.ngoName ?? 'OpenTreasury')}
        </span>

        <div className="ot-shell__topbar-spacer" />

        <label className="ot-shell__search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="search"
            placeholder={t('shell.search.placeholder') satisfies string}
            aria-label={t('shell.search.ariaLabel') satisfies string}
            value={searchInputValue}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
          />
          {searchInputValue && (
            <button
              type="button"
              className="ot-shell__search-clear"
              onClick={handleSearchClear}
              aria-label={t('shell.search.clearAriaLabel') satisfies string}
            >
              ✕
            </button>
          )}
          {!searchInputValue && <kbd>⌘K</kbd>}
        </label>
      </header>

      {/* ── Sidebar ───────────────────────────────────────── */}
      <nav className="ot-shell__sidebar" id="ot-shell-sidebar" aria-label="Primary">
        {NAV_SECTIONS.map((section) => (
          <div key={section.labelKey}>
            <div className="ot-shell__nav-section-label">{t(section.labelKey)}</div>
            <ul className="ot-shell__nav">
              {section.items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="ot-shell__nav-item"
                    aria-current={currentRoute === item.id ? 'page' : undefined}
                    onClick={() => onNavigate(item.id)}
                  >
                    <span className="ot-shell__nav-icon" aria-hidden="true">
                      {item.icon}
                    </span>
                    <span className="ot-shell__nav-label">{t(item.labelKey)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="ot-shell__sidebar-spacer" />

        {/* Bottom-anchored Preferences entry */}
        <div className="ot-shell__nav-divider" />
        <ul className="ot-shell__nav">
          <li>
            <button
              type="button"
              className="ot-shell__nav-item"
              aria-current={currentRoute === 'preferences' ? 'page' : undefined}
              onClick={() => onNavigate('preferences')}
            >
              <span className="ot-shell__nav-icon" aria-hidden="true">
                <Settings size={18} />
              </span>
              <span className="ot-shell__nav-label">{t('shell.nav.preferences')}</span>
            </button>
          </li>
        </ul>

        <div className="ot-shell__user-strip">
          <div className="ot-shell__user-avatar" aria-hidden="true">
            {profileLoading ? '…' : getInitials(profile?.name)}
          </div>
          <div className="ot-shell__user-meta">
            <div className="ot-shell__user-name">
              {profileLoading ? '…' : (profile?.name ?? '—')}
            </div>
            <div className="ot-shell__user-role">
              {profileLoading
                ? '…'
                : profile?.role
                  ? (() => {
                      const key = `shell.user.roles.${profile.role.toLowerCase()}`;
                      const translated = t(key satisfies string);
                      // i18next returns the key itself when no translation exists.
                      // Fall back to the user's freeform role string in that case.
                      return translated === key ? profile.role : translated;
                    })()
                  : '—'}
            </div>
          </div>
        </div>
      </nav>

      <main className="ot-shell__main" role="main">
        {children}
      </main>
    </div>
  );
}
