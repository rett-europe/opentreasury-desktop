// SPEC-030 — printToPDF smoke test (CI-GATED).
//
// `renderHtmlToPdf` needs a REAL Electron runtime (an offscreen BrowserWindow +
// webContents.printToPDF). Under vitest/node the `electron` import is just a
// path string, so this cannot run headless in the normal `npm test` run — it is
// gated behind RUN_PRINT_PDF=1 exactly like the repo gates its live-TSA test
// (`core/audit/timestamp/_live.test.ts`). When ungated it is skipped, never
// failed. Run it in an Electron context with: RUN_PRINT_PDF=1 ... to exercise it.

import { describe, it, expect } from 'vitest';
import { buildReportHtml } from '../../core/report/template.js';
import type { ReportModel } from '../../shared/ipc-contracts/report.js';

const RUN = process.env.RUN_PRINT_PDF === '1';

const model: ReportModel = {
  locale: 'es',
  grouping: 'category',
  header: {
    orgName: 'Asociación Ejemplo',
    legalRegistrationLine: 'Reg. Nº 12345',
    address: 'Calle Mayor 1',
    contactEmail: 'tesoreria@ejemplo.org',
    logoDataUrl: null,
    title: 'Informe financiero 2024',
    periodLabel: '1 ene 2024 – 31 dic 2024',
    generatedLabel: 'Generado 15 ene 2025',
  },
  scopeLabel: 'Todas las cuentas',
  credits: { rows: [{ label: 'Cuotas', amount: 9506.21 }], total: 9506.21 },
  debits: { rows: [{ label: 'Suministros', amount: 8647.5 }], total: 8647.5 },
  reconciliation: { opening: 32162.93, credits: 9506.21, debits: 8647.5, closing: 33021.64 },
  period: { kind: 'calendar-year', start: '2024-01-01', end: '2024-12-31', year: 2024 },
  signatures: {
    treasurer: { name: 'Ana Tesorera', role: 'Tesorera', place: 'Madrid' },
    auditor: { name: 'Beto Auditor', role: 'Auditor externo', place: 'Sevilla' },
  },
};

describe.runIf(RUN)('renderHtmlToPdf (electron printToPDF)', () => {
  it('produces a non-empty PDF buffer from the assembled template', async () => {
    const { renderHtmlToPdf } = await import('./reportPdf.js');
    const pdf = await renderHtmlToPdf(buildReportHtml(model));
    expect(pdf.length).toBeGreaterThan(0);
    // PDF magic bytes.
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
