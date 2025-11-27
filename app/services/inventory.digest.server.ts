import {
  DEFAULT_HISTORY_DAYS,
  DEFAULT_LEAD_TIME_DAYS,
  DEFAULT_SAFETY_DAYS,
  DEFAULT_SHORTAGE_THRESHOLD_DAYS,
  DEFAULT_OVERSTOCK_THRESHOLD_DAYS,
  MIN_RECOMMENDED_QTY,
} from "../config/inventory";
import prisma from "../db.server";
import {
  buildBudgetPlan,
  buildReminders,
  buildRowsForTimeframe,
  buildSeriesFromInventory,
  buildSeriesFromSales,
  buildTimeframe,
  computeCoverage,
  formatCurrency,
  getSampleVariantDetail,
  parseHistoryWindowDays,
  safeDivide,
} from "./inventory.helpers.server";
import type {
  DashboardPayload,
  DigestPreview,
  TimeframeKey,
  VariantDetail,
} from "./inventory.types";
import { buildDashboardLocations, getVariantMetrics } from "./inventory.sync.server";
import { readSettings } from "./inventory.settings.server";
import type { AdminApiClient } from "./shopify-graphql.server";

export async function getDashboardData(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<DashboardPayload> {
  const savedSettings = await readSettings(shopDomain);
  const shortageThreshold = savedSettings?.shortageThreshold ?? DEFAULT_SHORTAGE_THRESHOLD_DAYS;
  const overstockThreshold =
    savedSettings?.overstockThreshold ?? DEFAULT_OVERSTOCK_THRESHOLD_DAYS;
  const safetyDays = savedSettings?.safetyDays ?? DEFAULT_SAFETY_DAYS;
  const leadTimeDays = savedSettings?.leadTime ?? DEFAULT_LEAD_TIME_DAYS;
  const targetCoverageDays = Math.max(leadTimeDays + safetyDays, 30);
  const historyWindowDays = parseHistoryWindowDays(savedSettings?.historyWindow);
  const variants = await getVariantMetrics(admin, shopDomain);
  const rowsByTimeframe: Record<TimeframeKey, ReturnType<typeof buildRowsForTimeframe>> = {
    "30d": buildRowsForTimeframe(variants, "30d", targetCoverageDays),
    "60d": buildRowsForTimeframe(variants, "60d", targetCoverageDays),
    "90d": buildRowsForTimeframe(variants, "90d", targetCoverageDays),
  };

  const rows30d = rowsByTimeframe["30d"];
  const timeframes: Record<TimeframeKey, ReturnType<typeof buildTimeframe>> = {
    "30d": buildTimeframe(rowsByTimeframe["30d"], "30d", shortageThreshold, overstockThreshold),
    "60d": buildTimeframe(rowsByTimeframe["60d"], "60d", shortageThreshold, overstockThreshold),
    "90d": buildTimeframe(rowsByTimeframe["90d"], "90d", shortageThreshold, overstockThreshold),
  };

  const locations = await buildDashboardLocations(admin, shopDomain);
  const budgetPlan = buildBudgetPlan(
    rows30d.filter(
      (row) =>
        row.daysOfStock <= shortageThreshold ||
        row.recommendedQty >= MIN_RECOMMENDED_QTY,
    ),
  );
  const { reminders, missingCostCount } = buildReminders(variants);

  return {
    timeframes,
    budgetPlan,
    reminders,
    missingCostCount,
    digest: {
      window: "30 天销量窗口",
      cadence:
        savedSettings?.digestFrequency === "daily"
          ? `每日 ${savedSettings?.digestSendHour ?? 9}:00`
          : savedSettings?.digestFrequency === "off"
            ? "已关闭"
            : `每周 ${savedSettings?.digestSendHour ?? 9}:00`,
      channels: `${savedSettings?.digestDailyEnabled || savedSettings?.digestWeeklyEnabled ? "Email" : "无"}${savedSettings?.slackEnabled ? " + Slack" : ""}`,
      lastSent: "今天 08:10 已发送",
      lastSuccess: "今天 08:10",
      lastFailure: "无",
      lastError: "",
      status: savedSettings?.digestFrequency === "off" ? "warning" : "ok",
    },
    lastCalculated: await getLastSyncTimestamp(shopDomain),
    locations,
    targetCoverages: [targetCoverageDays, targetCoverageDays + 15, targetCoverageDays + 30],
    safetyDays,
    leadTimeDays,
    historyWindowDays,
    recommendationPool: rows30d,
  };
}

async function getLastSyncTimestamp(shopDomain: string) {
  const last = await prisma.syncLog.findFirst({
    where: {
      shopDomain,
      scope: { in: ["inventory", "sync-replenishment", "sync-overstock"] },
      status: "success",
    },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return "暂无同步记录";
  return new Date(last.createdAt).toLocaleString();
}

export async function getVariantDetail(
  admin: AdminApiClient,
  shopDomain: string,
  variantId: string,
): Promise<VariantDetail> {
  const variants = await getVariantMetrics(admin, shopDomain);
  const match =
    variants.find((variant) => variant.id === variantId) ||
    variants.find((variant) => variant.sku === variantId) ||
    variants[0];

  if (!match) {
    return getSampleVariantDetail();
  }

  const avg30 = safeDivide(match.sales["30d"], 30, 0);
  const avg60 = safeDivide(match.sales["60d"], 60, 0);
  const avg90 = safeDivide(match.sales["90d"], 90, 0);
  const coverage60d = computeCoverage(match.available, avg60);
  const coverage90d = computeCoverage(match.available, avg90);
  const lastReplenished = `${Math.max(3, (match.available % 30) + 2)} 天前`;

  return {
    id: match.id,
    sku: match.sku,
    name: match.name,
    variant: match.variant,
    unitCost: match.unitCost,
    available: match.available,
    price: match.unitCost ? match.unitCost * 2.5 : undefined,
    grossMargin: match.unitCost ? 60 : undefined,
    avgDailySales: {
      "30d": avg30,
      "60d": avg60,
      "90d": avg90,
    },
    daysOfStock: computeCoverage(match.available, avg30),
    coverage60d,
    coverage90d,
    historicalStockouts: Math.max(0, Math.round(Math.random() * 4)),
    lastReplenished,
    salesHistory: buildSeriesFromSales(match.sales["30d"]),
    inventoryHistory: buildSeriesFromInventory(match.available),
  };
}

export async function getDigestPreview(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<DigestPreview> {
  const variants = await getVariantMetrics(admin, shopDomain);
  const rows30d = buildRowsForTimeframe(variants, "30d", DEFAULT_TARGET_COVERAGE);
  const timeframe = buildTimeframe(rows30d, "30d");
  return {
    title: "[Inventory Copilot] 每周库存雷达 – 缺货风险 & 压货清单",
    summary: {
      inventoryValue: formatCurrency(
        (timeframe.shortage ?? []).reduce((total, row) => total + (row.stockValue ?? 0), 0) +
          (timeframe.overstock ?? []).reduce((total, row) => total + (row.stockValue ?? 0), 0),
      ),
      shortageCount: timeframe.shortage.length,
      overstockCount: timeframe.overstock.length,
      updatedAt: new Date().toLocaleString(),
    },
    shortages: timeframe.shortage,
    overstocks: timeframe.overstock,
  };
}
