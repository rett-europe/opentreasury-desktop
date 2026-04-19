import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Tag as TagIcon } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { AddTagModal } from '../../components/ConfigModals/index.js';
import { listTags } from '../../services/tagsApi.js';
import type { TagRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; tags: readonly TagRecord[] }
  | { kind: 'error'; message: string };

export interface EtiquetasTabProps {
  readonly onListChanged?: (() => void) | undefined;
}

export function EtiquetasTab({ onListChanged }: EtiquetasTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const resp = await listTags();
      setState({ kind: 'loaded', tags: resp.tags });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreated = useCallback(() => {
    void load();
    onListChanged?.();
  }, [load, onListChanged]);

  return (
    <>
      <div className="ot-config__tab-actions">
        <h2 className="ot-config__tab-title">{t('configuracion.etiquetas.heading')}</h2>
        <Button
          variant="primary"
          size="md"
          leadingIcon={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          {t('configuracion.etiquetas.add')}
        </Button>
      </div>

      {state.kind === 'loading' ? (
        <p>{t('common.loading')}</p>
      ) : state.kind === 'error' ? (
        <EmptyState
          title={t('configuracion.error.loadFailed')}
          body={state.message}
          actions={
            <Button variant="secondary" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          }
        />
      ) : state.tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon size={32} aria-hidden="true" />}
          title={t('configuracion.etiquetas.empty.title')}
          body={t('configuracion.etiquetas.empty.body')}
          actions={
            <Button
              variant="primary"
              leadingIcon={<Plus size={16} />}
              onClick={() => setModalOpen(true)}
            >
              {t('configuracion.etiquetas.add')}
            </Button>
          }
        />
      ) : (
        <ul className="ot-config__list">
          {state.tags.map((tg) => (
            <li key={tg.id} className="ot-config__card">
              <span className="ot-config__tag-pill">{tg.name}</span>
            </li>
          ))}
        </ul>
      )}

      <AddTagModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
