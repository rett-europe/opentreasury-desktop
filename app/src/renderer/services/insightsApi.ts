/**
 * Insights API — wrapper for insights:landing-summary IPC.
 */

import type {
  InsightsLandingSummaryRequest,
  InsightsLandingSummaryResponse,
} from '../../shared/ipc-contracts/insights.js';

/**
 * Fetches landing page summary (KPIs + tag cards).
 */
export async function getInsightsLandingSummary(
  request?: InsightsLandingSummaryRequest,
): Promise<InsightsLandingSummaryResponse> {
  return window.opentreasury.insights.landingSummary(request);
}
