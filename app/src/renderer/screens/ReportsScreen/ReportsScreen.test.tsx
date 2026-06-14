// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import type { ReportModel } from '../../../shared/ipc-contracts/report.js';

// ── Service mocks ──────────────────────────────────────────────────
// The screen is renderer-only: it consumes the WI-2 IPC via these two service
// wrappers and the Panel accounts query. Mocking them lets us drive every
// build/generate outcome deterministically.
vi.mock('../../services/panelApi.js', () => ({
  getAccounts: vi.fn().mockResolvedValue({
    accounts: [{ id: '01HACC0000000000000000001A', accountLabel: 'Main account' }],
  }),
}));
vi.mock('../../services/reportApi.js', () => ({
  buildReport: vi.fn(),
  generateReport: vi.fn(),
}));

import { buildReport, generateReport } from '../../services/reportApi.js';
import { ReportsScreen } from './ReportsScreen.js';

const buildReportMock = vi.mocked(buildReport);
const generateReportMock = vi.mocked(generateReport);

// A model whose credits TOTAL (9506.21) deliberately does NOT equal the sum of
// its visible rows (4650). The preview must show the model's own total — proof
// the renderer never recomputes a total client-side.
const MODEL: ReportModel = {
  locale: 'en',
  grouping: 'category-subcategory',
  header: {
    orgName: 'Rett Syndrome Europe',
    legalRegistrationLine: 'Association sans but lucratif — RCS F1819',
    address: '12 Rue de l’Exemple, Luxembourg',
    contactEmail: 'treasurer@rett.eu',
    logoDataUrl: null,
    title: 'Financial Report 2024',
    periodLabel: '1 Jan 2024 – 31 Dec 2024',
    generatedLabel: 'Generated 14 Jun 2026',
  },
  scopeLabel: 'All accounts (consolidated)',
  credits: {
    rows: [{ label: 'Membership fees 2024', amount: 4650 }],
    total: 9506.21,
  },
  debits: {
    rows: [
      {
        label: 'Event / Conference Expenses',
        amount: 5317.5,
        subRows: [{ label: 'Conference Madrid', amount: 3100 }],
      },
    ],
    total: 8647.5,
  },
  reconciliation: { opening: 32162.93, credits: 9506.21, debits: 8647.5, closing: 33021.64 },
  period: { kind: 'calendar-year', start: '2024-01-01', end: '2024-12-31', year: 2024 },
  signatures: {
    treasurer: { name: 'Pedro Rocha', role: 'Treasurer RSE', place: 'Spain, 14 Jun 2026' },
    auditor: { name: 'Bahadir Dinler', role: 'Auditor', place: 'Türkiye' },
  },
};

function renderScreen(): ReturnType<typeof render> {
  return render(
    <I18nextProvider i18n={i18n}>
      <ReportsScreen />
    </I18nextProvider>,
  );
}

const onlyDigits = (s: string | null): string => (s ?? '').replace(/\D/g, '');

// jsdom does not implement <dialog>.showModal/close — polyfill so the modal's
// open/close effect doesn't throw. The dialog content renders either way.
beforeEach(() => {
  if (typeof HTMLDialogElement !== 'undefined') {
    HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement): void {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement): void {
      this.open = false;
    };
  }
});

beforeEach(async () => {
  vi.clearAllMocks();
  await i18n.changeLanguage('en');
  buildReportMock.mockResolvedValue({
    ok: true,
    model: MODEL,
    confirmationToken: 'TOKEN-1',
  });
});

describe('ReportsScreen — form + build', () => {
  it('starts empty: prompt is shown, no preview, build enabled for default calendar-year', async () => {
    renderScreen();
    expect(screen.getByText('Select a year or a range to begin.')).toBeTruthy();
    expect(screen.queryByLabelText('Financial report preview')).toBeNull();
    // Default period is the current calendar year → build is enabled.
    const build = screen.getByRole('button', { name: 'Build preview' });
    expect((build as HTMLButtonElement).disabled).toBe(false);
  });

  it('disables build for a custom range until both dates are provided', async () => {
    renderScreen();
    fireEvent.click(screen.getByRole('radio', { name: 'Custom range' }));

    // No dates entered yet → period is incomplete → build disabled.
    expect(
      (screen.getByRole('button', { name: 'Build preview' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('builds the model and renders the preview (totals come from the model, not recomputed)', async () => {
    const { container } = renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Build preview' }));

    await screen.findByLabelText('Financial report preview');

    // Header + labels render from the model.
    expect(screen.getByText('Rett Syndrome Europe')).toBeTruthy();
    expect(screen.getByText('Membership fees 2024')).toBeTruthy();
    // Subcategory indented row is shown because grouping is category-subcategory.
    expect(screen.getByText('Conference Madrid')).toBeTruthy();

    // Build request carried the default calendar-year period + consolidated scope.
    expect(buildReportMock).toHaveBeenCalledTimes(1);
    const req = buildReportMock.mock.calls[0]![0];
    expect(req.periodKind).toBe('calendar-year');
    expect(req.periodStart.endsWith('-01-01')).toBe(true);
    expect(req.periodEnd.endsWith('-12-31')).toBe(true);
    expect(req.accountIds).toBeUndefined();

    // The credits TOTAL reflects the model's own total (9506.21 → digits
    // 950621), NOT the visible row sum (4650). The renderer never sums rows.
    const totalAmount = container.querySelector(
      '.ot-report-preview__table-block:first-of-type .ot-report-preview__row--total .ot-report-preview__amount',
    );
    expect(onlyDigits(totalAmount?.textContent ?? '')).toContain('950621');
    expect(onlyDigits(totalAmount?.textContent ?? '')).not.toBe('4650');
  });

  it('sends a single account id when a specific account scope is chosen', async () => {
    renderScreen();
    // Wait for the accounts query to populate the scope <select>.
    await screen.findByRole('option', { name: 'Main account' });
    fireEvent.change(screen.getByLabelText('Account scope'), {
      target: { value: '01HACC0000000000000000001A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Build preview' }));
    await screen.findByLabelText('Financial report preview');

    expect(buildReportMock.mock.calls[0]![0].accountIds).toEqual(['01HACC0000000000000000001A']);
  });
});

describe('ReportsScreen — generate outcomes', () => {
  async function buildToPreview(): Promise<void> {
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Build preview' }));
    await screen.findByLabelText('Financial report preview');
  }

  it('saved → success toast with the basename', async () => {
    generateReportMock.mockResolvedValue({
      outcome: 'saved',
      basename: 'financial-report-2024.pdf',
    });
    await buildToPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate PDF' }));

    await screen.findByText('Financial report generated: financial-report-2024.pdf.');
    expect(generateReportMock).toHaveBeenCalledWith('TOKEN-1');
  });

  it('canceled → quiet return to the preview (no toast, generate still available)', async () => {
    generateReportMock.mockResolvedValue({ outcome: 'canceled' });
    await buildToPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate PDF' }));

    await waitFor(() => expect(generateReportMock).toHaveBeenCalled());
    // Preview is still present and the Generate action remains enabled.
    expect(screen.getByLabelText('Financial report preview')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Generate PDF' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it('error (REPORT_RECONCILE_MISMATCH) → localized message, retry stays in preview', async () => {
    generateReportMock.mockResolvedValue({ outcome: 'error', code: 'REPORT_RECONCILE_MISMATCH' });
    await buildToPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate PDF' }));

    await screen.findByText(/figures do not balance/i);
    // Preview is retained (token still valid) and a retry button is offered.
    expect(screen.getByLabelText('Financial report preview')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('error (REPORT_TOKEN_INVALID) → prompts a fresh build', async () => {
    generateReportMock.mockResolvedValue({ outcome: 'error', code: 'REPORT_TOKEN_INVALID' });
    await buildToPreview();

    fireEvent.click(screen.getByRole('button', { name: 'Generate PDF' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Generate PDF' }));

    await screen.findByText('The report session expired. Build the preview again.');
    // The preview/token are dropped; the recovery action is a rebuild.
    expect(screen.getByRole('button', { name: 'Build again' })).toBeTruthy();
    expect(screen.queryByLabelText('Financial report preview')).toBeNull();
  });

  it('build error (REPORT_NO_WORKSPACE) → localized message + rebuild action', async () => {
    buildReportMock.mockResolvedValue({ ok: false, code: 'REPORT_NO_WORKSPACE' });
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Build preview' }));

    await screen.findByText(/No treasury is unlocked/i);
    expect(screen.getByRole('button', { name: 'Build again' })).toBeTruthy();
    expect(screen.queryByLabelText('Financial report preview')).toBeNull();
  });
});
