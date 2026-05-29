// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { BalanceAdjustmentModal } from './BalanceAdjustmentModal.js';
import { ADJUSTMENT_DETAILS_MARKER } from '../../../shared/constants/transactionMarkers.js';
import type { ConfigAccount } from '../../services/configMutationsApi.js';
import type { CreateTransactionResponse } from '../../../shared/ipc-contracts/transaction.js';
import type { GetAccountBalancesResponse } from '../../../shared/ipc-contracts/panel.js';

// jsdom doesn't implement HTMLDialogElement.showModal — stub to no-op so the
// shared <ConfigModalShell/> renders its children.
beforeEach(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '');
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute('open');
      };
    }
  }
});

const ACCOUNT_ID = '01JABCDEF0123456789ACCT01';

const account: ConfigAccount = {
  id: ACCOUNT_ID,
  name: 'Main',
  currency: 'EUR',
  openingBalance: 1000,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
};

interface StubOpts {
  /** Net (income - expense) returned for this account by getAccountBalances. */
  readonly net?: number;
  /** Response returned by transaction.create. */
  readonly createResult?: CreateTransactionResponse;
}

function installOpentreasuryStub(opts: StubOpts = {}): {
  readonly createFn: ReturnType<typeof vi.fn>;
  readonly balancesFn: ReturnType<typeof vi.fn>;
} {
  const balancesResponse: GetAccountBalancesResponse = {
    balances: [
      {
        accountId: ACCOUNT_ID,
        accountLabel: 'Main',
        income: Math.max(opts.net ?? 0, 0),
        expense: Math.max(-(opts.net ?? 0), 0),
        net: opts.net ?? 0,
      },
    ],
  };
  const createResult: CreateTransactionResponse = opts.createResult ?? {
    ok: true,
    event: {
      id: '01JABCDEF0123456789ABCDEFG',
      type: 'tx.created',
      datasetId: '01JABCDEF0123456789ABCDEFG',
      actorDeviceId: '01JABCDEF0123456789ABCDEFG',
      createdAt: '2026-04-19T10:00:00.000Z',
      dekVersion: 1,
      version: 1,
      payload: {
        id: '01JABCDEF0123456789ABCDEFG',
        date: '2026-04-19',
        type: 'income',
        amount: 100,
        currency: 'EUR',
        description: 'x',
        accountId: ACCOUNT_ID,
        categoryId: null,
        subcategoryId: null,
        tagIds: [],
        status: 'approved',
        createdAt: '2026-04-19T10:00:00.000Z',
        details: ADJUSTMENT_DETAILS_MARKER,
      },
    },
  };

  const balancesFn = vi.fn().mockResolvedValue(balancesResponse);
  const createFn = vi.fn().mockResolvedValue(createResult);

  (window as unknown as { opentreasury: unknown }).opentreasury = {
    panel: { getAccountBalances: balancesFn },
    transaction: { create: createFn },
  };
  return { createFn, balancesFn };
}

function renderModal(account_: ConfigAccount | null = account) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <BalanceAdjustmentModal
        isOpen={true}
        account={account_}
        onClose={onClose}
        onSaved={onSaved}
      />
    </I18nextProvider>,
  );
  return { onClose, onSaved, ...utils };
}

function getSaveButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /create adjustment|crear ajuste/i,
  }) as HTMLButtonElement;
}

async function flushBalanceLoad(): Promise<void> {
  // The modal fetches the current balance on open via getAccountBalances;
  // wait until the "…" placeholder has been replaced.
  await waitFor(() => {
    expect(screen.queryByText('…')).toBeNull();
  });
}

describe('BalanceAdjustmentModal', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('renders with the computed current balance and an empty target', async () => {
    // openingBalance 1000 + net 250 = 1250 current.
    installOpentreasuryStub({ net: 250 });
    renderModal();
    await flushBalanceLoad();

    // Title includes the account name.
    expect(screen.getByRole('heading', { name: /Adjust balance — Main/i })).not.toBeNull();

    // Current balance line shows €1,250 (rendered with the en-US locale).
    expect(screen.getByText(/€1,250\.00/)).not.toBeNull();

    // Target input starts empty.
    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    expect(target).not.toBeNull();
    expect(target.value).toBe('');
  });

  it('shows a positive (income) delta when target > current', async () => {
    installOpentreasuryStub({ net: 0 }); // current = openingBalance = 1000
    renderModal();
    await flushBalanceLoad();

    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: '1250' } });

    // Adjustment row shows "+€250.00" with success styling.
    expect(screen.getByText(/\+€250\.00/)).not.toBeNull();
    expect(getSaveButton().disabled).toBe(false);
  });

  it('shows a negative (expense) delta when target < current', async () => {
    installOpentreasuryStub({ net: 0 }); // current = 1000
    renderModal();
    await flushBalanceLoad();

    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: '800' } });

    // Adjustment row shows "−€200.00" (unicode minus).
    expect(screen.getByText(/−€200\.00/)).not.toBeNull();
    expect(getSaveButton().disabled).toBe(false);
  });

  it('disables Save when delta is zero (target equals current)', async () => {
    installOpentreasuryStub({ net: 0 }); // current = 1000
    renderModal();
    await flushBalanceLoad();

    // Initially disabled (no target).
    expect(getSaveButton().disabled).toBe(true);

    // Typing the same value as current → "no change" message + disabled Save.
    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: '1000' } });
    expect(screen.getByText(/No change/i)).not.toBeNull();
    expect(getSaveButton().disabled).toBe(true);
  });

  it('disables Save for sub-epsilon (<½ cent) deltas', async () => {
    installOpentreasuryStub({ net: 0 }); // current = 1000
    renderModal();
    await flushBalanceLoad();

    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: '1000.001' } });
    expect(getSaveButton().disabled).toBe(true);
  });

  it('accepts comma-decimal input (Spanish style) and computes the delta', async () => {
    // current = 10227.81; target typed as "1331,85" (comma-decimal) should
    // parse to 1331.85 and produce a delta of −8895.96.
    installOpentreasuryStub({ net: 9227.81 }); // 1000 opening + 9227.81 net = 10227.81
    renderModal();
    await flushBalanceLoad();

    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: '1331,85' } });

    // Adjustment row shows the expected negative delta (unicode minus).
    expect(screen.getByText(/−€8,895\.96/)).not.toBeNull();
    expect(getSaveButton().disabled).toBe(false);
  });

  it('also accepts Spanish thousands+decimal style ("1.331,85")', async () => {
    installOpentreasuryStub({ net: 9227.81 }); // current = 10227.81
    renderModal();
    await flushBalanceLoad();

    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: '1.331,85' } });

    expect(screen.getByText(/−€8,895\.96/)).not.toBeNull();
    expect(getSaveButton().disabled).toBe(false);
  });

  it('disables Save for non-numeric input', async () => {
    installOpentreasuryStub({ net: 0 });
    renderModal();
    await flushBalanceLoad();

    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: 'abc' } });
    expect(getSaveButton().disabled).toBe(true);
  });

  it('calls createTransaction with a positive-delta income payload on Save', async () => {
    const { createFn } = installOpentreasuryStub({ net: 0 }); // current = 1000
    const { onClose, onSaved } = renderModal();
    await flushBalanceLoad();

    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: '1250.5' } });

    const date = document.getElementById('bal-adj-date') as HTMLInputElement;
    fireEvent.change(date, { target: { value: '2026-04-19' } });

    fireEvent.click(getSaveButton());

    await waitFor(() => {
      expect(createFn).toHaveBeenCalledTimes(1);
    });

    const payload = createFn.mock.calls[0]?.[0];
    expect(payload).toMatchObject({
      accountId: ACCOUNT_ID,
      date: '2026-04-19',
      type: 'income',
      amount: 250.5,
      currency: 'EUR',
      status: 'approved',
      categoryId: null,
      subcategoryId: null,
      tagIds: [],
      reference: null,
      details: ADJUSTMENT_DETAILS_MARKER,
    });
    expect(typeof payload.description).toBe('string');
    expect(payload.description.length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('calls createTransaction with a negative-delta expense payload on Save', async () => {
    const { createFn } = installOpentreasuryStub({ net: 0 }); // current = 1000
    renderModal();
    await flushBalanceLoad();

    const target = document.getElementById('bal-adj-target') as HTMLInputElement;
    fireEvent.change(target, { target: { value: '750' } });

    fireEvent.click(getSaveButton());

    await waitFor(() => {
      expect(createFn).toHaveBeenCalledTimes(1);
    });
    const payload = createFn.mock.calls[0]?.[0];
    expect(payload.type).toBe('expense');
    expect(payload.amount).toBe(250);
    expect(payload.details).toBe(ADJUSTMENT_DETAILS_MARKER);
    expect(payload.status).toBe('approved');
  });

  it('surfaces a generic error when createTransaction fails', async () => {
    installOpentreasuryStub({
      net: 0,
      createResult: {
        ok: false,
        error: { code: 'INTERNAL', message: 'boom' },
      },
    });
    const { onSaved, onClose } = renderModal();
    await flushBalanceLoad();

    fireEvent.change(document.getElementById('bal-adj-target') as HTMLInputElement, {
      target: { value: '900' },
    });
    fireEvent.click(getSaveButton());

    await waitFor(() => {
      // Error banner shows the IPC-provided message.
      expect(within(document.body).getByText('boom')).not.toBeNull();
    });
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
