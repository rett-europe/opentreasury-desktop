import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, LayoutDashboard, Moon, Scale, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme.js';
import './AppShell.css';

export type Route = 'panel' | 'movements' | 'balance';

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

const NAV: readonly NavItem[] = [
  { id: 'panel', labelKey: 'shell.nav.panel', icon: <LayoutDashboard size={18} /> },
  { id: 'movements', labelKey: 'shell.nav.movements', icon: <ArrowLeftRight size={18} /> },
  { id: 'balance', labelKey: 'shell.nav.balance', icon: <Scale size={18} /> },
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

  return (
    <div className="ot-shell">
      <header className="ot-shell__topbar" role="banner">
        <span className="ot-shell__brand">
          <span className="ot-shell__brand-mark" aria-hidden="true">
            <Scale size={16} />
          </span>
          <span>{t('shell.brand')}</span>
        </span>

        <div className="ot-shell__topbar-spacer" />

        <div className="ot-shell__topbar-controls">
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
        </div>
      </header>

      <nav className="ot-shell__sidebar" aria-label="Primary">
        <ul className="ot-shell__nav">
          {NAV.map((item) => (
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
      </nav>

      <main className="ot-shell__main" role="main">
        {children}
      </main>
    </div>
  );
}
