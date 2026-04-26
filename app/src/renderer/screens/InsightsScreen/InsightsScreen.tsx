import { useTranslation } from 'react-i18next';
import './InsightsScreen.css';

export function InsightsScreen(): JSX.Element {
  const { t } = useTranslation('common');

  return (
    <div className="ot-insights">
      <header className="ot-page-header">
        <div>
          <h1>{t('insights.title')}</h1>
          <p className="ot-page-header__subtitle">{t('insights.subtitle')}</p>
        </div>
      </header>

      <div className="ot-insights__empty-state ot-p-card ot-p-card--padded">
        <div className="ot-insights__empty-content">
          <svg
            className="ot-insights__empty-icon"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 3v18h18" />
            <path d="M18 17V9" />
            <path d="M13 17V5" />
            <path d="M8 17v-3" />
          </svg>
          <h2 className="ot-insights__empty-title">{t('insights.empty.title')}</h2>
          <p className="ot-insights__empty-body">{t('insights.empty.body')}</p>
        </div>
      </div>
    </div>
  );
}
