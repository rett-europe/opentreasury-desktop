import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { i18n } from './i18n/index.js';
import { App } from './App.js';
// Design tokens MUST load before any component CSS (they define the custom
// properties every component references via var(--…)).
import './styles/tokens.css';
import './styles/globals.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
