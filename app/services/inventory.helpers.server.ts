import {
  DEFAULT_OVERSTOCK_THRESHOLD_DAYS,
  DEFAULT_SHORTAGE_THRESHOLD_DAYS,
  DEFAULT_TARGET_COVERAGE,
  MAX_COVERAGE_DAYS,
  MIN_DAILY_SALES,
  MIN_RECOMMENDED_QTY,
  MIN_SALES_FOR_FORECAST,
  DEFAULT_OVERSTOCK_THRESHOLD_DAYS,
} from "../config/inventory";
import type {
  BudgetCandidate,
  BudgetPlan,
  DashboardRow,
  DashboardTimeframe,
  KPICard,
  Reminders,
  TimeframeKey,
  VariantDetail,
  VariantMetrics,
} from "./inventory.types";

export const DEFAULT_HISTORY_WINDOW_DAYS = 30;

export function parseHistoryWindowDays(historyWindow: string | undefined) {
  if (!historyWindow) return DEFAULT_HISTORY_WINDOW_DAYS;
  const digits = parseInt(historyWindow, 10);
  return Number.isFinite(digits) && digits > 0 ? digits : DEFAULT_HISTORY_WINDOW_DAYS;
}

export function safeDivide(
  numerator: number,
  denominator: number,
  defaultValue = 0,
): number {
  if (!Number.isFinite(denominator) || denominator === 0) return defaultValue;
  const result = numerator / denominator;
  return Number.isFinite(result) ? result : defaultValue;
}

export function computeCoverage(available: number, avgDailySales: number): number {
  if (available <= 0) return 0;
  const adjustedSales = Math.max(avgDailySales, MIN_DAILY_SALES);
  const rawCoverage = safeDivide(available, adjustedSales, 0);
  const rounded = Math.max(0, Math.round(rawCoverage * 10) / 10);
  return Math.min(rounded, MAX_COVERAGE_DAYS);
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }
  return sorted[mid];
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function buildRowsForTimeframe(
  variants: VariantMetrics[],
  timeframe: TimeframeKey,
  targetCoverage = DEFAULT_TARGET_COVERAGE,
): DashboardRow[] {
  const days = timeframe === "30d" ? 30 : timeframe === "60d" ? 60 : 90;

  return variants.map((variant) => {
    const sales = variant.sales[timeframe];
    const hasEnoughSales = sales >= MIN_SALES_FOR_FORECAST;
    const avgDailySalesRaw = hasEnoughSales ? safeDivide(sales, days, 0) : 0;
    const avgDailySales = round1(avgDailySalesRaw);
    const daysOfStock = computeCoverage(variant.available, avgDailySalesRaw);
    const recommendedQty =
      avgDailySalesRaw === 0
        ? 0
        : Math.max(0, Math.ceil(avgDailySalesRaw * targetCoverage - variant.available));
    const unitCost = variant.unitCost;
    const stockValue = (unitCost ?? 0) * variant.available;

    return {
      sku: variant.sku,
      name: variant.name,
      variant: variant.variant,
      available: variant.available,
      avgDailySales,
      daysOfStock,
      recommendedQty,
      coverageDays: daysOfStock,
      stockValue,
      unitCost,
      sales,
      salesValue: (unitCost ?? 0) * sales,
      insufficientSales: !hasEnoughSales,
    };
  });
}

export function buildTimeframe(
  rows: DashboardRow[],
  timeframe: TimeframeKey,
  shortageThreshold = DEFAULT_SHORTAGE_THRESHOLD_DAYS,
  overstockThreshold = DEFAULT_OVERSTOCK_THRESHOLD_DAYS,
): DashboardTimeframe {
  const shortage = rows
    .filter(
      (row) =>
        row.daysOfStock <= shortageThreshold ||
        row.recommendedQty >= MIN_RECOMMENDED_QTY,
    )
    .sort((a, b) => a.daysOfStock - b.daysOfStock)
    .slice(0, 5);

  const overstock = rows
    .filter((row) => (row.coverageDays ?? 0) >= overstockThreshold)
    .sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0))
    .slice(0, 5);

  const days = timeframe === "30d" ? 30 : timeframe === "60d" ? 60 : 90;

  const kpis: KPICard[] = [
    {
      label: "参与计算 SKU",
      value: `${rows.length}`,
      helper: "含可售库存的变体",
      tone: "positive",
    },
    {
      label: "库存总金额 (成本)",
      value: formatCurrency(sum(rows.map((row) => row.stockValue ?? 0))),
      helper: "已填写成本的 SKU",
    },
    {
      label: "预计可售天数（中位数）",
      value: `${median(rows.map((row) => row.daysOfStock))} 天`,
      helper: `窗口：${days} 天销量`,
    },
    {
      label: "本周风险 SKU",
      value: `${shortage.length} 缺货 / ${overstock.length} 过量`,
      helper: `阈值：≤${shortageThreshold} / ≥${overstockThreshold} 天`,
      tone: "warning",
    },
  ];

  return { kpis, shortage, overstock, rows };
}

export function buildBudgetPlan(rows: BudgetCandidate[]): BudgetPlan {
  const budget = 18000;
  const picks: BudgetPlan["picks"] = [];

  const candidates = rows
    .filter((row) => row.recommendedQty > 0)
    .map((row) => {
      const unitCost =
        row.unitCost ??
        (row.stockValue && row.available > 0 ? row.stockValue / row.available : undefined) ??
        0;
      const spend = row.recommendedQty * unitCost;
      const riskScore = row.daysOfStock > 0 ? 1 / row.daysOfStock : 2;
      const importance =
        row.salesValue ??
        (row.sales
          ? row.sales * Math.max(unitCost, 1)
          : row.avgDailySales * 30 * Math.max(unitCost, 1));
      const score = riskScore * (importance || 1);
      return { row, unitCost, spend, score };
    })
    .sort((a, b) => b.score - a.score);

  let used = 0;

  candidates.forEach(({ row, spend }) => {
    if (spend <= 0) return;
    if (used + spend <= budget || picks.length === 0) {
      used += spend;
      picks.push({
        sku: row.sku,
        name: row.name,
        qty: row.recommendedQty,
        amount: formatCurrency(spend),
        risk:
          row.daysOfStock <= DEFAULT_SHORTAGE_THRESHOLD_DAYS ? "爆款防断货" : "库存紧张",
      });
    }
  });

  const pickedSkus = new Set(picks.map((pick) => pick.sku));
  const excludedAmount = candidates
    .filter(({ row }) => !pickedSkus.has(row.sku))
    .reduce((total, item) => total + item.spend, 0);
  const excludedCount = Math.max(candidates.length - picks.length, 0);
  const totalPool = used + excludedAmount || budget;
  const coverageShare = totalPool > 0 ? Math.min(1, used / totalPool) : 0;

  return {
    budget,
    coverageDays: DEFAULT_TARGET_COVERAGE,
    usedAmount: used,
    excludedAmount,
    coverageShare,
    picks,
    excludedValue: formatCurrency(Math.abs(excludedAmount)),
    excludedCount,
  };
}

export function buildReminders(
  variants: VariantMetrics[],
): { reminders: Reminders; missingCostCount: number } {
  const costMissing = variants.filter((variant) => !variant.unitCost || variant.unitCost === 0).length;

  const reminders: Reminders = [
    {
      title: costMissing > 0 ? `还有 ${costMissing} 个 SKU 未填成本价` : "成本价已填写",
      action: costMissing > 0 ? "去导入成本 CSV" : "保持更新",
      tone: costMissing > 0 ? "warning" : "neutral",
    },
    {
      title: "Webhook 数据同步",
      action: "orders/paid · inventory_levels/update 已开启",
      tone: "neutral",
    },
  ];

  return { reminders, missingCostCount: costMissing };
}

export function buildSeriesFromSales(total30d: number): { date: string; quantity: number }[] {
  return Array.from({ length: 14 }).map((_, idx) => ({
    date: `Day ${idx + 1}`,
    quantity: Math.max(0, Math.round((total30d / 30) * (1 + Math.sin(idx) * 0.2))),
  }));
}

export function buildSeriesFromInventory(
  available: number,
): { date: string; quantity: number }[] {
  return Array.from({ length: 14 }).map((_, idx) => ({
    date: `Day ${idx + 1}`,
    quantity: Math.max(0, Math.round(available - idx * 2)),
  }));
}

export function getSampleVariantDetail(): VariantDetail {
  const history = Array.from({ length: 14 }).map((_, idx) => ({
    date: `Day ${idx + 1}`,
    quantity: Math.max(0, Math.round(30 + Math.sin(idx) * 6 - idx * 0.4)),
  }));
  return {
    id: "gid://shopify/ProductVariant/1",
    sku: "TS-XL-BLK",
    name: "Tech Shell Jacket",
    variant: "Black / XL",
    unitCost: 30,
    available: 38,
    price: 79,
    grossMargin: 62,
    avgDailySales: { "30d": 5.4, "60d": 4.7, "90d": 4.1 },
    daysOfStock: 7,
    coverage60d: 8,
    coverage90d: 9,
    historicalStockouts: 2,
    lastReplenished: "5 天前",
    salesHistory: history,
    inventoryHistory: history.map((item) => ({ ...item, quantity: item.quantity + 20 })),
  };
}

export function getSampleVariantMetrics(): VariantMetrics[] {
  const samples: VariantMetrics[] = [
    {
      id: "gid://shopify/ProductVariant/1",
      sku: "TS-XL-BLK",
      name: "Tech Shell Jacket",
      variant: "Black / XL",
      available: 38,
      unitCost: 30,
      sales: { "30d": 162, "60d": 282, "90d": 369 },
    },
    {
      id: "gid://shopify/ProductVariant/2",
      sku: "HB12-OLV-128",
      name: "Heritage Bottle",
      variant: "Olive 12oz",
      available: 120,
      unitCost: 8.5,
      sales: { "30d": 363, "60d": 618, "90d": 819 },
    },
    {
      id: "gid://shopify/ProductVariant/3",
      sku: "ATH-SHORT-NV-M",
      name: "Aero Run Short",
      variant: "Navy / M",
      available: 68,
      unitCost: 15,
      sales: { "30d": 276, "60d": 468, "90d": 594 },
    },
    {
      id: "gid://shopify/ProductVariant/4",
      sku: "CASE-IPH15-MT",
      name: "Magnetic Case iPhone 15",
      variant: "Matte Black",
      available: 44,
      unitCost: 12,
      sales: { "30d": 204, "60d": 354, "90d": 459 },
    },
    {
      id: "gid://shopify/ProductVariant/5",
      sku: "SOCK-MER-BLK",
      name: "Merino Crew Sock",
      variant: "Black / 2-pack",
      available: 150,
      unitCost: 6,
      sales: { "30d": 342, "60d": 552, "90d": 729 },
    },
    {
      id: "gid://shopify/ProductVariant/6",
      sku: "SOFA-2S-GRY",
      name: "Mod Sofa 2-seater",
      variant: "Gray",
      available: 188,
      unitCost: 100,
      sales: { "30d": 36, "60d": 68, "90d": 92 },
    },
    {
      id: "gid://shopify/ProductVariant/7",
      sku: "CNDL-WHT-3PK",
      name: "Scented Candle Set",
      variant: "White Tea / 3-pack",
      available: 420,
      unitCost: 29,
      sales: { "30d": 105, "60d": 190, "90d": 270 },
    },
    {
      id: "gid://shopify/ProductVariant/8",
      sku: "MAT-YOGA-SND",
      name: "Studio Yoga Mat",
      variant: "Sand",
      available: 260,
      unitCost: 36,
      sales: { "30d": 72, "60d": 126, "90d": 171 },
    },
    {
      id: "gid://shopify/ProductVariant/9",
      sku: "BAG-TOTE-CRM",
      name: "Canvas Day Tote",
      variant: "Cream",
      available: 344,
      unitCost: 30,
      sales: { "30d": 123, "60d": 198, "90d": 241 },
    },
    {
      id: "gid://shopify/ProductVariant/10",
      sku: "LAMP-DESK-GLD",
      name: "Brass Desk Lamp",
      variant: "Gold",
      available: 140,
      unitCost: 56,
      sales: { "30d": 33, "60d": 55, "90d": 75 },
    },
  ];

  return samples;
}
