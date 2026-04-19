import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { AccountCard } from '../../components/AccountCard/index.js';
import { KPIStrip } from '../../components/KPIStrip/index.js';
import { Table } from '../../components/Table/index.js';
import type { TableColumn } from '../../components/Table/Table.js';
import type {
  Account,
  AccountBalance,
  GetMonthKPIsResponse,
  GetAccountSparklinesResponse,
  RecentTransaction,
} from '../../../shared/ipc-contracts/panel';
import * as panelApi from '../../services/panelApi.js';

type PanelState = 'skeleton' | 'loaded' | 'error';

interface PanelData {
  accounts: Account[];
  balances: AccountBalance[];
  kpis: GetMonthKPIsResponse['kpis'];
  sparklines: Map<string, GetAccountSparklinesResponse['sparkline']>;
  transactions: RecentTransaction[];
}

/**
 * Panel (Dashboard) — landing screen showing account balances, current-month
 * KPIs, a 12-month trend chart placeholder, and the latest 8 transactions.
 * Read-only surface; all mutations happen on Movements.
 */
export function PanelScreen(): JSX.Element {
  const { t } = useTranslation('common');
  const [state, setState] = useState<PanelState>('skeleton');
  const [data, setData] = useState<PanelData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadPanel() {
      try {
        setState('skeleton');

        // Fire IPC queries in parallel
        // Note: get KPIs and recent tx without params; sparklines per-account (sequential for now)
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

        const [accountsResp, balancesResp, kpisResp, transactionsResp] = await Promise.all([
          panelApi.getAccounts(),
          panelApi.getAccountBalances(),
          panelApi.getMonthKPIs(currentMonth),
          panelApi.queryRecentTransactions(8),
        ]);

        if (cancelled) return;

        // Fetch sparklines for each account (parallel)
        const sparklinePromises = accountsResp.accounts.map((acc) =>
          panelApi.getAccountSparklines(acc.id).then((resp) => [acc.id, resp.sparkline] as const)
        );
        const sparklineEntries = await Promise.all(sparklinePromises);

        if (cancelled) return;

        setData({
          accounts: accountsResp.accounts,
          balances: balancesResp.balances,
          kpis: kpisResp.kpis,
          sparklines: new Map(sparklineEntries),
          transactions: transactionsResp.transactions,
        });
        setState('loaded');
      } catch (err) {
        if (cancelled) return;
        console.error('Panel query failed:', err);
        setState('error');
      }
    }

    loadPanel();

    return () => {
      cancelled = true;
    };
  }, []);

  // Skeleton state
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

  // Error state
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
            No se pudo cargar el Panel. Inténtalo de nuevo.
          </p>
          <Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>
        </div>
      </div>
    );
  }

  // Loaded state
  const { accounts, balances, kpis, sparklines, transactions } = data;

  // Merge account data with balances
  const accountsWithBalances = accounts.map((acc) => {
    const balance = balances.find((b) => b.accountId === acc.id);
    const sparkline = sparklines.get(acc.id);
    const displayName = acc.bankNameShort ?? acc.bankName;
    // Count transactions from balance data (not in Account schema)
    const txCount = kpis.transactionCount; // approximate for now; real impl needs per-account count
    return {
      ...acc,
      displayName,
      transactionCount: txCount,
      balance: balance?.net ?? 0,
      hasSparkline: sparkline && sparkline.months.length >= 3 ? true : false,
    };
  });

  // Format month for display
  const formatMonth = (yearMonth: string) => {
    const parts = yearMonth.split('-');
    if (parts.length !== 2) return yearMonth;
    const [year, month] = parts;
    const date = new Date(parseInt(year!), parseInt(month!) - 1, 1);
    return new Intl.DateTimeFormat(navigator.language, { month: 'long', year: 'numeric' }).format(
      date
    );
  };

  // Recent transactions table columns
  const columns: TableColumn<RecentTransaction>[] = [
    {
      id: 'type',
      header: '',
      width: 32,
      align: 'center',
      render: (row) =>
        row.type === 'income' ? (
          <ArrowUp size={16} style={{ color: 'var(--color-income-default)' }} />
        ) : (
          <ArrowDown size={16} style={{ color: 'var(--color-expense-default)' }} />
        ),
    },
    {
      id: 'date',
      header: t('movements.columns.date'),
      width: 120,
      render: (row) =>
        new Intl.DateTimeFormat(navigator.language, { dateStyle: 'medium' }).format(
          new Date(row.date)
        ),
    },
    {
      id: 'account',
      header: t('movements.columns.account'),
      width: 140,
      render: (row) => {
        // Lookup account label from accountId
        const account = accounts.find((a) => a.id === row.accountId);
        return <span className="ot-account-pill">{account?.accountLabel ?? 'Unknown'}</span>;
      },
    },
    {
      id: 'description',
      header: t('movements.columns.observations'),
      render: (row) => (
        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.description}
        </span>
      ),
    },
    {
      id: 'category',
      header: t('movements.columns.category'),
      width: 140,
      render: (row) =>
        row.categoryId ? (
          row.categoryId
        ) : (
          <span className="ot-badge ot-badge--subtle">{t('panel.recent.uncategorized')}</span>
        ),
    },
    {
      id: 'subcategory',
      header: t('movements.columns.subcategory'),
      width: 140,
      render: (row) => row.subcategoryId ?? '—',
    },
    {
      id: 'amount',
      header: t('movements.columns.amount'),
      width: 120,
      align: 'right',
      tabular: true,
      render: (row) => {
        const signed = row.type === 'expense' ? -row.amount : row.amount;
        return (
          <span
            style={{
              color:
                row.type === 'income'
                  ? 'var(--color-income-default)'
                  : 'var(--color-expense-default)',
            }}
          >
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
      <Table
        columns={columns}
        rows={transactions}
        getRowKey={(row) => row.id}
        caption={t('panel.sections.recent')}
        footer={
          <div style={{ padding: 16, textAlign: 'center' }}>
            <a
              href="/movements?range=this-month"
              style={{
                color: 'var(--color-brand-primary)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                textDecoration: 'none',
              }}
            >
              {t('panel.cta.view-all-movements')} →
            </a>
          </div>
        }
      />
    </div>
  );
}

