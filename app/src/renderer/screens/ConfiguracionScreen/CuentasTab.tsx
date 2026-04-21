import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Landmark, Search, Edit, Trash2, Eye, EyeOff } from 'lucide-react';

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

/** Mask an IBAN leaving only the last 4 digits visible, grouped in 4s. */
function maskIban(iban: string | undefined): string {
  if (!iban) return '';
  const compact = iban.replace(/\s+/g, '');
  if (compact.length <= 4) return compact;
  const prefix = compact.slice(0, 2);
  const last4 = compact.slice(-4);
  const hiddenLen = compact.length - prefix.length - last4.length;
  const stars = '•'.repeat(hiddenLen);
  return `${prefix}${stars}${last4}`.replace(/(.{4})(?=.)/g, '$1 ');
}

export function CuentasTab({ onListChanged }: CuentasTabProps): JSX.Element {
  const { t, i18n } = useTranslation('common');
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set());

  const toggleReveal = (id: string): void => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const resp = await listAccounts();
      setState({ kind: 'loaded', accounts: resp.accounts });
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'unknown' });
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

  const filteredAccounts =
    state.kind === 'loaded'
      ? state.accounts.filter((a) => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (
            a.name.toLowerCase().includes(q) ||
            (a.bankName || '').toLowerCase().includes(q) ||
            (a.label || '').toLowerCase().includes(q) ||
            (a.iban || '').toLowerCase().includes(q)
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
                    color:
                      totalBalance >= 0
                        ? 'var(--color-status-success)'
                        : 'var(--color-status-error)',
                  }}
                >
                  {fmtCurrency.format(totalBalance)}
                </strong>
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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
                placeholder="Buscar por nombre, banco, etiqueta o IBAN…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <span className="ot-config__filter-count">
              {filteredAccounts.length} de {state.accounts.length}
            </span>
          </div>

          <div className="ot-config__table-wrapper">
            <table className="ot-config__table ot-config__table--accounts">
              <colgroup>
                <col style={{ width: '56px' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '80px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th></th>
                  <th>Nombre</th>
                  <th>Banco</th>
                  <th>Etiqueta</th>
                  <th>IBAN</th>
                  <th className="align-right">Saldo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length > 0 ? (
                  filteredAccounts.map((a) => {
                    const isRevealed = revealed.has(a.id);
                    const swatch = a.color || 'var(--color-brand-primary)';
                    return (
                      <tr key={a.id}>
                        <td>
                          <span
                            className="ot-config__entity-icon"
                            style={{ background: swatch }}
                            aria-hidden="true"
                          >
                            <Landmark size={16} />
                          </span>
                        </td>
                        <td className="ot-config__cell-truncate" title={a.name}>
                          <div style={{ fontWeight: 'var(--font-weight-medium)' }}>{a.name}</div>
                          <div className="ot-config__meta-text">
                            {a.isPaypal ? 'Plataforma externa' : 'Cuenta bancaria'}
                          </div>
                        </td>
                        <td className="ot-config__cell-truncate" title={a.bankName || ''}>
                          {a.bankName ? (
                            <span className="ot-config__meta-text">{a.bankName}</span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {a.label ? (
                            <span
                              className="ot-config__account-pill"
                              style={{
                                background: `color-mix(in srgb, ${swatch} 18%, transparent)`,
                              }}
                              title={a.label}
                            >
                              <span
                                className="ot-config__account-pill-dot"
                                style={{ background: swatch }}
                                aria-hidden="true"
                              />
                              {a.label}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {a.iban ? (
                            <span className="ot-config__iban-reveal">
                              <span className="ot-config__code-mono">
                                {isRevealed ? a.iban : maskIban(a.iban)}
                              </span>
                              <button
                                type="button"
                                className="ot-config__row-action-btn"
                                title={isRevealed ? 'Ocultar IBAN' : 'Mostrar IBAN'}
                                aria-label={isRevealed ? 'Ocultar IBAN' : 'Mostrar IBAN'}
                                onClick={() => toggleReveal(a.id)}
                              >
                                {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-text-muted)' }}>—</span>
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
                              title="Editar (próximamente)"
                              aria-label="Editar cuenta"
                              disabled
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              className="ot-config__row-action-btn ot-config__row-action-btn--danger"
                              title="Eliminar (próximamente)"
                              aria-label="Eliminar cuenta"
                              disabled
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="ot-config__table-empty">
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
