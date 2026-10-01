// SPEC-030 / DESIGN-030 — PDF HTML template region tests. Asserts the assembled
// HTML contains the expected regions (header lockup, credits/debits tables,
// subcategory indent, boxed reconciliation, two-column signature footer) and is
// CSP-safe (no scripts, strict CSP meta, logo as data URL).

import { describe, it, expect } from 'vitest';
import { buildReportHtml } from './template.js';
import { assembleReportModel } from './assembleModel.js';
import type { CategoryBreakdown, RangeReconciliation } from '../query/queries.js';
import type { OrgProfileViewModel } from '../../shared/ipc-contracts/org-profile.js';

const breakdown: CategoryBreakdown = {
  income: [{ categoryId: '01HCAT0000000000000000001A', label: 'Cuotas', total: 9506.21 }],
  expense: [
    {
      categoryId: '01HCAT0000000000000000003A',
      label: 'Suministros',
      total: 8647.5,
      subRows: [
        { subcategoryId: '01HSUB0000000000000000001A', label: 'Electricidad', total: 5000 },
        { subcategoryId: null, label: null, total: 3647.5 },
      ],
    },
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
  address: 'Calle Mayor 1',
  contactEmail: 'tesoreria@ejemplo.org',
  treasurer: { name: 'Ana Tesorera', role: 'Tesorera', place: 'Madrid' },
  auditor: { name: 'Beto Auditor', role: 'Auditor externo', place: 'Sevilla' },
  logo: null,
};

function model(grouping: 'category' | 'category-subcategory' = 'category-subcategory') {
  return assembleReportModel({
    breakdown,
    reconciliation,
    org,
    logoDataUrl: 'data:image/png;base64,AAAA',
    periodKind: 'calendar-year',
    periodStart: '2024-01-01',
    periodEnd: '2024-12-31',
    grouping,
    locale: 'es',
    generatedAtIso: '2025-01-15',
  });
}

describe('buildReportHtml', () => {
  it('is a complete HTML document with a strict CSP and no scripts', () => {
    const html = buildReportHtml(model());
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script');
  });

  it('renders the header lockup (org name, legal line, title, period, scope)', () => {
    const html = buildReportHtml(model());
    expect(html).toContain('Asociación Ejemplo');
    expect(html).toContain('Reg. Nº 12345');
    expect(html).toContain('Informe financiero 2024');
    expect(html).toContain('1 ene 2024 – 31 dic 2024');
    expect(html).toContain('Todas las cuentas');
  });

  it('inlines the logo as a data URL (no file path)', () => {
    const html = buildReportHtml(model());
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('renders credits and debits captions and the formatted totals', () => {
    const html = buildReportHtml(model());
    expect(html).toContain('INGRESOS');
    expect(html).toContain('GASTOS');
    expect(html).toContain('9.506,21\u00A0€'); // credits total
    expect(html).toContain('\u2212\u20098.647,50\u00A0€'); // debit minus sign + thin space
  });

  it('indents subcategory rows with the ↳ glyph (label only, not the amount)', () => {
    const html = buildReportHtml(model('category-subcategory'));
    expect(html).toContain('class="label sub"');
    expect(html).toContain('\u21B3'); // ↳
    expect(html).toContain('Electricidad');
    expect(html).toContain('Sin clasificar'); // null subcategory bucket
  });

  it('uses tabular-nums for amount columns (alignment, not fixed widths)', () => {
    const html = buildReportHtml(model());
    expect(html).toContain('tabular-nums');
    expect(html).toContain('class="amt"');
  });

  it('renders the boxed reconciliation with an emphasized closing balance', () => {
    const html = buildReportHtml(model());
    expect(html).toContain('CONCILIACIÓN');
    expect(html).toContain('Saldo inicial');
    expect(html).toContain('Saldo final');
    expect(html).toContain('class="closing"');
    expect(html).toContain('+9.506,21\u00A0€'); // credits line, plus prefix
  });

  it('omits the internal-transfer line when the net is zero (consolidated)', () => {
    const html = buildReportHtml(model());
    expect(html).not.toContain('Traspasos entre cuentas propias');
  });

  it('renders a signed internal-transfer line when the net is non-zero', () => {
    const scoped = assembleReportModel({
      breakdown,
      reconciliation: {
        ...reconciliation,
        internalTransfersOut: 2591,
        internalTransfersNet: -2591,
        closing: reconciliation.closing - 2591,
      },
      org,
      logoDataUrl: null,
      periodKind: 'calendar-year',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      grouping: 'category',
      locale: 'es',
      generatedAtIso: '2025-01-15',
    });
    const html = buildReportHtml(scoped);
    expect(html).toContain('Traspasos entre cuentas propias (neto)');
    // Real minus sign + thin space, magnitude only (never a hyphen-minus).
    expect(html).toContain('\u2212\u20092.591,00\u00A0€');
  });

  it('renders a two-column signature footer (treasurer left / auditor right) with no image', () => {
    const html = buildReportHtml(model());
    expect(html).toContain('class="signatures"');
    expect(html).toContain('Ana Tesorera');
    expect(html).toContain('Beto Auditor');
    expect(html).toContain('Tesorero/a');
    expect(html).toContain('Auditor/a interno/a');
    // signature area is a ruled blank line, not an embedded image
    expect(html).toContain('class="sig-line"');
  });

  it('keeps print color adjust exact so grayscale survives', () => {
    const html = buildReportHtml(model());
    expect(html).toContain('print-color-adjust: exact');
  });

  it('escapes HTML metacharacters in dynamic content', () => {
    const evilOrg: OrgProfileViewModel = { ...org, orgName: '<script>alert(1)</script>' };
    const m = assembleReportModel({
      breakdown,
      reconciliation,
      org: evilOrg,
      logoDataUrl: null,
      periodKind: 'calendar-year',
      periodStart: '2024-01-01',
      periodEnd: '2024-12-31',
      grouping: 'category',
      locale: 'es',
      generatedAtIso: '2025-01-15',
    });
    const html = buildReportHtml(m);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
