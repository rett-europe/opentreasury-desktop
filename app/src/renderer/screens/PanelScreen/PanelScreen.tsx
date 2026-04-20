import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { AccountCard } from '../../components/AccountCard/index.js';
import { KPIStrip } from '../../components/KPIStrip/index.js';
import { Table } from '../../components/Table/index.js';
import type { TableColumn } from '../../components/Table/Table.js';
import { TransactionDetailModal } from '../../components/TransactionDetailModal/index.js';
import type {
  Account,
  AccountBalance,
  GetMonthKPIsResponse,
  GetAccountSparklinesResponse,
  RecentTransaction,
} from '../../../shared/ipc-contracts/panel';
import type { UpdateTransactionRequest } from '../../../shared/ipc-contracts/transaction.js';
import * as panelApi from '../../services/panelApi.js';
import { updateTransaction, deleteTransaction } from '../../services/transactionApi.js';
import './PanelScreen.css';

type PanelState = 'skeleton' | 'loaded' | 'error';

interface PanelData {
  accounts: Account[];
  balances: AccountBalance[];
  kpis: GetMonthKPIsResponse['kpis'];
  sparklines: Map<string, GetAccountSparklinesResponse['sparkline']>;
  transactions: RecentTransaction[];
}

// Mock per-account transaction counts mirroring prototype/data.js. Replaced
// with a real aggregate once Morpheus exposes a per-account count field on
// the balance contract (WI-6).
const MOCK_TX_COUNTS: Readonly<Record<string, number>> = {
  unicaja: 703,
  'caixa-ops': 5,
  'caixa-fin': 1,
  'caixa-0951': 1,
  paypal: 13,
};

/**
 * Panel (Dashboard) — landing screen showing account balances, current-month
 * KPIs, a 12-month trend chart placeholder, and the latest 8 transactions.
 * Read-only surface; all mutations happen on Movements.
 */
export function PanelScreen(): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<PanelState>('skeleton');
  const [data, setData] = useState<PanelData | null>(null);
  const [selectedTx, setSelectedTx] = useState<RecentTransaction | null>(null);

  const loadPanel = async () => {
    try {
      setState('skeleton');

      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

      const [accountsResp, balancesResp, kpisResp, transactionsResp] = await Promise.all([
        panelApi.getAccounts(),
        panelApi.getAccountBalances(),
        panelApi.getMonthKPIs(currentMonth),
        panelApi.queryRecentTransactions(8),
      ]);

      const sparklinePromises = accountsResp.accounts.map((acc) =>
        panelApi.getAccountSparklines(acc.id).then((resp) => [acc.id, resp.sparkline] as const),
      );
      const sparklineEntries = await Promise.all(sparklinePromises);

      setData({
        accounts: accountsResp.accounts,
        balances: balancesResp.balances,
        kpis: kpisResp.kpis,
        sparklines: new Map(sparklineEntries),
        transactions: transactionsResp.transactions,
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

  if (state === 'skeleton') {
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

  if (state === 'error' || !data) {
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

  const { accounts, balances, kpis, sparklines, transactions } = data;
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const accountsWithBalances = accounts.map((acc) => {
    const balance = balances.find((b) => b.accountId === acc.id);
    const sparkline = sparklines.get(acc.id);
    const displayName = acc.bankNameShort ?? acc.bankName;
    const txCount = MOCK_TX_COUNTS[acc.id] ?? kpis.transactionCount;
    return {
      ...acc,
      displayName,
      transactionCount: txCount,
      balance: balance?.net ?? 0,
      hasSparkline: sparkline && sparkline.months.length >= 3 ? true : false,
    };
  });

  const formatMonth = (yearMonth: string) => {
    const parts = yearMonth.split('-');
    if (parts.length !== 2) return yearMonth;
    const [year, month] = parts;
    const date = new Date(parseInt(year!), parseInt(month!) - 1, 1);
    return new Intl.DateTimeFormat(navigator.language, { month: 'long', year: 'numeric' }).format(
      date,
    );
  };

  // Recent transactions table columns — arrow chip + account pill + amount
  // tone mirror MovementsScreen so a truncated Panel row looks identical to
  // the equivalent row on the full transactions screen.
  const columns: TableColumn<RecentTransaction>[] = [
    {
      id: 'type',
      header: '',
      width: 36,
      align: 'center',
      render: (row) => {
        const cls =
          row.type === 'income'
            ? 'ot-type-arrow ot-type-arrow--income'
            : 'ot-type-arrow ot-type-arrow--expense';
        return (
          <span className={cls} aria-hidden="true">
            {row.type === 'income' ? '↑' : '↓'}
          </span>
        );
      },
    },
    {
      id: 'date',
      header: t('movements.columns.date'),
      width: 120,
      tabular: true,
      render: (row) =>
        new Intl.DateTimeFormat(navigator.language, { dateStyle: 'medium' }).format(
          new Date(`${row.date}T00:00:00Z`),
        ),
    },
    {
      id: 'account',
      header: t('movements.columns.account'),
      width: 160,
      render: (row) => {
        const account = accountById.get(row.accountId);
        const label =
          account?.bankNameShort ?? account?.accountLabel ?? t('panel.recent.unknownAccount');
        const color = account?.color ?? 'var(--color-brand-primary)';
        return (
          <span
            className="ot-account-pill"
            style={{
              background: `color-mix(in oklch, ${color} 18%, transparent)`,
              color: 'var(--color-text-primary)',
            }}
          >
            <span
              className="ot-account-pill__dot"
              aria-hidden="true"
              style={{ background: color }}
            />
            {label}
          </span>
        );
      },
    },
    {
      id: 'description',
      header: t('movements.columns.observations'),
      render: (row) => <span className="ot-panel-recent__desc">{row.description}</span>,
    },
    {
      id: 'category',
      header: t('movements.columns.category'),
      width: 150,
      render: (row) =>
        row.categoryId ? (
          row.categoryId
        ) : (
          <span className="ot-badge ot-badge--uncategorized">
            {t('panel.recent.uncategorized')}
          </span>
        ),
    },
    {
      id: 'subcategory',
      header: t('movements.columns.subcategory'),
      width: 160,
      render: (row) =>
        row.subcategoryId ? (
          <span className="ot-text-muted">{row.subcategoryId}</span>
        ) : (
          <span className="ot-text-muted">—</span>
        ),
    },
    {
      id: 'amount',
      header: t('movements.columns.amount'),
      width: 120,
      align: 'right',
      tabular: true,
      render: (row) => {
        const cls = row.type === 'income' ? 'ot-amount--income' : 'ot-amount--expense';
        const signed = row.type === 'expense' ? -row.amount : row.amount;
        return (
          <span className={cls}>
            {new Intl.NumberFormat(navigator.language, {
              style: 'currency',
              currency: 'EUR',
              signDisplay: 'auto',
            }).format(signed)}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <header className="ot-page-header">
        <div>
          <h1>{t('panel.title')}</h1>
          <p className="ot-page-header__subtitle">{t('panel.subtitle')}</p>
        </div>
        <div className="ot-page-header__actions">
          <Button variant="secondary" leadingIcon={<Calendar size={16} />} disabled>
            {formatMonth(kpis.yearMonth)}
          </Button>
        </div>
      </header>

      <div className="ot-section-label">{t('panel.sections.accounts')}</div>
      <div className="ot-account-cards">
        {accountsWithBalances.map((acc) => (
          <AccountCard
            key={acc.id}
            shortName={acc.displayName}
            color={acc.color ?? '#888888'}
            transactionCount={acc.transactionCount}
            balance={acc.balance}
            hasSparkline={acc.hasSparkline}
          />
        ))}
      </div>

      <div className="ot-section-label">{t('panel.sections.summary')}</div>
      <KPIStrip
        income={kpis.income}
        expense={kpis.expense}
        net={kpis.net}
        month={formatMonth(kpis.yearMonth)}
      />

      <div className="ot-section-label">{t('panel.sections.monthly-trend')}</div>
      <div className="ot-skeleton" style={{ minHeight: 180, borderRadius: 12 }}>
        {t('panel.skeleton')}
      </div>

      <div className="ot-section-label" style={{ marginTop: 'var(--space-9)' }}>
        {t('panel.sections.recent')}
      </div>
      <div className="ot-panel-recent">
        <Table
          columns={columns}
          rows={transactions}
          getRowKey={(row) => row.id}
          caption={t('panel.sections.recent')}
          onRowClick={(row) => setSelectedTx(row)}
        />
        <div className="ot-panel-recent__footer">
          <a className="ot-panel-recent__link" href="/movements?range=this-month">
            {t('panel.cta.view-all-movements')} →
          </a>
        </div>
      </div>

      <TransactionDetailModal
        isOpen={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
        transaction={selectedTx}
        accounts={accounts}
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
