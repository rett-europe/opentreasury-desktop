import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Landmark, Search, Edit, Trash2, Download } from 'lucide-react';

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
  const [searchQuery, setSearchQuery] = useState('');

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

  // Filter accounts by search query
  const filteredAccounts =
    state.kind === 'loaded'
      ? state.accounts.filter((a) => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            a.name.toLowerCase().includes(q) || (a.bankName || '').toLowerCase().includes(q)
          );
        })
      : [];

  const totalBalance =
    state.kind === 'loaded' ? state.accounts.reduce((sum, a) => sum + a.openingBalance, 0) : 0;

  return (
    <>
      <div className="ot-config__tab-actions">
        <div>
          <h2 className="ot-config__tab-title">{t('configuracion.cuentas.heading')}</h2>
          {state.kind === 'loaded' && state.accounts.length > 0 ? (
            <div className="ot-page-header__stats">
              <span>
                {state.accounts.length} cuenta{state.accounts.length !== 1 ? 's' : ''}
              </span>
              <span className="ot-page-header__stat-separator">·</span>
              <span>
                Saldo total:{' '}
                <strong
                  style={{
                    color: totalBalance >= 0 ? 'var(--color-status-success)' : 'var(--color-status-error)',
                  }}
                >
                  {fmtCurrency.format(totalBalance)}
                </strong>
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {state.kind === 'loaded' && state.accounts.length > 0 ? (
            <Button variant="secondary" size="md" leadingIcon={<Download size={16} />}>
              Exportar
            </Button>
          ) : null}
          <Button
            variant="primary"
            size="md"
            leadingIcon={<Plus size={16} />}
            onClick={() => setModalOpen(true)}
          >
            {t('configuracion.cuentas.add')}
          </Button>
        </div>
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
        <>
          <div className="ot-config__filter-bar">
            <div className="ot-config__search-input">
              <Search size={14} />
              <input
                type="text"
                placeholder="Buscar por nombre o banco…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <span className="ot-config__filter-count">
              {filteredAccounts.length} de {state.accounts.length}
            </span>
          </div>

          <div className="ot-config__table-wrapper">
            <table className="ot-config__table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Banco</th>
                  <th className="align-right">Saldo inicial</th>
                  <th style={{ width: '80px' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length > 0 ? (
                  filteredAccounts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{a.name}</div>
                      </td>
                      <td>
                        {a.bankName ? (
                          <span className="ot-config__meta-text">{a.bankName}</span>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                            —
                          </span>
                        )}
                      </td>
                      <td
                        className="align-right"
                        style={{
                          color:
                            a.openingBalance >= 0
                              ? 'var(--color-status-success)'
                              : 'var(--color-status-error)',
                          fontWeight: 'var(--font-weight-medium)',
                        }}
                      >
                        {fmtCurrency.format(a.openingBalance)}
                      </td>
                      <td>
                        <div className="ot-config__row-actions">
                          <button
                            className="ot-config__row-action-btn"
                            title="Editar cuenta"
                            aria-label="Editar cuenta"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            className="ot-config__row-action-btn ot-config__row-action-btn--danger"
                            title="Eliminar cuenta"
                            aria-label="Eliminar cuenta"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="ot-config__table-empty">
                      Ninguna cuenta coincide con la búsqueda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AddAccountModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
