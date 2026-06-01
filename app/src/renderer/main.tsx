import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { i18n } from './i18n/index.js';
import { App } from './App.js';
import { FormatPreferencesProvider } from './format/index.js';
// Self-hosted Inter font (regular/medium/semibold/bold). Bundled via
// @fontsource/inter so Electron renders consistent weights offline — the
// previous Google Fonts CDN @import intermittently failed to load, causing
// bold glyphs (e.g. ↑/↓ arrows) to fall back to system fonts.
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
// Design tokens MUST load before any component CSS (they define the custom
// properties every component references via var(--…)).
import './styles/tokens.css';
import './styles/globals.css';
// Shared UI patterns reused across multiple screens (imported globally so
// either Movements or Configuración can render the chip group without a
// cross-screen CSS import).
import './styles/filter-chips.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <FormatPreferencesProvider>
        <App />
      </FormatPreferencesProvider>
    </I18nextProvider>
  </StrictMode>,
);
