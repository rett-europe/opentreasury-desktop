import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Landmark,
  Search,
  Edit,
  Archive,
  Eye,
  EyeOff,
  RotateCcw,
  Scale,
  Trash2,
} from 'lucide-react';

import { Button } from '../../components/Button/index.js';
import { EmptyState } from '../../components/EmptyState/index.js';
import { useFormatters } from '../../format/index.js';
import {
  AddAccountModal,
  ArchiveConfirmModal,
  BalanceAdjustmentModal,
} from '../../components/ConfigModals/index.js';
import { ConfirmDialog } from '../../components/ConfirmDialog/index.js';
import { listAccounts } from '../../services/accountsApi.js';
import { listMovements } from '../../services/movementsApi.js';
import { getAccountBalances } from '../../services/panelApi.js';
import {
  archiveAccount,
  ConfigMutationError,
  deleteAccount,
  isArchived,
  listAccountsUsage,
  unarchiveAccount,
  type ConfigAccount,
} from '../../services/configMutationsApi.js';
import { mapConfigMutationErrorToMessage } from '../../components/ConfigModals/errorMap.js';
import type { AccountRecord } from '../../types/config.js';

type State =
  | { kind: 'loading' }
  | {
      kind: 'loaded';
      accounts: readonly ConfigAccount[];
      // Per-account `net` from `panel.getAccountBalances` (income − expense
      // across all transactions). Combined with `openingBalance` to render
      // the live "current balance" column, so balance adjustments (and any
      // other tx) update the Accounts list immediately.
      balancesById: ReadonlyMap<string, number>;
    }
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
  const { t } = useTranslation('common');
  const { formatCurrency } = useFormatters();
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ConfigAccount | null>(null);
  // Per-account transaction count for the editing target. Drives the
  // "Are you sure?" confirmation when the user changes the opening balance.
  // `null` means "still loading" (we treat as 0 in the modal, so a fast
  // confirm-skip is fine — the dialog is a UX hint, not a correctness gate).
  const [editingUsageCount, setEditingUsageCount] = useState<number | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ConfigAccount | null>(null);
  const [adjusting, setAdjusting] = useState<ConfigAccount | null>(null);
  // WI-21-followup — hard-delete target + per-account usage (transactionCount
  // by id). Loaded alongside the accounts list so the dialog body can branch
  // on usage > 0 to surface the "Archive instead" CTA.
  const [deleteTarget, setDeleteTarget] = useState<ConfigAccount | null>(null);
  const [usage, setUsage] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
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
      // Fetch the account list, per-account balance aggregates, and usage in parallel.
      // If only the balances call fails (e.g. transient IPC error) we still
      // render the list with `balancesById` empty — the row cell + total
      // gracefully fall back to opening balance only.
      const [listResp, balancesResp, usageResp] = await Promise.all([
        listAccounts({ includeArchived: showArchived }),
        getAccountBalances().catch(() => null),
        listAccountsUsage(),
      ]);
      const balancesById = new Map<string, number>();
      if (balancesResp) {
        for (const b of balancesResp.balances) balancesById.set(b.accountId, b.net);
      }
      setState({
        kind: 'loaded',
        accounts: listResp.accounts as readonly ConfigAccount[],
        balancesById,
      });
      setUsage(new Map(usageResp.usage.map((u) => [u.accountId, u.transactionCount])));
    } catch (err) {
      setState({ kind: 'error', message: err instanceof Error ? err.message : 'unknown' });
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaved = useCallback(
    (_saved: AccountRecord) => {
      void load();
      onListChanged?.();
    },
    [load, onListChanged],
  );

  const openEditModal = useCallback((account: ConfigAccount) => {
    setEditing(account);
    setEditingUsageCount(null);
    // Fire-and-forget: the count is only consulted on Save inside the
    // modal. If the listMovements call is slow or fails the modal still
    // works — the confirm dialog just won't fire (worst case: the user
    // can save without seeing the safety prompt).
    void listMovements({ accountId: account.id })
      .then((rows) => {
        setEditingUsageCount(rows.length);
      })
      .catch(() => {
        setEditingUsageCount(0);
      });
  }, []);

  const closeEditModal = useCallback(() => {
    setEditing(null);
    setEditingUsageCount(null);
  }, []);

  const handleArchive = useCallback(async () => {
    if (!archiveTarget) return;
    await archiveAccount(archiveTarget.id);
    await load();
    onListChanged?.();
  }, [archiveTarget, load, onListChanged]);

  const handleUnarchive = useCallback(
    async (id: string) => {
      try {
        await unarchiveAccount(id);
        await load();
        onListChanged?.();
      } catch (err) {
        const message =
          err instanceof ConfigMutationError
            ? mapConfigMutationErrorToMessage(err, t)
            : err instanceof Error
              ? err.message
              : t('configuracion.errors.submitFailed');
        setState({ kind: 'error', message });
      }
    },
    [load, onListChanged, t],
  );

  // WI-21-followup — hard-delete confirm handler. The button is gated in two
  // places: (a) the UI hides the destructive confirm CTA when usage > 0 and
  // surfaces "Archive instead"; (b) the IPC handler re-checks usage server-
  // side and returns HAS_REFERENCES if a race introduced a transaction
  // between the listUsage fetch and the click.
  const deleteUsage = deleteTarget ? (usage.get(deleteTarget.id) ?? 0) : 0;
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      if (deleteUsage > 0) {
        // User clicked "Archive instead".
        await archiveAccount(target.id);
      } else {
        await deleteAccount(target.id);
      }
      await load();
      onListChanged?.();
    } catch (err) {
      const message =
        err instanceof ConfigMutationError
          ? err.code === 'HAS_REFERENCES'
            ? t('configuracion.cuentas.delete.error.hasReferences', {
                count: err.transactionCount ?? 0,
              })
            : mapConfigMutationErrorToMessage(err, t)
          : err instanceof Error
            ? err.message
            : t('configuracion.errors.submitFailed');
      setState({ kind: 'error', message });
      await load();
    }
  }, [deleteTarget, deleteUsage, load, onListChanged, t]);

  const visibleAccounts =
    state.kind === 'loaded' ? state.accounts.filter((a) => showArchived || !isArchived(a)) : [];

  const filteredAccounts = visibleAccounts.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.name.toLowerCase().includes(q) ||
      (a.bankName || '').toLowerCase().includes(q) ||
      (a.label || '').toLowerCase().includes(q) ||
      (a.iban || '').toLowerCase().includes(q)
    );
  });

  const balancesById = state.kind === 'loaded' ? state.balancesById : new Map<string, number>();
  const currentBalanceFor = (a: ConfigAccount): number =>
    a.openingBalance + (balancesById.get(a.id) ?? 0);

  const totalBalance =
    state.kind === 'loaded'
      ? state.accounts
          .filter((a) => !isArchived(a))
          .reduce((sum, a) => sum + currentBalanceFor(a), 0)
      : 0;

  return (
    <>
      <header className="ot-page-header ot-config__tab-header">
        <div>
          <h1>{t('configuracion.cuentas.heading')}</h1>
          <p className="ot-page-header__subtitle">{t('configuracion.cuentas.subtitle')}</p>
          {state.kind === 'loaded' && state.accounts.length > 0 ? (
            <div className="ot-page-header__stats">
              <span>
                {t('configuracion.cuentas.stats.count', { count: state.accounts.length })}
              </span>
              <span className="ot-page-header__stat-separator">·</span>
              <span>
                {t('configuracion.cuentas.stats.totalBalance')}{' '}
                <strong
                  style={{
                    color:
                      totalBalance >= 0
                        ? 'var(--color-status-success)'
                        : 'var(--color-status-error)',
                  }}
                >
                  {formatCurrency(totalBalance)}
                </strong>
              </span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {state.kind === 'loaded' && state.accounts.length > 0 ? (
            <Button
              variant="primary"
              size="md"
              leadingIcon={<Plus size={16} />}
              onClick={() => setModalOpen(true)}
            >
              {t('configuracion.cuentas.add')}
            </Button>
          ) : null}
        </div>
      </header>

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
                placeholder={t('configuracion.cuentas.filter.search')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <label className="ot-config__archived-toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              {t('configuracion.archivedToggle')}
            </label>
            <span className="ot-config__filter-count">
              {t('configuracion.filterCount', {
                matched: filteredAccounts.length,
                total: visibleAccounts.length,
              })}
            </span>
          </div>

          <div className="ot-config__table-wrapper">
            <table className="ot-config__table ot-config__table--accounts">
              <colgroup>
                <col style={{ width: '56px' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '120px' }} />
              </colgroup>
              <thead>
                <tr>
                  <th></th>
                  <th>{t('configuracion.cuentas.columns.name')}</th>
                  <th>{t('configuracion.cuentas.columns.bank')}</th>
                  <th>{t('configuracion.cuentas.columns.label')}</th>
                  <th>{t('configuracion.cuentas.columns.iban')}</th>
                  <th className="align-right">{t('configuracion.cuentas.columns.balance')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.length > 0 ? (
                  filteredAccounts.map((a) => {
                    const isRevealed = revealed.has(a.id);
                    const swatch = a.color || 'var(--color-brand-primary)';
                    const archived = isArchived(a);
                    return (
                      <tr key={a.id} className={archived ? 'ot-config__row--archived' : undefined}>
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
                          <div style={{ fontWeight: 'var(--font-weight-medium)' }}>
                            {a.name}
                            {archived ? (
                              <span className="ot-config__archived-badge">
                                {t('configuracion.archivedBadge')}
                              </span>
                            ) : null}
                          </div>
                          <div className="ot-config__meta-text">
                            {a.isPaypal
                              ? t('configuracion.cuentas.row.externalPlatform')
                              : t('configuracion.cuentas.row.bankAccount')}
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
                                title={
                                  isRevealed
                                    ? t('configuracion.cuentas.iban.hide')
                                    : t('configuracion.cuentas.iban.show')
                                }
                                aria-label={
                                  isRevealed
                                    ? t('configuracion.cuentas.iban.hide')
                                    : t('configuracion.cuentas.iban.show')
                                }
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
                              currentBalanceFor(a) >= 0
                                ? 'var(--color-status-success)'
                                : 'var(--color-status-error)',
                            fontWeight: 'var(--font-weight-medium)',
                          }}
                        >
                          {formatCurrency(currentBalanceFor(a))}
                        </td>
                        <td>
                          <div className="ot-config__row-actions">
                            {archived ? (
                              <>
                                <button
                                  className="ot-config__row-action-btn"
                                  title={t('configuracion.cuentas.adjustBalance.actionTooltip')}
                                  aria-label={t(
                                    'configuracion.cuentas.adjustBalance.actionTooltip',
                                  )}
                                  onClick={() => setAdjusting(a)}
                                >
                                  <Scale size={14} />
                                </button>
                                <button
                                  className="ot-config__row-action-btn"
                                  title={t('configuracion.unarchiveTooltip')}
                                  aria-label={t('configuracion.unarchiveTooltip')}
                                  onClick={() => void handleUnarchive(a.id)}
                                >
                                  <RotateCcw size={14} />
                                </button>
                                <button
                                  className="ot-config__row-action-btn ot-config__row-action-btn--danger"
                                  title={t('configuracion.cuentas.delete.actionTooltip')}
                                  aria-label={t('configuracion.cuentas.delete.actionTooltip')}
                                  onClick={() => setDeleteTarget(a)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="ot-config__row-action-btn"
                                  title={t('configuracion.cuentas.actions.editTooltip')}
                                  aria-label={t('configuracion.cuentas.actions.editTooltip')}
                                  onClick={() => openEditModal(a)}
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  className="ot-config__row-action-btn"
                                  title={t('configuracion.cuentas.adjustBalance.actionTooltip')}
                                  aria-label={t(
                                    'configuracion.cuentas.adjustBalance.actionTooltip',
                                  )}
                                  onClick={() => setAdjusting(a)}
                                >
                                  <Scale size={14} />
                                </button>
                                <button
                                  className="ot-config__row-action-btn"
                                  title={t('configuracion.cuentas.actions.archiveTooltip')}
                                  aria-label={t('configuracion.cuentas.actions.archiveTooltip')}
                                  onClick={() => setArchiveTarget(a)}
                                >
                                  <Archive size={14} />
                                </button>
                                <button
                                  className="ot-config__row-action-btn ot-config__row-action-btn--danger"
                                  title={t('configuracion.cuentas.delete.actionTooltip')}
                                  aria-label={t('configuracion.cuentas.delete.actionTooltip')}
                                  onClick={() => setDeleteTarget(a)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="ot-config__table-empty">
                      {t('configuracion.cuentas.empty.noMatch')}
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
        onSaved={handleSaved}
      />
      <AddAccountModal
        isOpen={editing !== null}
        mode="edit"
        record={editing}
        usageCount={editingUsageCount ?? 0}
        onClose={closeEditModal}
        onSaved={handleSaved}
      />
      <ArchiveConfirmModal
        isOpen={archiveTarget !== null}
        entity="cuentas"
        name={archiveTarget?.name ?? ''}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
      />
      <BalanceAdjustmentModal
        isOpen={adjusting !== null}
        account={adjusting}
        onClose={() => setAdjusting(null)}
        onSaved={() => {
          void load();
          onListChanged?.();
        }}
      />
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        variant={deleteUsage > 0 ? 'default' : 'destructive'}
        title={t(
          deleteUsage > 0
            ? 'configuracion.cuentas.delete.confirmHasRefs.title'
            : 'configuracion.cuentas.delete.confirmEmpty.title',
        )}
        message={
          deleteUsage > 0
            ? t('configuracion.cuentas.delete.confirmHasRefs.body', { count: deleteUsage })
            : t('configuracion.cuentas.delete.confirmEmpty.body')
        }
        confirmLabel={t(
          deleteUsage > 0
            ? 'configuracion.cuentas.delete.confirmHasRefs.archiveCta'
            : 'configuracion.cuentas.delete.confirmEmpty.confirmCta',
        )}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
