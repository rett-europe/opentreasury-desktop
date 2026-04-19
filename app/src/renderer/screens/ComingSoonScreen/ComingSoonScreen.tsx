import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/EmptyState/index.js';

export interface ComingSoonScreenProps {
  readonly titleKey?: string;
}

export function ComingSoonScreen({ titleKey }: ComingSoonScreenProps): JSX.Element {
  const { t } = useTranslation('common');
  return (
    <EmptyState
      title={t(titleKey ?? 'shell.coming-soon.title')}
      body={t('shell.coming-soon.body')}
    />
  );
}
