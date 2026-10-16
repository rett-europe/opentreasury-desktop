/**
 * Reconstruct month-end balances from today's balance and the monthly net
 * flows (oldest first, last bucket = current month). Walks backwards: the
 * balance at the end of month i is today's balance minus the net of every
 * later month. Sums in integer cents to avoid float drift.
 */
export function monthEndBalances(currentBalance: number, monthlyNets: readonly number[]): number[] {
  const result = new Array<number>(monthlyNets.length);
  let cents = Math.round(currentBalance * 100);
  for (let i = monthlyNets.length - 1; i >= 0; i--) {
    result[i] = cents / 100;
    cents -= Math.round((monthlyNets[i] ?? 0) * 100);
  }
  return result;
}
