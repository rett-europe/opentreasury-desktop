import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  ChartLine,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Scale,
  Search,
  Settings,
  Sun,
  Tag,
  Upload,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import './AppShell.css';

export type Route =
  | 'panel'
  | 'movements'
  | 'balance'
  | 'insights'
  | 'datos'
  | 'cuentas'
  | 'categorias'
  | 'etiquetas';

export interface AppShellProps {
  readonly currentRoute: Route;
  readonly onNavigate: (next: Route) => void;
  readonly children: ReactNode;
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
    items: [{ id: 'datos', labelKey: 'shell.nav.datos', icon: <Upload size={18} /> }],
  },
];

export function AppShell({ currentRoute, onNavigate, children }: AppShellProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const { theme, setTheme } = useTheme();

  const setLang = useCallback(
    (next: 'es' | 'en') => {
      void i18n.changeLanguage(next);
    },
    [i18n],
  );

  const activeLang = i18n.language.startsWith('es') ? 'es' : 'en';

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readStoredSidebarCollapsed);

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

  // Cross-tab sync (mirrors useTheme behavior loosely): if another tab toggles
  // the preference, reflect it here so the shell stays consistent.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== SIDEBAR_COLLAPSED_STORAGE_KEY) return;
      setSidebarCollapsed(event.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const sidebarToggleLabel = t(
    sidebarCollapsed ? 'shell.sidebar.expand' : 'shell.sidebar.collapse',
  );

  return (
    <div className="ot-shell" data-sidebar-collapsed={sidebarCollapsed ? 'true' : undefined}>
      {/* ── Topbar ────────────────────────────────────────── */}
      <header className="ot-shell__topbar" role="banner">
        <button
          type="button"
          className="ot-shell__brand"
          onClick={toggleSidebar}
          aria-expanded={!sidebarCollapsed}
          aria-controls="ot-shell-sidebar"
          aria-label={sidebarToggleLabel satisfies string}
          title={sidebarToggleLabel satisfies string}
        >
          <span className="ot-shell__brand-mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 L22 12 L12 22 L2 12 Z" />
            </svg>
          </span>
          <span className="ot-shell__brand-name">{t('shell.brand')}</span>
        </button>

        <span className="ot-shell__divider-v" aria-hidden="true" />
        <span className="ot-shell__tenant">Demo NGO</span>

        <div className="ot-shell__topbar-spacer" />

        <label className="ot-shell__search">
          <Search size={16} aria-hidden="true" />
          <input type="search" placeholder={t('shell.search.placeholder') satisfies string} />
          <kbd>⌘K</kbd>
        </label>

        <div
          className="ot-shell__control-group"
          role="radiogroup"
          aria-label={t('shell.language.label') satisfies string}
        >
          <button
            type="button"
            className="ot-shell__control-btn"
            aria-pressed={activeLang === 'es'}
            onClick={() => setLang('es')}
          >
            ES
          </button>
          <button
            type="button"
            className="ot-shell__control-btn"
            aria-pressed={activeLang === 'en'}
            onClick={() => setLang('en')}
          >
            EN
          </button>
        </div>

        <div
          className="ot-shell__control-group"
          role="radiogroup"
          aria-label={t('shell.theme.label') satisfies string}
        >
          <button
            type="button"
            className="ot-shell__control-btn"
            aria-pressed={theme === 'system'}
            onClick={() => setTheme('system')}
            title={t('shell.theme.system') satisfies string}
          >
            <Monitor size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ot-shell__control-btn"
            aria-pressed={theme === 'light'}
            onClick={() => setTheme('light')}
            title={t('shell.theme.light') satisfies string}
          >
            <Sun size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ot-shell__control-btn"
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme('dark')}
            title={t('shell.theme.dark') satisfies string}
          >
            <Moon size={14} aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="ot-shell__icon-btn"
          title={t('shell.theme.label') satisfies string}
          aria-label="Settings"
        >
          <Settings size={18} aria-hidden="true" />
        </button>
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

        <div className="ot-shell__user-strip">
          <div className="ot-shell__user-avatar" aria-hidden="true">
            PR
          </div>
          <div className="ot-shell__user-meta">
            <div className="ot-shell__user-name">{t('shell.user.name')}</div>
            <div className="ot-shell__user-role">{t('shell.user.role')}</div>
          </div>
          <button
            type="button"
            className="ot-shell__user-logout"
            title={t('shell.user.logout') satisfies string}
            aria-label={t('shell.user.logout') satisfies string}
          >
            <LogOut size={14} aria-hidden="true" />
          </button>
        </div>
      </nav>

      <main className="ot-shell__main" role="main">
        {children}
      </main>
    </div>
  );
}
