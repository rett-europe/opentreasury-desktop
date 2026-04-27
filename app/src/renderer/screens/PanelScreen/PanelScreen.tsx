import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';
import { Button } from '../../components/Button/index.js';
import { AccountCard } from '../../components/AccountCard/index.js';
import { KPIStrip } from '../../components/KPIStrip/index.js';
import { GroupedBarChart } from '../../components/GroupedBarChart/index.js';
import { Table } from '../../components/Table/index.js';
import type { TableColumn } from '../../components/Table/Table.js';
import { TransactionDetailModal } from '../../components/TransactionDetailModal/index.js';
import { formatDate, formatMonth } from '../../utils/dateFormat.js';
import { formatCurrency } from '../../utils/numberFormat.js';
import type {
  Account,
  AccountBalance,
  GetMonthKPIsResponse,
  GetAccountSparklinesResponse,
  RecentTransaction,
  MonthlyIncomeExpense,
} from '../../../shared/ipc-contracts/panel';
import type { UpdateTransactionRequest } from '../../../shared/ipc-contracts/transaction.js';
import type { CategoryRecord, TagRecord } from '../../types/config.js';
import * as panelApi from '../../services/panelApi.js';
import { listCategories } from '../../services/categoriesApi.js';
import { listTags } from '../../services/tagsApi.js';
import { updateTransaction, deleteTransaction } from '../../services/transactionApi.js';
import './PanelScreen.css';

type PanelState = 'skeleton' | 'loaded' | 'error';

interface PanelData {
  accounts: Account[];
  balances: AccountBalance[];
  kpis: GetMonthKPIsResponse['kpis'];
  sparklines: Map<string, GetAccountSparklinesResponse['sparkline']>;
  transactions: RecentTransaction[];
  categories: CategoryRecord[];
  tags: TagRecord[];
  monthlyData: MonthlyIncomeExpense[];
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
  const { t, i18n } = useTranslation('common');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';
  const [state, setState] = useState<PanelState>('skeleton');
  const [data, setData] = useState<PanelData | null>(null);
  const [selectedTx, setSelectedTx] = useState<RecentTransaction | null>(null);

  const loadPanel = async () => {
    try {
      setState('skeleton');

      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

      const [
        accountsResp,
        balancesResp,
        kpisResp,
        transactionsResp,
        categoriesResp,
        tagsResp,
        monthlyResp,
      ] = await Promise.all([
        panelApi.getAccounts(),
        panelApi.getAccountBalances(),
        panelApi.getMonthKPIs(currentMonth),
        panelApi.queryRecentTransactions(8),
        listCategories(),
        listTags(),
        panelApi.getMonthlyIncomeExpense(),
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
        categories: categoriesResp.categories,
        tags: tagsResp.tags,
        monthlyData: monthlyResp.months,
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

  const { accounts, balances, kpis, sparklines, transactions, categories, tags } = data;
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const categoryNameById = new Map<string, string>();
  const subcategoryNameById = new Map<string, string>();
  for (const cat of categories) {
    categoryNameById.set(cat.id, cat.name);
    for (const sub of cat.subcategories ?? []) {
      subcategoryNameById.set(sub.id, sub.name);
    }
  }
  const tagNameById = new Map<string, string>(tags.map((t) => [t.id, t.name]));

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

  // Tag color palette — mirrors MovementsScreen's deterministic hash
  const TAG_COLORS = [
    '#9b72cf', // brand
    '#4e8bd6', // blue
    '#e06b6b', // coral
    '#6ca974', // green
    '#d6a94e', // amber
    '#b06bd6', // violet
  ] as const;
  const tagColor = (tagName: string): string => {
    const tag = tags.find((t) => t.name === tagName);
    if (tag?.color) return tag.color;
    // Fallback: hash-based color when tag color not set
    let h = 0;
    for (let i = 0; i < tagName.length; i += 1) {
      h = (h * 31 + tagName.charCodeAt(i)) >>> 0;
    }
    return TAG_COLORS[h % TAG_COLORS.length] as string;
  };

  const statusLabel = (s: string) => t(`movements.status.${s}`);
  const statusClass = (s: string): string => {
    if (s === 'pending') return 'ot-badge ot-badge--pending';
    if (s === 'rejected') return 'ot-badge ot-badge--rejected';
    return 'ot-badge ot-badge--approved';
  };

  // Recent transactions table columns — now aligned with MovementsScreen.
  // Same headers, same order, same rendering. Only difference: no select
  // checkbox and no row actions. Dashboard is read-only; edits happen via
  // the detail modal.
  const columns: TableColumn<RecentTransaction>[] = [
    {
      id: 'type',
      header: '',
      sortable: false,
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
      sortable: false,
      tabular: true,
      render: (row) => formatDate(row.date, locale),
    },
    {
      id: 'account',
      header: t('movements.columns.account'),
      sortable: false,
      render: (row) => {
        const account = accountById.get(row.accountId);
        const label =
          account?.bankNameShort ?? account?.accountLabel ?? t('panel.recent.unknownAccount');
        const color = account?.color ?? 'var(--color-brand-primary)';
        return (
          <span
            className="ot-account-pill"
            title={label}
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
      sortable: false,
      render: (row) => (
        <span className="ot-panel-recent__desc" title={row.description}>
          {row.description}
        </span>
      ),
    },
    {
      id: 'category',
      header: t('movements.columns.category'),
      sortable: false,
      render: (row) => {
        const name = row.categoryId
          ? (categoryNameById.get(row.categoryId) ?? row.categoryId)
          : null;
        return name ? (
          <span title={name}>{name}</span>
        ) : (
          <span className="ot-badge ot-badge--uncategorized">
            {t('movements.filters.uncategorizedOnly')}
          </span>
        );
      },
    },
    {
      id: 'subcategory',
      header: t('movements.columns.subcategory'),
      sortable: false,
      render: (row) => {
        const name = row.subcategoryId
          ? (subcategoryNameById.get(row.subcategoryId) ?? row.subcategoryId)
          : null;
        return name ? <span title={name}>{name}</span> : <span className="ot-text-muted">—</span>;
      },
    },
    {
      id: 'tags',
      header: t('movements.columns.tags'),
      sortable: false,
      render: (row) => {
        const tagNames = (row.tagIds ?? []).map((id) => tagNameById.get(id) ?? id);
        if (tagNames.length === 0) return <span className="ot-text-muted">—</span>;
        // Show max 2 chips visibly; overflow as +N indicator with title listing rest
        const MAX_VISIBLE = 2;
        const visibleTags = tagNames.slice(0, MAX_VISIBLE);
        const overflowTags = tagNames.slice(MAX_VISIBLE);
        const overflowCount = overflowTags.length;
        return (
          <span className="ot-tag-cell" title={tagNames.join(', ')}>
            <span className="ot-tag-cell__chips">
              {visibleTags.map((tag) => (
                <span
                  key={tag}
                  className="ot-tag-chip"
                  style={{ ['--ot-tag-color' as string]: tagColor(tag) }}
                  title={tag}
                >
                  {tag}
                </span>
              ))}
            </span>
            {overflowCount > 0 && (
              <span className="ot-tag-cell__overflow" title={overflowTags.join(', ')}>
                +{overflowCount}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: 'status',
      header: t('movements.columns.status'),
      sortable: false,
      render: (row) => <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>,
    },
    {
      id: 'amount',
      header: t('movements.columns.amount'),
      sortable: false,
      align: 'right',
      tabular: true,
      render: (row) => {
        const cls = row.type === 'income' ? 'ot-amount--income' : 'ot-amount--expense';
        const signed = row.type === 'expense' ? -row.amount : row.amount;
        return <span className={cls}>{formatCurrency(signed, locale)}</span>;
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
            {formatMonth(kpis.yearMonth, locale)}
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
        month={formatMonth(kpis.yearMonth, locale)}
      />

      <div className="ot-section-label">{t('panel.sections.monthly-trend')}</div>
      <GroupedBarChart
        series={data.monthlyData.map((m) => {
          const monthLabel = new Date(`${m.yearMonth}-01T00:00:00Z`).toLocaleDateString(locale, {
            month: 'short',
          });
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
        locale={locale}
        ariaLabel={t('panel.sections.monthly-trend')}
        dataTableCaption={t('panel.sections.monthly-trend')}
        emptyLabel={t('panel.skeleton')}
      />

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
