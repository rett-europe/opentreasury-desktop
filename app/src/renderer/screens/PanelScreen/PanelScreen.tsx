import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { AccountCard } from '../../components/AccountCard/index.js';
import { KPIStrip } from '../../components/KPIStrip/index.js';
import { GroupedBarChart } from '../../components/GroupedBarChart/index.js';
import { TransactionsTable } from '../../components/TransactionsTable/index.js';
import { useFormatters } from '../../format/index.js';
import type { TransactionRow } from '../../components/TransactionsTable/index.js';
import { TransactionDetailModal } from '../../components/TransactionDetailModal/index.js';
import { last90Days } from '../../utils/datePresets.js';
import type {
  Account,
  AccountBalance,
  GetRangeKPIsResponse,
  GetAccountSparklinesResponse,
  RecentTransaction,
  MonthlyIncomeExpense,
} from '../../../shared/ipc-contracts/panel';
import type { UpdateTransactionRequest } from '../../../shared/ipc-contracts/transaction.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import * as panelApi from '../../services/panelApi.js';
import { listAccounts } from '../../services/accountsApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';
import { updateTransaction, deleteTransaction } from '../../services/transactionApi.js';
import './PanelScreen.css';

type PanelState = 'skeleton' | 'loaded' | 'error';

interface PanelData {
  accounts: Account[];
  balances: AccountBalance[];
  // Current balance per account = configured opening balance + all-time net
  // (same formula as Configuración → Cuentas, so both screens agree).
  currentBalances: Map<string, number>;
  kpis: GetRangeKPIsResponse['kpis'];
  sparklines: Map<string, GetAccountSparklinesResponse['sparkline']>;
  transactions: RecentTransaction[];
  categories: CategoryRecord[];
  tags: TagRecord[];
  monthlyData: MonthlyIncomeExpense[];
  accountTransactionCounts: Record<string, number>;
}

/**
 * Panel (Dashboard) — landing screen showing account balances, current-month
 * KPIs, a 12-month trend chart placeholder, and the latest 8 transactions.
 * Read-only surface; all mutations happen on Movements.
 */
export function PanelScreen({
  onNavigateToMovementsWithAccount,
  onSeeAllMovements,
}: {
  readonly onNavigateToMovementsWithAccount?: (filters: { accountId: string }) => void;
  readonly onSeeAllMovements?: () => void;
} = {}): JSX.Element {
  const { t } = useTranslation('common');
  const { formatMonth } = useFormatters();
  const [state, setState] = useState<PanelState>('skeleton');
  const [data, setData] = useState<PanelData | null>(null);
  const [selectedTx, setSelectedTx] = useState<RecentTransaction | null>(null);

  const loadPanel = async () => {
    try {
      setState('skeleton');

      const range = last90Days(new Date());

      const [
        accountsResp,
        balancesResp,
        kpisResp,
        transactionsResp,
        categoriesResp,
        tagsResp,
        monthlyResp,
        countsResp,
        allTimeResp,
        accountRecordsResp,
      ] = await Promise.all([
        panelApi.getAccounts(),
        panelApi.getAccountBalancesInRange(range.from, range.to),
        panelApi.getRangeKPIs(range.from, range.to),
        panelApi.queryRecentTransactions(8),
        listCategories(),
        listTags(),
        panelApi.getMonthlyIncomeExpense(),
        panelApi.getAccountTransactionCountsInRange(range.from, range.to),
        panelApi.getAccountBalances(),
        listAccounts({ includeArchived: true }),
      ]);

      const allTimeNet = new Map(allTimeResp.balances.map((b) => [b.accountId, b.net] as const));
      const currentBalances = new Map<string, number>();
      for (const rec of accountRecordsResp.accounts) {
        const cents =
          Math.round(rec.openingBalance * 100) + Math.round((allTimeNet.get(rec.id) ?? 0) * 100);
        currentBalances.set(rec.id, cents / 100);
      }

      const sparklinePromises = accountsResp.accounts.map((acc) =>
        panelApi.getAccountSparklines(acc.id).then((resp) => [acc.id, resp.sparkline] as const),
      );
      const sparklineEntries = await Promise.all(sparklinePromises);

      setData({
        accounts: accountsResp.accounts,
        balances: balancesResp.balances,
        currentBalances,
        kpis: kpisResp.kpis,
        sparklines: new Map(sparklineEntries),
        transactions: transactionsResp.transactions,
        categories: categoriesResp.categories,
        tags: tagsResp.tags,
        monthlyData: monthlyResp.months,
        accountTransactionCounts: countsResp.counts,
      });
      setState('loaded');
    } catch (err) {
      console.error('Panel query failed:', err);
      setState('error');
    }
  };

  useEffect(() => {
    loadPanel();
  }, []);

  // Build lookup maps for TransactionsTable
  const accountLookup = useMemo(() => {
    if (!data) return new Map();
    const map = new Map<string, { name: string; color: string }>();
    for (const acc of data.accounts) {
      map.set(acc.id, {
        name: acc.bankNameShort ?? acc.accountLabel,
        color: acc.color ?? '#888888',
      });
    }
    return map;
  }, [data]);

  const categoryLookup = useMemo(() => {
    if (!data) return new Map();
    const map = new Map<string, string>();
    for (const cat of data.categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [data]);

  const subcategoryLookup = useMemo(() => {
    if (!data) return new Map();
    const map = new Map<string, string>();
    for (const cat of data.categories) {
      for (const sub of cat.subcategories ?? []) {
        map.set(sub.id, sub.name);
      }
    }
    return map;
  }, [data]);

  const tagLookup = useMemo(() => {
    if (!data) return new Map();
    const map = new Map<string, { name: string; color: string }>();
    for (const tag of data.tags) {
      map.set(tag.id, { name: tag.name, color: tag.color ?? '#9b72cf' });
    }
    return map;
  }, [data]);

  // Map RecentTransaction[] → TransactionRow[] for the shared table
  const transactionRows: readonly TransactionRow[] = useMemo(() => {
    if (!data) return [];
    return data.transactions.map((tx) => {
      const row: TransactionRow = {
        id: tx.id,
        date: tx.date,
        type: tx.type,
        amount: tx.amount,
        description: tx.description,
        accountId: tx.accountId,
        categoryId: tx.categoryId,
        subcategoryId: tx.subcategoryId,
        tagIds: tx.tagIds,
        status: tx.status,
        reference: tx.reference ?? null,
        details: tx.details ?? null,
      };
      return row;
    });
  }, [data]);

  // Only render the skeleton placeholder for the *initial* load (when we
  // have no data yet). Subsequent reloads triggered by mutations (e.g. the
  // detail modal's onUpdate calls `loadPanel()` which sets state back to
  // 'skeleton') must NOT replace the loaded view, because the open
  // <TransactionDetailModal> lives in the loaded branch. Unmounting a
  // native dialog mid-open leaks Chromium's top-layer ownership and
  // freezes every input in the app. See
  // hooks/useCloseDialogOnUnmount for the full story.
  if (state === 'skeleton' && !data) {
    return (
      <div>
        <header className="ot-page-header">
          <div>
            <h1>{t('panel.title')}</h1>
            <p className="ot-page-header__subtitle">{t('panel.subtitle')}</p>
          </div>
          <div className="ot-page-header__actions">
            <Button variant="secondary" leadingIcon={<Calendar size={16} />} disabled>
              {t('panel.cta.date-range')}
            </Button>
          </div>
        </header>

        <div className="ot-section-label">{t('panel.sections.accounts')}</div>
        <div className="ot-account-cards">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="ot-skeleton" style={{ height: 140, borderRadius: 12 }} />
          ))}
        </div>

        <div className="ot-section-label">{t('panel.sections.summary')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="ot-skeleton" style={{ height: 120, borderRadius: 12 }} />
          ))}
        </div>

        <div className="ot-section-label" style={{ marginTop: 32 }}>
          {t('panel.sections.monthly-trend')}
        </div>
        <div className="ot-skeleton" style={{ minHeight: 180, borderRadius: 12 }} />

        <div className="ot-section-label" style={{ marginTop: 32 }}>
          {t('panel.sections.recent')}
        </div>
        <div className="ot-skeleton" style={{ minHeight: 320, borderRadius: 12 }} />
      </div>
    );
  }

  // Once `data` is populated we always render the loaded view, even if a
  // subsequent reload puts `state` back into 'skeleton' or 'error' — the
  // open <TransactionDetailModal> must stay mounted to avoid the native
  // dialog top-layer leak (see hooks/useCloseDialogOnUnmount).
  if (state === 'error' && !data) {
    return (
      <div>
        <header className="ot-page-header">
          <div>
            <h1>{t('panel.title')}</h1>
            <p className="ot-page-header__subtitle">{t('panel.subtitle')}</p>
          </div>
        </header>
        <div
          style={{
            padding: '40px',
            textAlign: 'center',
            background: 'var(--color-surface-secondary)',
            borderRadius: 12,
          }}
        >
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            {t('panel.error.loadFailed')}
          </p>
          <Button onClick={() => window.location.reload()}>{t('panel.error.retry')}</Button>
        </div>
      </div>
    );
  }

  // Defensive: by this point data should always be non-null (skeleton +
  // error guards above), but keep the TS narrowing safe in case a future
  // state transition leaves us in an unexpected combo.
  if (!data) return <></>;

  const {
    accounts,
    balances,
    currentBalances,
    kpis,
    sparklines,
    transactions,
    categories,
    tags,
    accountTransactionCounts,
  } = data;

  const accountsWithBalances = accounts.map((acc) => {
    const balance = balances.find((b) => b.accountId === acc.id);
    const sparkline = sparklines.get(acc.id);
    const displayName = acc.accountLabel ?? acc.bankNameShort ?? acc.bankName;
    const txCount = accountTransactionCounts[acc.id] ?? 0;
    return {
      ...acc,
      displayName,
      transactionCount: txCount,
      balance: currentBalances.get(acc.id) ?? 0,
      periodNet: balance?.net ?? 0,
      hasSparkline: sparkline && sparkline.months.length >= 3 ? true : false,
    };
  });

  return (
    <div>
      <header className="ot-page-header">
        <div>
          <h1>{t('panel.title')}</h1>
          <p className="ot-page-header__subtitle">{t('panel.subtitle')}</p>
        </div>
        <div className="ot-page-header__actions">
          <Button variant="secondary" leadingIcon={<Calendar size={16} />} disabled>
            {t('panel.cta.date-range')}
          </Button>
        </div>
      </header>

      <div className="ot-section-label">{t('panel.sections.accounts')}</div>
      <div className="ot-account-cards">
        {accountsWithBalances.map((acc) => {
          const cardProps: {
            shortName: string;
            color: string;
            transactionCount: number;
            balance: number;
            periodNet: number;
            hasSparkline: boolean;
            onClick?: () => void;
          } = {
            shortName: acc.displayName,
            color: acc.color ?? '#888888',
            transactionCount: acc.transactionCount,
            balance: acc.balance,
            periodNet: acc.periodNet,
            hasSparkline: acc.hasSparkline,
          };
          if (onNavigateToMovementsWithAccount) {
            cardProps.onClick = () => onNavigateToMovementsWithAccount({ accountId: acc.id });
          }
          return <AccountCard key={acc.id} {...cardProps} />;
        })}
      </div>

      <div className="ot-section-label">{t('panel.sections.summary')}</div>
      <KPIStrip income={kpis.income} expense={kpis.expense} net={kpis.net} />

      <div className="ot-section-label">{t('panel.sections.monthly-trend')}</div>
      <GroupedBarChart
        series={data.monthlyData.map((m) => {
          const monthLabel = formatMonth(m.yearMonth);
          return {
            label: monthLabel,
            values: [m.income, m.expense],
            barClassNames: [
              'ot-grouped-bar-chart__bar--income-solo',
              'ot-grouped-bar-chart__bar--expense-solo',
            ],
          };
        })}
        legend={[
          {
            label: t('movements.totals.income'),
            className: 'ot-grouped-bar-chart__swatch--income-solo',
          },
          {
            label: t('movements.totals.expense'),
            className: 'ot-grouped-bar-chart__swatch--expense-solo',
          },
        ]}
        currency="EUR"
        ariaLabel={t('panel.sections.monthly-trend')}
        dataTableCaption={t('panel.sections.monthly-trend')}
        emptyLabel={t('panel.skeleton')}
      />

      <div className="ot-section-label" style={{ marginTop: 'var(--space-9)' }}>
        {t('panel.sections.recent')}
      </div>
      <div className="ot-panel-recent">
        <TransactionsTable
          rows={transactionRows}
          accountLookup={accountLookup}
          tagLookup={tagLookup}
          categoryLookup={categoryLookup}
          subcategoryLookup={subcategoryLookup}
          onRowClick={(row) => {
            // Convert TransactionRow back to RecentTransaction for the modal
            const tx: RecentTransaction = {
              id: row.id,
              date: row.date,
              type: row.type,
              amount: row.amount,
              currency: 'EUR',
              description: row.description,
              accountId: row.accountId,
              categoryId: row.categoryId,
              subcategoryId: row.subcategoryId,
              tagIds: [...row.tagIds],
              status: row.status as 'pending' | 'approved',
              createdAt: transactions.find((t) => t.id === row.id)?.createdAt ?? '',
              reference: row.reference ?? undefined,
              details: row.details ?? undefined,
            };
            setSelectedTx(tx);
          }}
        />
        <div className="ot-panel-recent__footer">
          <button
            type="button"
            className="ot-panel-recent__link"
            onClick={onSeeAllMovements}
            disabled={!onSeeAllMovements}
          >
            {t('panel.cta.view-all-movements')} →
          </button>
        </div>
      </div>

      <TransactionDetailModal
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts}
        categories={categories}
        tags={tags}
        onUpdate={async (input: UpdateTransactionRequest) => {
          const result = await updateTransaction(input);
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          // Reload Panel data to reflect changes
          await loadPanel();
        }}
        onDelete={async (id: string) => {
          const result = await deleteTransaction({ id });
          if (!result.ok) {
            throw new Error(result.error.message);
          }
          // Reload Panel data to reflect changes
          await loadPanel();
          setSelectedTx(null);
        }}
      />
    </div>
  );
}
