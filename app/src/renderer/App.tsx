import { useTranslation } from 'react-i18next';

// Minimal shell — confirms i18n wiring per ADR-003.
// Real screens (Panel, Movements, Saldo) arrive with their feature PRDs.
export function App(): JSX.Element {
  const { t, i18n } = useTranslation('common');

  const toggle = (): void => {
    void i18n.changeLanguage(i18n.language.startsWith('es') ? 'en' : 'es');
  };

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '40rem' }}>
      <h1>{t('app.title')}</h1>
      <p>{t('app.tagline')}</p>
      <button onClick={toggle} type="button">
        {t('action.toggle-language')} ({i18n.language})
      </button>
    </main>
  );
}
