// @vitest-environment jsdom
//
// Focused render tests for WI-19 additions to the ImportWizard:
//  - Mapping dropdowns expose `reference` and `details` target fields.
//  - Selecting those columns propagates through into the dry-run / commit
//    request payloads handed to the IPC bridge.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { i18n } from '../../i18n/index.js';
import { ImportWizard } from './ImportWizard.js';
import type {
  StageFileResponse,
  DryRunResponse,
  CommitImportResponse,
} from '../../../shared/ipc-contracts/import.js';
import type { AccountsListResponse } from '../../../shared/ipc-contracts/accounts.js';

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

const ACCOUNT_ID = '01HACC0000000000000000ACC1';

const accountsResponse: AccountsListResponse = {
  accounts: [
    {
      id: ACCOUNT_ID,
      name: 'Test Account',
      bankName: 'Test Bank',
      bankNameShort: null,
      accountLabel: 'Test Account',
      currency: 'EUR',
      openingBalance: 0,
      color: null,
      sortOrder: 0,
      isActive: true,
      createdAt: '2026-01-01T00:00:00Z',
    } as unknown as AccountsListResponse['accounts'][number],
  ],
};

const stageResponse: StageFileResponse = {
  ok: true,
  fileId: 'file-123',
  sheets: [
    {
      name: 'Sheet1',
      columnHeaders: ['Fecha', 'Importe', 'Concepto', 'Ref', 'Extra'],
      rowCount: 10,
      detectedHeaderRow: 1,
      previewRows: [['2026-04-20', '150', 'donation', 'INV-1', 'paid in EUR']],
    },
  ],
};

const dryRunResponse: DryRunResponse = {
  ok: true,
  summary: { totalRows: 1, validRows: 1, duplicateCount: 0, errorCount: 0 },
  samples: [
    { rowIndex: 2, date: '2026-04-20', amount: 150, description: 'donation', isDuplicate: false },
  ],
  duplicates: [],
  errors: [],
  inferredDateFormat: 'YYYY-MM-DD',
  dateFormatAmbiguous: false,
};

const commitResponse: CommitImportResponse = {
  ok: true,
  importBatchId: 'batch-1',
  importedCount: 1,
  skippedCount: 0,
  warnings: [],
};

function mountBridge(overrides: {
  stageFile?: ReturnType<typeof vi.fn>;
  dryRun?: ReturnType<typeof vi.fn>;
  commit?: ReturnType<typeof vi.fn>;
}) {
  const stageFile = overrides.stageFile ?? vi.fn().mockResolvedValue(stageResponse);
  const dryRun = overrides.dryRun ?? vi.fn().mockResolvedValue(dryRunResponse);
  const commit = overrides.commit ?? vi.fn().mockResolvedValue(commitResponse);
  (window as unknown as { opentreasury: unknown }).opentreasury = {
    accounts: {
      list: vi.fn().mockResolvedValue(accountsResponse),
    },
    import: {
      getPathForFile: (file: File) => `/tmp/${file.name}`,
      stageFile,
      dryRun,
      commit,
      getLastMapping: vi.fn().mockResolvedValue({ mapping: null, updatedAt: null }),
    },
  };
  return { stageFile, dryRun, commit };
}

async function advanceToMapColumns(): Promise<void> {
  // Step 1: pick account.
  await waitFor(() => {
    expect(screen.getByText(/Test Account/)).toBeTruthy();
  });
  fireEvent.click(screen.getByText(/Test Account/));

  // Step 2: select file (handleFileSelect triggers via change event).
  await waitFor(() => {
    expect(screen.getByText(/Drag file here|Arrastra el archivo/i)).toBeTruthy();
  });
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['col1,col2'], 'sample.csv', { type: 'text/csv' });
  Object.defineProperty(fileInput, 'files', { value: [file] });
  fireEvent.change(fileInput);

  // Step 3: confirm header row → continue.
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Continue|Continuar/i })).toBeTruthy();
  });
  fireEvent.click(screen.getByRole('button', { name: /Continue|Continuar/i }));

  // Step 4: map columns — wait for the mapping selects to be present.
  await waitFor(() => {
    expect(document.querySelectorAll('select').length).toBeGreaterThan(0);
  });
}

describe('ImportWizard — themed cancel confirmation dialog (#277)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('shows themed cancel dialog instead of browser confirm() when closing mid-flow', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    mountBridge({});
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ImportWizard isOpen onClose={onClose} onComplete={() => {}} />
      </I18nextProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Test Account/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Test Account/));

    const closeBtn = document.querySelector('.ot-import-wizard__close') as HTMLButtonElement;
    fireEvent.click(closeBtn);

    expect(confirmSpy).not.toHaveBeenCalled();
    const cancelDialog = document.querySelector(
      '.ot-import-wizard-cancel-confirm',
    ) as HTMLDialogElement;
    expect(cancelDialog).toBeTruthy();
    expect(cancelDialog.hasAttribute('open')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the user confirms discard in the themed dialog', async () => {
    mountBridge({});
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ImportWizard isOpen onClose={onClose} onComplete={() => {}} />
      </I18nextProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Test Account/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Test Account/));

    const closeBtn = document.querySelector('.ot-import-wizard__close') as HTMLButtonElement;
    fireEvent.click(closeBtn);

    const cancelDialog = document.querySelector(
      '.ot-import-wizard-cancel-confirm',
    ) as HTMLDialogElement;
    const discardBtn = cancelDialog.querySelector('.ot-button--destructive') as HTMLButtonElement;
    expect(discardBtn).toBeTruthy();
    fireEvent.click(discardBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the wizard open when the user clicks Stay in the themed dialog', async () => {
    mountBridge({});
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ImportWizard isOpen onClose={onClose} onComplete={() => {}} />
      </I18nextProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Test Account/)).toBeTruthy());
    fireEvent.click(screen.getByText(/Test Account/));

    const closeBtn = document.querySelector('.ot-import-wizard__close') as HTMLButtonElement;
    fireEvent.click(closeBtn);

    const cancelDialog = document.querySelector(
      '.ot-import-wizard-cancel-confirm',
    ) as HTMLDialogElement;
    const stayBtn = cancelDialog.querySelector('.ot-button--ghost') as HTMLButtonElement;
    expect(stayBtn).toBeTruthy();
    fireEvent.click(stayBtn);

    expect(onClose).not.toHaveBeenCalled();
    expect(cancelDialog.hasAttribute('open')).toBe(false);
  });

  it('does NOT show the cancel dialog when closing from selectAccount step', async () => {
    mountBridge({});
    const onClose = vi.fn();
    render(
      <I18nextProvider i18n={i18n}>
        <ImportWizard isOpen onClose={onClose} onComplete={() => {}} />
      </I18nextProvider>,
    );

    await waitFor(() => expect(screen.getByText(/Test Account/)).toBeTruthy());
    const closeBtn = document.querySelector('.ot-import-wizard__close') as HTMLButtonElement;
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
    const cancelDialog = document.querySelector('.ot-import-wizard-cancel-confirm');
    expect(cancelDialog?.hasAttribute('open')).toBeFalsy();
  });
});
describe('ImportWizard — WI-19 reference/details mapping', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as { opentreasury?: unknown }).opentreasury;
  });

  it('exposes Reference and Details as target options in the mapping dropdown', async () => {
    mountBridge({});
    render(
      <I18nextProvider i18n={i18n}>
        <ImportWizard isOpen onClose={() => {}} onComplete={() => {}} />
      </I18nextProvider>,
    );

    await advanceToMapColumns();

    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    expect(selects.length).toBeGreaterThan(0);
    const values = Array.from(selects[0]!.options).map((o) => o.value);
    expect(values).toContain('reference');
    expect(values).toContain('details');
  });

  it('passes reference/details mappings through dry-run and commit payloads', async () => {
    const { dryRun, commit } = mountBridge({});
    render(
      <I18nextProvider i18n={i18n}>
        <ImportWizard isOpen onClose={() => {}} onComplete={() => {}} />
      </I18nextProvider>,
    );

    await advanceToMapColumns();

    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    // Column order matches stageResponse: Fecha, Importe, Concepto, Ref, Extra.
    fireEvent.change(selects[0]!, { target: { value: 'date' } });
    fireEvent.change(selects[1]!, { target: { value: 'amount' } });
    fireEvent.change(selects[2]!, { target: { value: 'description' } });
    fireEvent.change(selects[3]!, { target: { value: 'reference' } });
    fireEvent.change(selects[4]!, { target: { value: 'details' } });

    const previewBtn = screen.getByRole('button', {
      name: /Preview Import|Vista Previa/i,
    });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(dryRun).toHaveBeenCalledTimes(1);
    });
    const dryRunArg = dryRun.mock.calls[0]![0] as { columnMapping: Record<string, string> };
    expect(dryRunArg.columnMapping.reference).toBe('Ref');
    expect(dryRunArg.columnMapping.details).toBe('Extra');

    // Dry-run resolved — confirm + click import.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import \d+|Importar \d+/i })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole('button', { name: /Import \d+|Importar \d+/i }));

    await waitFor(() => {
      expect(commit).toHaveBeenCalledTimes(1);
    });
    const commitArg = commit.mock.calls[0]![0] as {
      columnMapping: Record<string, string>;
    };
    expect(commitArg.columnMapping.reference).toBe('Ref');
    expect(commitArg.columnMapping.details).toBe('Extra');
  });

  it('renders all mapped columns in final preview table', async () => {
    mountBridge({});
    render(
      <I18nextProvider i18n={i18n}>
        <ImportWizard isOpen onClose={() => {}} onComplete={() => {}} />
      </I18nextProvider>,
    );

    await advanceToMapColumns();

    // Map 5 fields: date, amount, description, reference, details
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    fireEvent.change(selects[0]!, { target: { value: 'date' } });
    fireEvent.change(selects[1]!, { target: { value: 'amount' } });
    fireEvent.change(selects[2]!, { target: { value: 'description' } });
    fireEvent.change(selects[3]!, { target: { value: 'reference' } });
    fireEvent.change(selects[4]!, { target: { value: 'details' } });

    const previewBtn = screen.getByRole('button', {
      name: /Preview Import|Vista Previa/i,
    });
    fireEvent.click(previewBtn);

    // Wait for dry-run step to render
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Import \d+|Importar \d+/i })).toBeTruthy();
    });

    // Check that the preview table has 5 column headers (one per mapped field)
    const previewTable = document.querySelector('.ot-import-wizard__preview-table');
    expect(previewTable).toBeTruthy();
    const headers = previewTable?.querySelectorAll('thead th');
    expect(headers?.length).toBe(5);
  });
});
