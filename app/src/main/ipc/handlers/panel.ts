// Panel IPC handlers — stub implementations returning MOCK data (WI-2)
// Trinity can import types from ipc-contracts/panel.ts and wire UI immediately.
// Real implementation (WI-6) will replace these mocks with core/query calls.

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

// MOCK fixtures — replace with real core/query calls in WI-6

export async function handleGetAccounts(
  _request: GetAccountsRequest,
): Promise<GetAccountsResponse> {
  return {
    accounts: [
      {
        id: '01HZ1234567890ABCDEFGHIJKL',
        bankName: 'Banco Santander',
        bankNameShort: 'Santander',
        accountLabel: 'Santander Cuenta Principal',
        color: '#EC0000',
        sortOrder: 0,
        isActive: true,
        createdAt: '2025-01-15T10:00:00Z',
      },
      {
        id: '01HZ2345678901BCDEFGHIJKLM',
        bankName: 'BBVA',
        bankNameShort: 'BBVA',
        accountLabel: 'BBVA Corriente',
        color: '#004481',
        sortOrder: 1,
        isActive: true,
        createdAt: '2025-02-20T11:30:00Z',
      },
      {
        id: '01HZ3456789012CDEFGHIJKLMN',
        bankName: 'PayPal',
        bankNameShort: 'PayPal',
        accountLabel: 'PayPal tesoreria@rett.es',
        color: '#003087',
        sortOrder: 2,
        isActive: true,
        createdAt: '2025-03-10T14:00:00Z',
      },
    ],
  };
}

export async function handleGetAccountBalances(
  _request: GetAccountBalancesRequest,
): Promise<GetAccountBalancesResponse> {
  return {
    balances: [
      {
        accountId: '01HZ1234567890ABCDEFGHIJKL',
        accountLabel: 'Santander Cuenta Principal',
        income: 12500.0,
        expense: 8750.0,
        net: 3750.0,
      },
      {
        accountId: '01HZ2345678901BCDEFGHIJKLM',
        accountLabel: 'BBVA Corriente',
        income: 8200.0,
        expense: 5100.0,
        net: 3100.0,
      },
      {
        accountId: '01HZ3456789012CDEFGHIJKLMN',
        accountLabel: 'PayPal tesoreria@rett.es',
        income: 1500.0,
        expense: 800.0,
        net: 700.0,
      },
    ],
  };
}

export async function handleGetMonthKPIs(
  request: GetMonthKPIsRequest,
): Promise<GetMonthKPIsResponse> {
  return {
    kpis: {
      yearMonth: request.yearMonth,
      income: 5200.0,
      expense: 3850.0,
      net: 1350.0,
      transactionCount: 24,
    },
  };
}

export async function handleGetAccountSparklines(
  request: GetAccountSparklinesRequest,
): Promise<GetAccountSparklinesResponse> {
  const now = new Date();
  const months: { yearMonth: string; net: number }[] = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mockNet = Math.round((Math.random() * 2000 - 500) * 100) / 100;
    months.push({ yearMonth, net: mockNet });
  }

  return {
    sparkline: {
      accountId: request.accountId,
      months,
    },
  };
}

export async function handleQueryRecentTransactions(
  request: QueryRecentTransactionsRequest,
): Promise<QueryRecentTransactionsResponse> {
  const limit = request.limit ?? 10;
  const mockTransactions: QueryRecentTransactionsResponse['transactions'] = [];

  const types: Array<'income' | 'expense'> = ['income', 'expense'];
  const descriptions = [
    'Transferencia bancaria',
    'Pago de nómina',
    'Compra de material oficina',
    'Ingreso donación',
    'Pago alquiler',
    'Cobro subvención',
  ];

  for (let i = 0; i < limit; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i * 2);
    const dateStr = date.toISOString().split('T')[0]!;

    const type: 'income' | 'expense' = types[i % 2]!;
    const amount = Math.round((Math.random() * 500 + 50) * 100) / 100;

    mockTransactions.push({
      id: `01HZ${String(1000 + i).padStart(20, '0')}`,
      date: dateStr,
      type,
      amount,
      currency: 'EUR',
      description: descriptions[i % descriptions.length]!,
      accountId: '01HZ1234567890ABCDEFGHIJKL',
      categoryId: i % 3 === 0 ? null : '01HZCAT1234567890ABCDEFGH',
      subcategoryId: i % 5 === 0 ? null : '01HZSUB1234567890ABCDEFGH',
      tagIds: i % 4 === 0 ? [] : ['01HZTAG1234567890ABCDEFGH'],
      status: i % 7 === 0 ? 'pending' : 'approved',
      createdAt: new Date(date.getTime() + i * 1000).toISOString(),
    });
  }

  return {
    transactions: mockTransactions,
  };
}
