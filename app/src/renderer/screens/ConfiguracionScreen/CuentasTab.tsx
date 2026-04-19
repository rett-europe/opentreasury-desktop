import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Landmark, FolderOpen, Tag as TagIcon } from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { AddAccountModal } from '../../components/ConfigModals/index.js';
import { listAccounts } from '../../services/accountsApi.js';
import type { AccountRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | { kind: 'loaded'; accounts: readonly AccountRecord[] }
  | { kind: 'error'; message: string };

export interface CuentasTabProps {
  readonly onListChanged?: (() => void) | undefined;
}

export function CuentasTab({ onListChanged }: CuentasTabProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const resp = await listAccounts();
      setState({ kind: 'loaded', accounts: resp.accounts });
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

  const fmtCurrency = new Intl.NumberFormat(i18n.language.startsWith('es') ? 'es-ES' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
  });

  return (
    <>
      <div className="ot-config__tab-actions">
        <h2 className="ot-config__tab-title">{t('configuracion.cuentas.heading')}</h2>
        <Button
          variant="primary"
          size="md"
          leadingIcon={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          {t('configuracion.cuentas.add')}
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
      ) : state.accounts.length === 0 ? (
        <EmptyState
          icon={<Landmark size={32} aria-hidden="true" />}
          title={t('configuracion.cuentas.empty.title')}
          body={t('configuracion.cuentas.empty.body')}
          actions={
            <Button
              variant="primary"
              leadingIcon={<Plus size={16} />}
              onClick={() => setModalOpen(true)}
            >
              {t('configuracion.cuentas.add')}
            </Button>
          }
        />
      ) : (
        <ul className="ot-config__list">
          {state.accounts.map((a) => (
            <li key={a.id} className="ot-config__card">
              <h3 className="ot-config__card-name">{a.name}</h3>
              {a.bankName ? <p className="ot-config__card-meta">{a.bankName}</p> : null}
              <p className="ot-config__card-amount">{fmtCurrency.format(a.openingBalance)}</p>
            </li>
          ))}
        </ul>
      )}

      <AddAccountModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}

// Small util to re-export icon for consistency
export { Landmark, FolderOpen, TagIcon };
