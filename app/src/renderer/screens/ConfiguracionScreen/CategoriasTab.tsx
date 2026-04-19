import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, FolderOpen } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { AddCategoryModal } from '../../components/ConfigModals/index.js';
import { listCategories } from '../../services/categoriesApi.js';
import type { CategoryRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; categories: readonly CategoryRecord[] }
  | { kind: 'error'; message: string };

export interface CategoriasTabProps {
  readonly onListChanged?: (() => void) | undefined;
}

export function CategoriasTab({ onListChanged }: CategoriasTabProps): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const resp = await listCategories();
      setState({ kind: 'loaded', categories: resp.categories });
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
        <h2 className="ot-config__tab-title">{t('configuracion.categorias.heading')}</h2>
        <Button
          variant="primary"
          size="md"
          leadingIcon={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          {t('configuracion.categorias.add')}
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
      ) : state.categories.length === 0 ? (
        <EmptyState
          icon={<FolderOpen size={32} aria-hidden="true" />}
          title={t('configuracion.categorias.empty.title')}
          body={t('configuracion.categorias.empty.body')}
          actions={
            <Button
              variant="primary"
              leadingIcon={<Plus size={16} />}
              onClick={() => setModalOpen(true)}
            >
              {t('configuracion.categorias.add')}
            </Button>
          }
        />
      ) : (
        <ul className="ot-config__list">
          {state.categories.map((c) => (
            <li key={c.id} className="ot-config__card">
              <h3 className="ot-config__card-name">
                {c.color ? (
                  <span
                    className="ot-config__card-swatch"
                    style={{ background: c.color }}
                    aria-hidden="true"
                  />
                ) : null}
                {c.name}
              </h3>
            </li>
          ))}
        </ul>
      )}

      <AddCategoryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
