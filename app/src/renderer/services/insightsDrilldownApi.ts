/**
 * Insights drilldown API — wrappers over the 5 `insights:label-*` IPC
 * channels Morpheus shipped per UX-005 final spec §6.3 – §6.7.
 *
 * Each call validates the response with the corresponding Zod schema
 * before handing data to the renderer (mirrors the Panel API pattern).
 */

import {
  insightsLabelSummaryResponseSchema,
  type InsightsLabelSummaryRequest,
  type InsightsLabelSummaryResponse,
  insightsLabelByCategoryResponseSchema,
  type InsightsLabelByCategoryRequest,
  type InsightsLabelByCategoryResponse,
  insightsLabelBySubcategoryResponseSchema,
  type InsightsLabelBySubcategoryRequest,
  type InsightsLabelBySubcategoryResponse,
  insightsLabelMonthlyEvolutionResponseSchema,
  type InsightsLabelMonthlyEvolutionRequest,
  type InsightsLabelMonthlyEvolutionResponse,
  insightsLabelByAccountResponseSchema,
  type InsightsLabelByAccountRequest,
  type InsightsLabelByAccountResponse,
} from '../../shared/ipc-contracts/insights.js';

export async function getInsightsLabelSummary(
  request: InsightsLabelSummaryRequest,
): Promise<InsightsLabelSummaryResponse> {
  const raw = await window.opentreasury.insights.labelSummary(request);
  return insightsLabelSummaryResponseSchema.parse(raw);
}

export async function getInsightsLabelByCategory(
  request: InsightsLabelByCategoryRequest,
): Promise<InsightsLabelByCategoryResponse> {
  const raw = await window.opentreasury.insights.labelByCategory(request);
  return insightsLabelByCategoryResponseSchema.parse(raw);
}

export async function getInsightsLabelBySubcategory(
  request: InsightsLabelBySubcategoryRequest,
): Promise<InsightsLabelBySubcategoryResponse> {
  const raw = await window.opentreasury.insights.labelBySubcategory(request);
  return insightsLabelBySubcategoryResponseSchema.parse(raw);
}

export async function getInsightsLabelMonthlyEvolution(
  request: InsightsLabelMonthlyEvolutionRequest,
): Promise<InsightsLabelMonthlyEvolutionResponse> {
  const raw = await window.opentreasury.insights.labelMonthlyEvolution(request);
  return insightsLabelMonthlyEvolutionResponseSchema.parse(raw);
}

export async function getInsightsLabelByAccount(
  request: InsightsLabelByAccountRequest,
): Promise<InsightsLabelByAccountResponse> {
  const raw = await window.opentreasury.insights.labelByAccount(request);
  return insightsLabelByAccountResponseSchema.parse(raw);
}
