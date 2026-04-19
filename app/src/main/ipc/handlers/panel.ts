// Panel IPC handlers — stub implementations returning MOCK data (WI-2)
// Trinity can import types from ipc-contracts/panel.ts and wire UI immediately.
// Real implementation (WI-6) will replace these mocks with core/query calls.
//
// Fixtures mirror prototype/data.js verbatim so the desktop Panel renders the
// same accounts, balances, KPIs and transactions as the prototype screenshot
// used as source of truth for visual parity (see .squad/decisions.md §ADR-002).

import type {
  GetAccountsRequest,
  GetAccountsResponse,
  GetAccountBalancesRequest,
  GetAccountBalancesResponse,
  GetMonthKPIsRequest,
  GetMonthKPIsResponse,
  GetAccountSparklinesRequest,
  GetAccountSparklinesResponse,
  QueryRecentTransactionsRequest,
  QueryRecentTransactionsResponse,
} from '../../../shared/ipc-contracts/panel.js';

// Prototype account IDs reused verbatim (stable between prototype and desktop
// so links, selections and colors carry over deterministically).
const ACCOUNTS_SEED = [
  {
    id: 'unicaja',
    bankName: 'Unicaja Banco',
    bankNameShort: 'Unicaja',
    accountLabel: 'Principal',
    color: 'oklch(0.72 0.11 265)',
    sortOrder: 0,
    balance: 18023.06,
    count: 703,
  },
  {
    id: 'caixa-ops',
    bankName: 'CaixaBank',
    bankNameShort: 'Caixa 5315',
    accountLabel: 'Operaciones',
    color: 'oklch(0.72 0.11 160)',
    sortOrder: 1,
    balance: -110.56,
    count: 5,
  },
  {
    id: 'caixa-fin',
    bankName: 'CaixaBank',
    bankNameShort: 'Caixa FinRett',
    accountLabel: 'FinRett',
    color: 'oklch(0.72 0.11 55)',
    sortOrder: 2,
    balance: -50.0,
    count: 1,
  },
  {
    id: 'caixa-0951',
    bankName: 'CaixaBank',
    bankNameShort: 'Caixa 0951',
    accountLabel: 'Eventos',
    color: 'oklch(0.72 0.11 20)',
    sortOrder: 3,
    balance: -50.0,
    count: 1,
  },
  {
    id: 'paypal',
    bankName: 'PayPal',
    bankNameShort: 'PayPal',
    accountLabel: 'Donaciones',
    color: 'oklch(0.72 0.11 305)',
    sortOrder: 4,
    balance: 281.1,
    count: 13,
  },
] as const;

// Prototype April-2026 transactions (first 12; Panel shows 8 by default).
// NOTE: `amount` is **absolute**; `type` carries the sign. This matches the
// `z.number().positive()` constraint on recentTransactionSchema.amount.
// `categoryId` / `subcategoryId` carry the display label on the mock side —
// WI-6 will replace these with real ULIDs + a resolver join.
interface TxSeed {
  id: string;
  date: string;
  amount: number;
  description: string;
  accountId: string;
  type: 'income' | 'expense';
  categoryLabel: string | null;
  subcategoryLabel: string | null;
  status: 'pending' | 'approved';
}

const TX_SEED: readonly TxSeed[] = [
  { id: 't001', date: '2026-04-10', amount: 5.0, description: 'Donante #A2041', accountId: 'paypal', type: 'income', categoryLabel: null, subcategoryLabel: null, status: 'pending' },
  { id: 't002', date: '2026-04-10', amount: 20.0, description: 'Donante #A2042', accountId: 'paypal', type: 'income', categoryLabel: null, subcategoryLabel: null, status: 'pending' },
  { id: 't003', date: '2026-04-08', amount: 3.03, description: 'Comisión devolución recibo', accountId: 'unicaja', type: 'expense', categoryLabel: 'Gastos', subcategoryLabel: 'Comisiones', status: 'approved' },
  { id: 't004', date: '2026-04-08', amount: 450.0, description: 'Ref. asociación 20260401/001', accountId: 'unicaja', type: 'expense', categoryLabel: 'Cuotas', subcategoryLabel: 'Cuota Socio Anual', status: 'approved' },
  { id: 't005', date: '2026-04-08', amount: 20.0, description: 'Socio #S0128', accountId: 'unicaja', type: 'income', categoryLabel: 'Cuotas', subcategoryLabel: 'Cuota Socio Mensual', status: 'approved' },
  { id: 't006', date: '2026-04-08', amount: 5.0, description: 'Comisión de mantenimiento', accountId: 'unicaja', type: 'expense', categoryLabel: 'Gastos', subcategoryLabel: 'Comisiones', status: 'approved' },
  { id: 't007', date: '2026-04-08', amount: 50.0, description: 'Socio #S0094', accountId: 'unicaja', type: 'income', categoryLabel: 'Cuotas', subcategoryLabel: 'Cuota Socio Anual', status: 'approved' },
  { id: 't008', date: '2026-04-07', amount: 1.0, description: 'Microdonación plataforma', accountId: 'unicaja', type: 'expense', categoryLabel: 'Administrativo', subcategoryLabel: 'Teaming', status: 'approved' },
  { id: 't009', date: '2026-04-06', amount: 2500.0, description: 'Donación corporativa — Empresa #E014', accountId: 'unicaja', type: 'income', categoryLabel: 'Donaciones', subcategoryLabel: 'Empresas', status: 'approved' },
  { id: 't010', date: '2026-04-05', amount: 5000.0, description: 'Subvención autonómica — Programa anual', accountId: 'unicaja', type: 'income', categoryLabel: 'Subvenciones', subcategoryLabel: 'Públicas', status: 'approved' },
  { id: 't011', date: '2026-04-05', amount: 92.4, description: 'Recibo telefonía — Línea oficina', accountId: 'unicaja', type: 'expense', categoryLabel: 'Gastos', subcategoryLabel: 'Comunicación', status: 'approved' },
  { id: 't012', date: '2026-04-04', amount: 750.0, description: 'Recaudación mercadillo solidario', accountId: 'caixa-0951', type: 'income', categoryLabel: 'Eventos', subcategoryLabel: 'Mercadillos', status: 'approved' },
];

// April 2026 aggregates (from prototype monthSummary).
const KPIS_APR_2026 = {
  income: 48843.79,
  expense: 30750.19,
  net: 18093.6,
  transactionCount: 18,
};

// Prototype monthly history — used to generate per-account sparklines with a
// stable per-account seed so the line shapes don't flicker between reloads.
const MONTHLY_HISTORY = [
  { yearMonth: '2025-05', base: 4980 - 3210 },
  { yearMonth: '2025-06', base: 7340 - 4500 },
  { yearMonth: '2025-07', base: 3890 - 2440 },
  { yearMonth: '2025-08', base: 2150 - 1780 },
  { yearMonth: '2025-09', base: 5620 - 3120 },
  { yearMonth: '2025-10', base: 6890 - 3950 },
  { yearMonth: '2025-11', base: 8240 - 4210 },
  { yearMonth: '2025-12', base: 12450 - 5820 },
  { yearMonth: '2026-01', base: 4320 - 2180 },
  { yearMonth: '2026-02', base: 5890 - 3450 },
  { yearMonth: '2026-03', base: 7810 - 3798 },
  { yearMonth: '2026-04', base: 48843.79 - 30750.19 },
];

function accountSeed(accountId: string): number {
  // cheap deterministic hash so sparklines stay stable across reloads
  let h = 0;
  for (let i = 0; i < accountId.length; i++) h = (h * 31 + accountId.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

export async function handleGetAccounts(
  _request: GetAccountsRequest,
): Promise<GetAccountsResponse> {
  return {
    accounts: ACCOUNTS_SEED.map((a) => ({
      id: a.id,
      bankName: a.bankName,
      bankNameShort: a.bankNameShort,
      accountLabel: a.accountLabel,
      color: a.color,
      sortOrder: a.sortOrder,
      isActive: true,
      createdAt: '2025-01-01T00:00:00Z',
    })),
  };
}

export async function handleGetAccountBalances(
  _request: GetAccountBalancesRequest,
): Promise<GetAccountBalancesResponse> {
  // income/expense split is not in the prototype source — we split the signed
  // balance into a non-negative pair so the schema validates. `net` is the
  // figure Panel actually renders on the AccountCard.
  return {
    balances: ACCOUNTS_SEED.map((a) => {
      const net = a.balance;
      const income = Math.max(net, 0);
      const expense = Math.max(-net, 0);
      return {
        accountId: a.id,
        accountLabel: a.accountLabel,
        income,
        expense,
        net,
      };
    }),
  };
}

export async function handleGetMonthKPIs(
  request: GetMonthKPIsRequest,
): Promise<GetMonthKPIsResponse> {
  return {
    kpis: {
      yearMonth: request.yearMonth,
      ...KPIS_APR_2026,
    },
  };
}

export async function handleGetAccountSparklines(
  request: GetAccountSparklinesRequest,
): Promise<GetAccountSparklinesResponse> {
  const seed = accountSeed(request.accountId);
  return {
    sparkline: {
      accountId: request.accountId,
      months: MONTHLY_HISTORY.map((m, i) => {
        // deterministic ±30% jitter around the aggregate base
        const jitter = (((seed * 7 + i * 13) % 60) - 30) / 100;
        return {
          yearMonth: m.yearMonth,
          net: Math.round(m.base * (0.4 + Math.abs(jitter))) || 1,
        };
      }),
    },
  };
}

export async function handleQueryRecentTransactions(
  request: QueryRecentTransactionsRequest,
): Promise<QueryRecentTransactionsResponse> {
  const limit = request.limit ?? 10;
  const rows = TX_SEED.slice(0, limit).map((t, i) => ({
    id: t.id,
    date: t.date,
    type: t.type,
    amount: t.amount,
    currency: 'EUR' as const,
    description: t.description,
    accountId: t.accountId,
    // Mock carries labels in the *Id fields — real resolver (WI-6) will
    // return ULIDs + a separate label map.
    categoryId: t.categoryLabel,
    subcategoryId: t.subcategoryLabel,
    tagIds: [],
    status: t.status,
    createdAt: `${t.date}T12:00:${String(i).padStart(2, '0')}Z`,
  }));
  return { transactions: rows };
}
