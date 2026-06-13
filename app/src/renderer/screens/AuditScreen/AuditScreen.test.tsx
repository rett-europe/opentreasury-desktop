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
