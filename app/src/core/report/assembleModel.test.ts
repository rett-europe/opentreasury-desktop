// SPEC-030 — pure ReportModel assembler tests. Asserts the assembled model
// ties to the WI-1 query outputs (FR20), resolves Unclassified labels, carries
// subcategory rows in subcategory grouping, and never carries a logo path.

import { describe, it, expect } from 'vitest';
import { assembleReportModel } from './assembleModel.js';
import type { CategoryBreakdown, RangeReconciliation } from '../query/queries.js';
import type { OrgProfileViewModel } from '../../shared/ipc-contracts/org-profile.js';

// Golden fixture (SPEC-030 AC3).
const breakdown: CategoryBreakdown = {
  income: [
    { categoryId: '01HCAT0000000000000000001A', label: 'Cuotas', total: 7000.0 },
    { categoryId: '01HCAT0000000000000000002A', label: 'Donaciones', total: 2506.21 },
    { categoryId: null, label: null, total: 0 },
  ],
  expense: [
    { categoryId: '01HCAT0000000000000000003A', label: 'Alquiler', total: 6000.0 },
    { categoryId: '01HCAT0000000000000000004A', label: 'Suministros', total: 2647.5 },
  ],
};

const reconciliation: RangeReconciliation = {
  opening: 32162.93,
  credits: 9506.21,
  debits: 8647.5,
  internalTransfersIn: 0,
  internalTransfersOut: 0,
  internalTransfersNet: 0,
  closing: 33021.64,
};

const org: OrgProfileViewModel = {
  orgName: 'Asociación Ejemplo',
  legalRegistrationLine: 'Reg. Nº 12345',
  address: 'Calle Mayor 1\n28001 Madrid',
  contactEmail: 'tesoreria@ejemplo.org',
  treasurer: { name: 'Ana Tesorera', role: 'Tesorera', place: 'Madrid' },
  auditor: { name: 'Beto Auditor', role: 'Auditor externo', place: 'Madrid' },
  logo: {
    absolutePath: 'C:/userData/org-assets/logo.png',
    mimeType: 'image/png',
    width: 200,
    height: 80,
  },
};

const baseInput = {
  breakdown,
  reconciliation,
  org,
  logoDataUrl: 'data:image/png;base64,AAAA',
  periodKind: 'calendar-year' as const,
  periodStart: '2024-01-01',
  periodEnd: '2024-12-31',
  grouping: 'category' as const,
  locale: 'es' as const,
  generatedAtIso: '2025-01-15',
};

describe('assembleReportModel', () => {
  it('ties table totals to the reconciliation figures (FR20)', () => {
    const m = assembleReportModel(baseInput);
    expect(m.credits.total).toBe(reconciliation.credits);
    expect(m.debits.total).toBe(reconciliation.debits);
    expect(m.reconciliation.closing).toBe(33021.64);
    expect(m.reconciliation.opening + m.reconciliation.credits - m.reconciliation.debits).toBe(
      m.reconciliation.closing,
    );
  });

  it('maps null category labels to the localized Unclassified bucket', () => {
    const m = assembleReportModel(baseInput);
    const unclassified = m.credits.rows.find((r) => r.label === 'Sin clasificar');
    expect(unclassified).toBeDefined();
  });

  it('omits subRows in category grouping', () => {
    const m = assembleReportModel(baseInput);
    expect(m.credits.rows.every((r) => r.subRows === undefined)).toBe(true);
  });

  it('carries subRows in category-subcategory grouping', () => {
    const subBreakdown: CategoryBreakdown = {
      income: [
        {
          categoryId: '01HCAT0000000000000000001A',
          label: 'Cuotas',
          total: 7000,
          subRows: [
            { subcategoryId: '01HSUB0000000000000000001A', label: 'Socios', total: 5000 },
            { subcategoryId: null, label: null, total: 2000 },
          ],
        },
      ],
      expense: [],
    };
    const m = assembleReportModel({
      ...baseInput,
      breakdown: subBreakdown,
      grouping: 'category-subcategory',
    });
    const row = m.credits.rows[0]!;
    expect(row.subRows).toHaveLength(2);
    expect(row.subRows!.map((s) => s.label)).toContain('Sin clasificar');
  });

  it('builds the calendar-year title and a consolidated scope label', () => {
    const m = assembleReportModel(baseInput);
    expect(m.header.title).toBe('Informe financiero 2024');
    expect(m.period.year).toBe(2024);
    expect(m.scopeLabel).toBe('Todas las cuentas');
  });

  it('uses the supplied account name as the scope label when scoped', () => {
    const m = assembleReportModel({ ...baseInput, scopeAccountName: 'Cuenta Corriente' });
    expect(m.scopeLabel).toBe('Cuenta Corriente');
  });

  it('inlines the logo as a data URL and never exposes the on-disk path', () => {
    const m = assembleReportModel(baseInput);
    expect(m.header.logoDataUrl).toBe('data:image/png;base64,AAAA');
    expect(JSON.stringify(m)).not.toContain('org-assets');
  });

  it('produces an English title + scope for en locale', () => {
    const m = assembleReportModel({ ...baseInput, locale: 'en' });
    expect(m.header.title).toBe('Financial Report 2024');
    expect(m.scopeLabel).toBe('All accounts');
  });

  it('uses the title prefix only (no year) for a custom range', () => {
    const m = assembleReportModel({
      ...baseInput,
      periodKind: 'custom-range',
      periodStart: '2024-03-01',
      periodEnd: '2024-05-31',
    });
    expect(m.header.title).toBe('Informe financiero');
    expect(m.period.year).toBeNull();
  });
});
