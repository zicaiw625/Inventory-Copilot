import {
  DEFAULT_MILD_OVERSTOCK_THRESHOLD_DAYS,
  DEFAULT_OVERSTOCK_THRESHOLD_DAYS,
} from "../config/inventory";
import { computeCoverage, safeDivide, sum } from "./inventory.helpers.server";
import type { AdminApiClient } from "./shopify-graphql.server";
import type { OverstockPayload, OverstockRow } from "./inventory.types";
import { getInventoryLastUpdated, getVariantMetrics } from "./inventory.sync.server";

type OverstockThresholds = {
  overstockThresholdDays?: number;
  mildOverstockThresholdDays?: number;
};

export async function getOverstockData(
  admin: AdminApiClient,
  shopDomain: string,
  thresholds: OverstockThresholds = {},
): Promise<OverstockPayload> {
  const variants = await getVariantMetrics(admin, shopDomain);
  const overstockThreshold = thresholds.overstockThresholdDays ?? DEFAULT_OVERSTOCK_THRESHOLD_DAYS;
  const mildThreshold = thresholds.mildOverstockThresholdDays ?? DEFAULT_MILD_OVERSTOCK_THRESHOLD_DAYS;

  const rows: OverstockRow[] = variants
    .map((variant) => {
      const sales30d = variant.sales["30d"];
      const avgDailySales = safeDivide(sales30d, 30, 0);
      const coverageDays = computeCoverage(variant.available, avgDailySales);
      const stockValue = (variant.unitCost ?? 0) * variant.available;
      const severity =
        sales30d === 0 || coverageDays >= overstockThreshold
          ? "severe"
          : coverageDays >= mildThreshold
            ? "mild"
            : "normal";

      return {
        sku: variant.sku,
        name: variant.name,
        variant: variant.variant,
        available: variant.available,
        sales30d,
        avgDailySales,
        coverageDays,
        stockValue,
        unitCost: variant.unitCost,
        severity,
      };
    })
    .filter((row) => row.available > 0);

  const severeRows = rows.filter((row) => row.severity === "severe");
  const summary = {
    overstockCount: rows.filter((row) => row.coverageDays >= overstockThreshold).length,
    severeCount: severeRows.length,
    totalStockValue: sum(rows.map((row) => row.stockValue)),
    severeStockValue: sum(severeRows.map((row) => row.stockValue)),
  };

  return {
    rows,
    summary,
    overstockThresholdDays: overstockThreshold,
    mildOverstockThresholdDays: mildThreshold,
    lastCalculated: await getInventoryLastUpdated(shopDomain),
  };
}
