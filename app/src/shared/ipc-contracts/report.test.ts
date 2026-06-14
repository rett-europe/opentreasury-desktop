// SPEC-030 §7 — Report IPC contract boundary tests (Zod valid/invalid).

import { describe, it, expect } from 'vitest';
import {
  reportBuildRequestSchema,
  reportGenerateRequestSchema,
  reportGenerateResponseSchema,
  reportModelSchema,
} from './report.js';

const ULID = '01HZZZZZZZZZZZZZZZZZZZZZZA';

const validBuild = {
  periodKind: 'calendar-year' as const,
  periodStart: '2024-01-01',
  periodEnd: '2024-12-31',
  grouping: 'category' as const,
  locale: 'es' as const,
};

describe('reportBuildRequestSchema', () => {
  it('accepts a minimal valid request (no account scope = consolidated)', () => {
    expect(reportBuildRequestSchema.parse(validBuild)).toMatchObject(validBuild);
  });

  it('accepts a single account scope', () => {
    const r = reportBuildRequestSchema.parse({ ...validBuild, accountIds: [ULID] });
    expect(r.accountIds).toEqual([ULID]);
  });

  it('rejects more than one account (WI-1 supports one or all)', () => {
    expect(
      reportBuildRequestSchema.safeParse({ ...validBuild, accountIds: [ULID, ULID] }).success,
    ).toBe(false);
  });

  it('rejects a non-ULID account id', () => {
    expect(
      reportBuildRequestSchema.safeParse({ ...validBuild, accountIds: ['not-a-ulid'] }).success,
    ).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(
      reportBuildRequestSchema.safeParse({ ...validBuild, periodStart: '2024/01/01' }).success,
    ).toBe(false);
  });

  it('rejects start after end', () => {
    expect(
      reportBuildRequestSchema.safeParse({
        ...validBuild,
        periodStart: '2024-12-31',
        periodEnd: '2024-01-01',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown grouping / locale', () => {
    expect(reportBuildRequestSchema.safeParse({ ...validBuild, grouping: 'monthly' }).success).toBe(
      false,
    );
    expect(reportBuildRequestSchema.safeParse({ ...validBuild, locale: 'fr' }).success).toBe(false);
  });

  it('rejects unknown extra keys (strict)', () => {
    expect(
      reportBuildRequestSchema.safeParse({ ...validBuild, destPath: '/tmp/x.pdf' }).success,
    ).toBe(false);
  });
});

describe('reportGenerateRequestSchema', () => {
  it('accepts ONLY a confirmation token', () => {
    expect(reportGenerateRequestSchema.parse({ confirmationToken: 'abc' })).toEqual({
      confirmationToken: 'abc',
    });
  });

  it('rejects an empty token', () => {
    expect(reportGenerateRequestSchema.safeParse({ confirmationToken: '' }).success).toBe(false);
  });

  it('rejects a path or any extra field crossing the boundary (strict)', () => {
    expect(
      reportGenerateRequestSchema.safeParse({
        confirmationToken: 'abc',
        destPath: '/home/u/Documents/report.pdf',
      }).success,
    ).toBe(false);
  });
});

describe('reportGenerateResponseSchema', () => {
  it('accepts saved / canceled / error outcomes', () => {
    expect(
      reportGenerateResponseSchema.parse({ outcome: 'saved', basename: 'r.pdf' }).outcome,
    ).toBe('saved');
    expect(reportGenerateResponseSchema.parse({ outcome: 'canceled' }).outcome).toBe('canceled');
    expect(
      reportGenerateResponseSchema.parse({ outcome: 'error', code: 'REPORT_TOKEN_INVALID' })
        .outcome,
    ).toBe('error');
  });

  it('rejects a path string masquerading as an outcome field', () => {
    expect(
      reportGenerateResponseSchema.safeParse({ outcome: 'saved', path: '/x/r.pdf' }).success,
    ).toBe(false);
  });
});

describe('reportModelSchema', () => {
  it('rejects a logo on-disk path (only a data URL or null is allowed)', () => {
    // The schema accepts any string for logoDataUrl, but the model must never
    // carry a path field — assert the shape is closed to extras.
    const minimal = {
      locale: 'es',
      grouping: 'category',
      header: {
        orgName: 'Org',
        legalRegistrationLine: '',
        address: '',
        contactEmail: '',
        logoDataUrl: null,
        title: 'Informe financiero 2024',
        periodLabel: '1 ene 2024 – 31 dic 2024',
        generatedLabel: 'Generado 1 ene 2025',
        logoPath: '/userData/logo.png',
      },
      scopeLabel: 'Todas las cuentas',
      credits: { rows: [], total: 0 },
      debits: { rows: [], total: 0 },
      reconciliation: { opening: 0, credits: 0, debits: 0, closing: 0 },
      period: { kind: 'calendar-year', start: '2024-01-01', end: '2024-12-31', year: 2024 },
      signatures: {
        treasurer: { name: '', role: '', place: '' },
        auditor: { name: '', role: '', place: '' },
      },
    };
    expect(reportModelSchema.safeParse(minimal).success).toBe(false);
  });
});
