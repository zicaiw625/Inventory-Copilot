import {
  DEFAULT_LEAD_TIME_DAYS,
  DEFAULT_SAFETY_DAYS,
  DEFAULT_SHORTAGE_THRESHOLD_DAYS,
  MIN_RECOMMENDED_QTY,
} from "../config/inventory";
import { buildBudgetPlan, buildRowsForTimeframe, parseHistoryWindowDays } from "./inventory.helpers.server";
import type { AdminApiClient } from "./shopify-graphql.server";
import type { ReplenishmentPayload, ReplenishmentRow } from "./inventory.types";
import { buildDashboardLocations, getVariantMetrics } from "./inventory.sync.server";
import { readSettings } from "./inventory.settings.server";

export async function getReplenishmentData(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<ReplenishmentPayload> {
  const settings = await readSettings(shopDomain);
  const shortageThreshold = settings?.shortageThreshold ?? DEFAULT_SHORTAGE_THRESHOLD_DAYS;
  const safetyDays = settings?.safetyDays ?? DEFAULT_SAFETY_DAYS;
  const leadTimeDays = settings?.leadTime ?? DEFAULT_LEAD_TIME_DAYS;
  const targetCoverage = Math.max(leadTimeDays + safetyDays, 30);
  const historyWindowDays = parseHistoryWindowDays(settings?.historyWindow);
  const variants = await getVariantMetrics(admin, shopDomain);
  const missingCostCount = variants.filter((variant) => !variant.unitCost || variant.unitCost === 0).length;
  const metrics30d = buildRowsForTimeframe(variants, "30d", targetCoverage);
  const locations = await buildDashboardLocations(admin, shopDomain);
  const primaryLocation = locations.find((location) => location.selected) ?? locations[0];
  const suppliers = [
    "Default supplier",
    "Alpha Sports",
    "Blue Motion",
    "Gadget Labs",
    "Hydro Made",
    "EverWool",
  ];

  const rows: ReplenishmentRow[] = metrics30d
    .map((metric) => {
      const note = metric.insufficientSales
        ? "销量不足以预测"
        : metric.daysOfStock <= shortageThreshold
          ? "缺货风险"
          : undefined;

      return {
        sku: metric.sku,
        name: metric.name,
        variant: metric.variant,
        location: primaryLocation?.name ?? "All included locations",
        available: metric.available,
        avgDailySales: metric.avgDailySales,
        daysOfStock: metric.daysOfStock,
        recommendedQty: metric.recommendedQty,
        targetCoverage: targetCoverage,
        unitCost: metric.unitCost ?? 0,
        supplier: "Default supplier",
        note,
      };
    })
    .filter((row) => row.available > 0 || row.recommendedQty > 0);

  const shortageCandidates = metrics30d.filter(
    (row) =>
      row.daysOfStock <= shortageThreshold ||
      row.recommendedQty >= MIN_RECOMMENDED_QTY,
  );

  const budgetPlan = buildBudgetPlan(shortageCandidates);

  return {
    rows,
    budgetPlan,
    missingCostCount,
    locations,
    suppliers,
    safetyDays,
    leadTimeDays,
    shortageThreshold,
    historyWindowDays,
    targetCoverageDays: targetCoverage,
  };
}
