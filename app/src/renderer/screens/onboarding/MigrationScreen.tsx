import { useTranslation } from 'react-i18next';
import './FreshSetupFlow.css';

interface MigrationScreenProps {
  folderPath: string | undefined;
}

/**
 * Migration state screen (SPEC-026 §workspace:detect state=migration).
 *
 * Shown when a legacy single-file workspace (events.ndjson, no events.key) is
 * detected. Migration is a one-shot terminal operation — no in-app migration UI
 * is planned (Pedro's directive: one-shot, terminal-only, #308).
 *
 * Minimal by design — this screen is seen at most twice, by the workspace admin.
 */
export function MigrationScreen({ folderPath }: MigrationScreenProps) {
  const { t } = useTranslation('common');
  const command = folderPath
    ? `node scripts/migrate-workspace.mjs "${folderPath}"`
    : 'node scripts/migrate-workspace.mjs <folder>';

  return (
    <div className="ot-onboarding-screen">
      <div className="ot-onboarding-screen__content">
        <h1 className="ot-onboarding-screen__title">{t('onboarding.migration.title')}</h1>
        <p className="ot-onboarding-screen__body">{t('onboarding.migration.body')}</p>

        <div className="ot-onboarding-screen__selected-path">
          <strong>{t('onboarding.migration.command_label')}</strong>
          <br />
          <code>{command}</code>
        </div>

        {folderPath && (
          <div className="ot-onboarding-screen__selected-path" style={{ marginTop: '0.5rem' }}>
            <strong>{t('onboarding.migration.folder_label')}</strong> {folderPath}
          </div>
        )}

        <p className="ot-onboarding-screen__body" style={{ marginTop: '1rem', opacity: 0.7 }}>
          {t('onboarding.migration.footer')}
        </p>
      </div>
    </div>
  );
}
