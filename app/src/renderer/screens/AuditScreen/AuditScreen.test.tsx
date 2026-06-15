// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import type {
  AuditVerifyStatusResponse,
  AuditListSignedResponse,
  AuditListChangeHistoryResponse,
  ChangeHistoryRow,
  SignedEntryView,
} from '../../../shared/ipc-contracts/audit.js';

const getAuditVerifyStatus = vi.fn();
const listSignedEntries = vi.fn();
const listChangeHistory = vi.fn();
const getAccounts = vi.fn();

vi.mock('../../services/auditApi.js', () => ({
  getAuditVerifyStatus: () => getAuditVerifyStatus(),
  listSignedEntries: (req: unknown) => listSignedEntries(req),
  listChangeHistory: (req: unknown) => listChangeHistory(req),
}));

vi.mock('../../services/panelApi.js', () => ({
  getAccounts: () => getAccounts(),
}));

// Imported AFTER the mocks are registered.
const { AuditScreen } = await import('./AuditScreen.js');

function renderScreen(): void {
  render(
    <I18nextProvider i18n={i18n}>
      <AuditScreen />
    </I18nextProvider>,
  );
}

const verifiedStatus: AuditVerifyStatusResponse = {
  banner: 'verified',
  failClosed: false,
  category: 'ok',
  recovery: 'none',
  unsealedTailCount: 0,
  devices: [
    {
      deviceId: 'DEVICE_AAA',
      isCurrentDevice: true,
      status: 'ok',
      anchoredThrough: '2026-05-31T10:00:00.000Z',
      notYetAnchored: 0,
      timestamp: 'timestamped',
    },
  ],
};

const emptySigned: AuditListSignedResponse = { entries: [], totalCount: 0 };
const emptyHistory: AuditListChangeHistoryResponse = { rows: [], totalCount: 0 };

beforeEach(() => {
  getAuditVerifyStatus.mockReset();
  listSignedEntries.mockReset();
  listChangeHistory.mockReset();
  getAccounts.mockReset();
  getAuditVerifyStatus.mockResolvedValue(verifiedStatus);
  listSignedEntries.mockResolvedValue(emptySigned);
  listChangeHistory.mockResolvedValue(emptyHistory);
  getAccounts.mockResolvedValue({ accounts: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('AuditScreen — integrity banner', () => {
  it('renders the verified banner with the per-device anchored-through chip', async () => {
    renderScreen();
    const banner = await screen.findByRole('region', {
      name: i18n.t('audit.banner.verifiedLabel'),
    });
    // "This device" chip is present in the banner (provenance, not colour-only).
    expect(within(banner).getByText(i18n.t('audit.device.thisDevice'))).toBeTruthy();
  });

  it('renders the no-anchors banner', async () => {
    getAuditVerifyStatus.mockResolvedValue({
      ...verifiedStatus,
      banner: 'no-anchors',
      devices: [],
    });
    renderScreen();
    expect(await screen.findByText(i18n.t('audit.banner.noAnchorsLabel'))).toBeTruthy();
  });

  it('shows the informational unsealed-tail chip when there is an unsealed tail', async () => {
    getAuditVerifyStatus.mockResolvedValue({
      ...verifiedStatus,
      banner: 'verified-unsealed-tail',
      unsealedTailCount: 3,
    });
    renderScreen();
    expect(await screen.findByText(i18n.t('audit.unsealedTail', { count: 3 }))).toBeTruthy();
    // The banner sentence must NOT claim "no unsealed changes" in this state —
    // it gets its own dedicated message that agrees with the chip.
    const banner = screen.getByRole('region', { name: i18n.t('audit.banner.unsealedLabel') });
    expect(within(banner).getByText(i18n.t('audit.banner.verifiedUnsealedTail'))).toBeTruthy();
    expect(within(banner).queryByText(i18n.t('audit.banner.verified'))).toBeNull();
  });

  it('always shows the normative limitation statement', async () => {
    renderScreen();
    expect(await screen.findByText(i18n.t('audit.limitation'))).toBeTruthy();
  });

  it('collapses devices beyond 3 into a "view devices" popover', async () => {
    const devices = ['A', 'B', 'C', 'D'].map((id) => ({
      deviceId: `DEVICE_${id}`,
      isCurrentDevice: false,
      status: 'ok' as const,
      anchoredThrough: '2026-05-31T10:00:00.000Z',
      notYetAnchored: 0,
      timestamp: 'timestamped' as const,
    }));
    getAuditVerifyStatus.mockResolvedValue({ ...verifiedStatus, devices });
    renderScreen();
    const banner = await screen.findByRole('region', {
      name: i18n.t('audit.banner.verifiedLabel'),
    });
    const toggle = within(banner).getByText(i18n.t('audit.viewDevices', { count: 2 }));
    // Hidden devices are not shown until the popover opens.
    expect(within(banner).queryByText('DEVICE_C')).toBeNull();
    fireEvent.click(toggle);
    expect(within(banner).getByText('DEVICE_C')).toBeTruthy();
    expect(within(banner).getByText('DEVICE_D')).toBeTruthy();
  });
});

describe('AuditScreen — blocking tamper view (AUD-0)', () => {
  it('renders the blocking integrity-error view when failClosed', async () => {
    getAuditVerifyStatus.mockResolvedValue({
      banner: 'integrity-error',
      failClosed: true,
      category: 'tamper',
      recovery: 'restore',
      unsealedTailCount: 0,
      devices: [],
    });
    renderScreen();
    expect(await screen.findByText(i18n.t('audit.tamper.title'))).toBeTruthy();
    expect(screen.getByText(i18n.t('audit.tamper.body'))).toBeTruthy();
    // The tabs/filters must NOT render in the blocking view.
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('AuditScreen — tabs and lanes', () => {
  it('defaults to the change-history tab and can switch to the signed tab', async () => {
    renderScreen();
    const tablist = await screen.findByRole('tablist');
    const historyTab = within(tablist).getByText(i18n.t('audit.tabs.history'));
    const signedTab = within(tablist).getByText(i18n.t('audit.tabs.signed'));
    expect(historyTab.getAttribute('aria-selected')).toBe('true');
    expect(signedTab.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(signedTab);
    await waitFor(() => expect(signedTab.getAttribute('aria-selected')).toBe('true'));
    expect(listSignedEntries).toHaveBeenCalled();
  });

  it('renders the empty state when there are no rows', async () => {
    renderScreen();
    expect(await screen.findByText(i18n.t('audit.empty'))).toBeTruthy();
  });

  it('shows "showing N of M" when the filtered count is below the pre-filter total', async () => {
    const rows: ChangeHistoryRow[] = [
      {
        lane: 'history',
        eventId: 'EVT_1',
        occurredAt: '2026-05-30T08:00:00.000Z',
        action: 'tx.created',
        actor: { kind: 'known', userId: 'USER_1' },
        device: { kind: 'known', deviceId: 'DEVICE_AAA' },
        accountId: 'ACC_1',
        accountLabel: 'Checking',
      },
      {
        lane: 'history',
        eventId: 'EVT_2',
        occurredAt: '2026-05-29T08:00:00.000Z',
        action: 'tx.updated',
        actor: { kind: 'known', userId: 'USER_1' },
        device: { kind: 'known', deviceId: 'DEVICE_AAA' },
        accountId: 'ACC_1',
        accountLabel: 'Checking',
      },
    ];
    // totalCount (pre-filter) is far larger than the 2 returned rows.
    listChangeHistory.mockResolvedValue({ rows, totalCount: 50 });
    renderScreen();
    expect(
      await screen.findByText(i18n.t('audit.countFiltered', { shown: 2, total: 50 })),
    ).toBeTruthy();
    // The misleading pre-filter "{{count}} entries in this period." must NOT show.
    expect(screen.queryByText(i18n.t('audit.count', { count: 50 }))).toBeNull();
  });
});

describe('AuditScreen — honest attribution (§3.4)', () => {
  const rows: ChangeHistoryRow[] = [
    {
      lane: 'history',
      eventId: 'EVT_KNOWN',
      occurredAt: '2026-05-30T08:00:00.000Z',
      action: 'tx.created',
      actor: { kind: 'known', userId: 'USER_1' },
      device: { kind: 'known', deviceId: 'DEVICE_AAA' },
      accountId: 'ACC_1',
      accountLabel: 'Checking',
    },
    {
      lane: 'history',
      eventId: 'EVT_PRECOV',
      occurredAt: '2026-05-29T08:00:00.000Z',
      action: 'tx.updated',
      actor: { kind: 'unknown', reason: 'pre-coverage' },
      device: { kind: 'unknown' },
      accountId: 'ACC_1',
      accountLabel: 'Checking',
    },
    {
      lane: 'history',
      eventId: 'EVT_FLAT',
      occurredAt: '2026-05-28T08:00:00.000Z',
      action: 'movement.imported',
      actor: { kind: 'unknown', reason: 'flat' },
      device: { kind: 'unknown' },
      accountId: 'ACC_2',
      accountLabel: null,
    },
  ];

  it('renders known, pre-coverage, and flat attribution honestly (never inferred)', async () => {
    listChangeHistory.mockResolvedValue({ rows, totalCount: rows.length });
    renderScreen();
    // Known actor surfaced by id.
    expect(await screen.findByText('USER_1')).toBeTruthy();
    // Honest unknowns — exact normative copy, not an inferred session actor.
    expect(screen.getByText(i18n.t('audit.actor.preCoverage'))).toBeTruthy();
    expect(screen.getByText(i18n.t('audit.actor.flat'))).toBeTruthy();
    // Account label resolves, or falls back to the id when unresolved.
    expect(screen.getAllByText('Checking').length).toBeGreaterThan(0);
    expect(screen.getByText('ACC_2')).toBeTruthy();
  });
});

describe('AuditScreen — enriched detail, Option B gate & bulk grouping (§4.3)', () => {
  const detail = {
    summaryKind: 'tx.created' as const,
    amount: 150,
    currency: 'EUR' as const,
    txType: 'expense' as const,
    description: 'Office supplies',
    categoryId: 'CAT_1',
    categoryLabel: 'Operations',
    subcategoryId: null,
    subcategoryLabel: null,
    tagIds: [],
    tagLabels: [],
    status: 'pending' as const,
    reference: null,
  };

  const detailRow: ChangeHistoryRow = {
    lane: 'history',
    eventId: 'EVT_DETAIL',
    occurredAt: '2026-05-30T08:00:00.000Z',
    action: 'tx.created',
    actor: { kind: 'known', userId: 'USER_1' },
    device: { kind: 'known', deviceId: 'DEVICE_AAA' },
    accountId: 'ACC_1',
    accountLabel: 'Checking',
    detail,
    groupId: null,
    groupSize: null,
  };

  it('shows the summary inline but gates the financial detail behind expand (Option B / AC25)', async () => {
    listChangeHistory.mockResolvedValue({ rows: [detailRow], totalCount: 1 });
    renderScreen();
    // Summary (description) is inline in the collapsed row.
    expect(await screen.findByText(/Office supplies/u)).toBeTruthy();
    // The fuller financial breakdown labels are NOT in the DOM while collapsed.
    expect(screen.queryByText(i18n.t('audit.detail.amount'))).toBeNull();
    expect(screen.queryByText(i18n.t('audit.detail.status'))).toBeNull();
    // Expanding the row reveals the financial detail (Option B disclosure).
    fireEvent.click(screen.getByRole('button', { name: i18n.t('audit.summary.showDetail') }));
    expect(screen.getByText(i18n.t('audit.detail.amount'))).toBeTruthy();
    expect(screen.getByText(i18n.t('audit.detail.status'))).toBeTruthy();
    // Collapsing hides it again.
    fireEvent.click(screen.getByRole('button', { name: i18n.t('audit.summary.hideDetail') }));
    expect(screen.queryByText(i18n.t('audit.detail.amount'))).toBeNull();
  });

  it('does not render an expander for a label-only deleted row (no fabricated detail)', async () => {
    const deletedRow: ChangeHistoryRow = {
      ...detailRow,
      eventId: 'EVT_DEL',
      action: 'tx.deleted',
      detail: { summaryKind: 'tx.deleted' },
    };
    listChangeHistory.mockResolvedValue({ rows: [deletedRow], totalCount: 1 });
    renderScreen();
    expect(await screen.findByText(i18n.t('audit.summary.deleted'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: i18n.t('audit.summary.showDetail') })).toBeNull();
  });

  it('collapses correlationId members into one group row with "M of N" and expands to members', async () => {
    const member = (suffix: string, description: string): ChangeHistoryRow => ({
      ...detailRow,
      eventId: `EVT_${suffix}`,
      action: 'tx.updated',
      groupId: 'BULK_1',
      groupSize: 3, // N = 3 over the full set; only M = 2 returned (filtered)
      detail: { ...detail, summaryKind: 'tx.updated', description },
    });
    listChangeHistory.mockResolvedValue({
      rows: [member('A', 'Bulk alpha'), member('B', 'Bulk beta')],
      totalCount: 3,
    });
    renderScreen();
    // The members collapse into ONE group row with the localized header…
    const groupRow = await screen.findByText(/Bulk update/u);
    // …and the "M of N" chip (2 of 3) lives on that group row, never misleading.
    const chip = document.querySelector('.ot-audit__group-filtered');
    expect(chip?.textContent).toMatch(/2 of 3/u);
    expect(groupRow).toBeTruthy();
    // Members are collapsed (their per-row summaries are absent) until expansion.
    expect(screen.queryByText(/Bulk alpha/u)).toBeNull();
    // Exactly one expander exists (the group's) while collapsed.
    fireEvent.click(screen.getByRole('button', { name: i18n.t('audit.summary.showDetail') }));
    expect(screen.getByText(/Bulk alpha/u)).toBeTruthy();
    expect(screen.getByText(/Bulk beta/u)).toBeTruthy();
  });
});

describe('AuditScreen — signed lane', () => {
  const entries: SignedEntryView[] = [
    {
      lane: 'signed',
      seq: 2,
      timestamp: '2026-05-31T10:00:00.000Z',
      action: 'audit.anchor',
      result: 'succeeded',
      actorDeviceId: 'DEVICE_AAA',
      anchoredThrough: '2026-05-31T09:59:00.000Z',
      deviceCount: 1,
      timestamp_state: 'timestamped',
    },
    {
      lane: 'signed',
      seq: 1,
      timestamp: '2026-05-30T10:00:00.000Z',
      action: 'export.csv',
      result: 'succeeded',
      actorDeviceId: 'DEVICE_AAA',
      anchoredThrough: null,
      deviceCount: null,
      timestamp_state: 'none',
    },
  ];

  it('renders signed entries with action, device and timestamp state', async () => {
    listSignedEntries.mockResolvedValue({ entries, totalCount: entries.length });
    renderScreen();
    const tablist = await screen.findByRole('tablist');
    fireEvent.click(within(tablist).getByText(i18n.t('audit.tabs.signed')));
    expect(
      await screen.findByText(
        i18n.t('audit.actions.audit.anchor', { defaultValue: 'audit.anchor' }),
      ),
    ).toBeTruthy();
    expect(screen.getByText(i18n.t('audit.timestampState.timestamped'))).toBeTruthy();
  });
});
