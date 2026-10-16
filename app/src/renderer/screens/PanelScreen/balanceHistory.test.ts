import { describe, expect, it } from 'vitest';
import { monthEndBalances } from './balanceHistory.js';

describe('monthEndBalances', () => {
  it('walks back from the current balance through monthly nets', () => {
    expect(monthEndBalances(1000, [100, -50, 200])).toEqual([850, 800, 1000]);
  });

  it('avoids floating point drift', () => {
    expect(monthEndBalances(0.3, [0.1, 0.2])).toEqual([0.1, 0.3]);
  });

  it('returns a flat line when there is no activity', () => {
    expect(monthEndBalances(0, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('handles an empty series', () => {
    expect(monthEndBalances(500, [])).toEqual([]);
  });
});
