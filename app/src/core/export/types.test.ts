// SPEC-027 FR11 — Export column metadata unit tests (Cypher).

import { describe, it, expect } from 'vitest';
import {
  BALANCE_SUMMARY_COLUMN_KEYS,
  EXPORT_COLUMN_KEYS,
  balanceSummaryHeaders,
  exportHeaders,
  exportRowCells,
  formatAmount,
  type ExportRow,
} from './types.js';

describe('exportHeaders', () => {
  it('returns the 14 Spanish headers in FR11 order', () => {
    expect(exportHeaders('es')).toEqual([
      'Fecha',
      'Cuenta',
      'Categoría',
      'Subcategoría',
      'Descripción',
      'Importe',
      'Saldo',
      'Moneda',
      'Etiquetas',
      'Referencia',
      'Comentario',
      'ID',
      'EsSplit',
      'IDPadre',
    ]);
  });

  it('returns the 14 English headers in FR11 order', () => {
    expect(exportHeaders('en')).toEqual([
      'Date',
      'Account',
      'Category',
      'Subcategory',
      'Description',
      'Amount',
      'Balance',
      'Currency',
      'Labels',
      'Reference',
      'Comment',
      'Id',
      'IsSplit',
      'ParentId',
    ]);
  });

  it('aligns header count with the column-key count', () => {
    expect(exportHeaders('en')).toHaveLength(EXPORT_COLUMN_KEYS.length);
  });
});

describe('formatAmount', () => {
  it('renders two decimal places with a dot separator', () => {
    expect(formatAmount(-300)).toBe('-300.00');
    expect(formatAmount(12.5)).toBe('12.50');
    expect(formatAmount(0)).toBe('0.00');
  });
});

describe('exportRowCells', () => {
  const row: ExportRow = {
    date: '2025-01-15',
    account: 'Caja',
    category: 'Donaciones',
    subcategory: 'Mensual',
    description: 'Aporte',
    amount: -300,
    balance: 1250.5,
    currency: 'EUR',
    labels: 'a;b',
    reference: 'REF1',
    comment: 'nota',
    id: '01HID0000000000000000000A',
    isSplit: true,
    parentId: '01HPARENT00000000000000AA',
  };

  it('projects cells in column order with amount formatted and isSplit as a literal', () => {
    expect(exportRowCells(row)).toEqual([
      '2025-01-15',
      'Caja',
      'Donaciones',
      'Mensual',
      'Aporte',
      '-300.00',
      '1250.50',
      'EUR',
      'a;b',
      'REF1',
      'nota',
      '01HID0000000000000000000A',
      'true',
      '01HPARENT00000000000000AA',
    ]);
  });

  it('renders isSplit=false as the string "false"', () => {
    expect(exportRowCells({ ...row, isSplit: false })[12]).toBe('false');
  });
});

describe('balanceSummaryHeaders', () => {
  it('returns ES and EN summary headers aligned with the summary column keys', () => {
    expect(balanceSummaryHeaders('es')).toEqual([
      'Cuenta',
      'Saldo inicial',
      'Entradas',
      'Salidas',
      'Saldo final',
      'Movimientos',
    ]);
    expect(balanceSummaryHeaders('en')).toHaveLength(BALANCE_SUMMARY_COLUMN_KEYS.length);
  });
});
