import prisma from "../db.server";

type AdminApiClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type SyncScope =
  | "inventory"
  | "orders"
  | "digest"
  | "sync-replenishment"
  | "sync-overstock"
  | "export-replenishment"
  | "export-overstock"
  | "budget-plan";

export type TimeframeKey = "30d" | "60d" | "90d";

export type KPICard = {
  label: string;
  value: string;
  helper: string;
  tone?: "positive" | "warning" | "neutral";
};

export type BudgetCandidate = {
  sku: string;
  name: string;
  variant: string;
  available: number;
  avgDailySales: number;
  daysOfStock: number;
  recommendedQty: number;
  unitCost?: number;
  sales?: number;
  salesValue?: number;
  stockValue?: number;
};

export type DashboardRow = BudgetCandidate & {
  coverageDays?: number;
  insufficientSales?: boolean;
};

export type DashboardTimeframe = {
  kpis: KPICard[];
  shortage: DashboardRow[];
  overstock: DashboardRow[];
};

export type BudgetPlan = {
  budget: number;
  coverageDays: number;
  usedAmount: number;
  excludedAmount: number;
  coverageShare: number;
  picks: {
    sku: string;
    name: string;
    qty: number;
    amount: string;
    supplier?: string;
    risk?: string;
  }[];
  excludedValue: string;
  excludedCount: number;
};

export type Reminders = { title: string; action: string; tone: "warning" | "neutral" }[];

export type DashboardPayload = {
  timeframes: Record<TimeframeKey, DashboardTimeframe>;
  digest: {
    window: string;
    cadence: string;
    channels: string;
    lastSent: string;
    lastSuccess: string;
    lastFailure?: string;
    lastError?: string;
    status: "ok" | "warning";
  };
  reminders: Reminders;
  missingCostCount: number;
  lastCalculated: string;
  budgetPlan: BudgetPlan;
};

export type ReplenishmentRow = {
  sku: string;
  name: string;
  variant: string;
  location: string;
  available: number;
  avgDailySales: number;
  daysOfStock: number;
  recommendedQty: number;
  targetCoverage: number;
  unitCost: number;
  supplier: string;
  note?: string;
};

export type ReplenishmentPayload = {
  rows: ReplenishmentRow[];
  budgetPlan: BudgetPlan;
  missingCostCount: number;
};

export type OverstockRow = {
  sku: string;
  name: string;
  variant: string;
  available: number;
  sales30d: number;
  avgDailySales: number;
  coverageDays: number;
  stockValue: number;
  lastReplenished: string;
  lastReplenishedDays: number;
  unitCost?: number;
  severity: "severe" | "mild" | "normal";
};

export type OverstockPayload = {
  rows: OverstockRow[];
  summary: {
    overstockCount: number;
    severeCount: number;
    totalStockValue: number;
    severeStockValue: number;
  };
};

export type SettingsPayload = {
  locations: { id: string; name: string; selected: boolean }[];
  historyWindow: "30 天" | "60 天" | "90 天";
  shortageThreshold: number;
  overstockThreshold: number;
  safetyDays: number;
  leadTime: number;
  digestFrequency: "daily" | "weekly" | "off";
  emailRecipients: string;
  slackWebhook: string;
  slackEnabled: boolean;
  missingCostCount: number;
  lastCalculated: string;
  webhookStatus: string;
  lastWebhook: string;
};

export type VariantDetail = {
  id: string;
  sku: string;
  name: string;
  variant: string;
  image?: string;
  unitCost?: number;
  available: number;
  price?: number;
  grossMargin?: number;
  avgDailySales: { "30d": number; "60d": number; "90d": number };
  daysOfStock: number;
   coverage60d: number;
   coverage90d: number;
  historicalStockouts: number;
   lastReplenished: string;
  salesHistory: { date: string; quantity: number }[];
  inventoryHistory: { date: string; quantity: number }[];
};

export type DigestPreview = {
  title: string;
  summary: {
    inventoryValue: string;
    shortageCount: number;
    overstockCount: number;
    updatedAt: string;
  };
  shortages: DashboardRow[];
  overstocks: DashboardRow[];
};

type VariantInventory = {
  id: string;
  sku: string;
  name: string;
  variant: string;
  available: number;
  unitCost?: number;
};

type VariantSalesBuckets = {
  "30d": number;
  "60d": number;
  "90d": number;
};

type VariantMetrics = VariantInventory & {
  sales: VariantSalesBuckets;
};

const SHORTAGE_THRESHOLD = 10;
const OVERSTOCK_THRESHOLD = 60;
const MIN_SALES_FOR_FORECAST = 10;
const MIN_RECOMMENDED_QTY = 5;
const DEFAULT_LEAD_TIME_DAYS = 14;
const SAFETY_DAYS = 7;
const TARGET_COVERAGE = Math.max(DEFAULT_LEAD_TIME_DAYS + SAFETY_DAYS, 30);
const CACHE_MAX_MINUTES = 30;

export async function getDashboardData(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<DashboardPayload> {
  const variants = await getVariantMetrics(admin, shopDomain);
  const rows30d = buildRowsForTimeframe(variants, "30d");
  const timeframes: Record<TimeframeKey, DashboardTimeframe> = {
    "30d": buildTimeframe(variants, "30d"),
    "60d": buildTimeframe(variants, "60d"),
    "90d": buildTimeframe(variants, "90d"),
  };

  const shortageCandidates = rows30d.filter(
    (row) => row.daysOfStock <= SHORTAGE_THRESHOLD || row.recommendedQty >= 5,
  );
  const budgetPlan = buildBudgetPlan(shortageCandidates);
  const { reminders, missingCostCount } = buildReminders(variants);

  return {
    timeframes,
    budgetPlan,
    reminders,
    missingCostCount,
    digest: {
      window: "30 天销量窗口",
      cadence: "周报：每周一 09:00",
      channels: "Email + Slack webhook",
      lastSent: "今天 08:10 已发送",
      lastSuccess: "今天 08:10",
      lastFailure: "无",
      lastError: "",
      status: "ok",
    },
    lastCalculated: "今天 07:45",
  };
}

export async function getReplenishmentData(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<ReplenishmentPayload> {
  const variants = await getVariantMetrics(admin, shopDomain);
  const missingCostCount = variants.filter((variant) => !variant.unitCost || variant.unitCost === 0).length;
  const metrics30d = buildRowsForTimeframe(variants, "30d");

  const rows = metrics30d
    .map((metric) => {
      const note = metric.insufficientSales
        ? "销量不足以预测"
        : metric.daysOfStock <= SHORTAGE_THRESHOLD
          ? "缺货风险"
          : undefined;

      return {
        sku: metric.sku,
        name: metric.name,
        variant: metric.variant,
        location: "All included locations",
        available: metric.available,
        avgDailySales: metric.avgDailySales,
        daysOfStock: metric.daysOfStock,
        recommendedQty: metric.recommendedQty,
        targetCoverage: TARGET_COVERAGE,
        unitCost: metric.unitCost ?? 0,
        supplier: "Default supplier",
        note,
      };
    })
    .filter((row) => row.available > 0 || row.recommendedQty > 0);

  const shortageCandidates = metrics30d.filter(
    (row) => row.daysOfStock <= SHORTAGE_THRESHOLD || row.recommendedQty >= MIN_RECOMMENDED_QTY,
  );

  const budgetPlan = buildBudgetPlan(shortageCandidates);

  return { rows, budgetPlan, missingCostCount };
}

export async function getOverstockData(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<OverstockPayload> {
  const variants = await getVariantMetrics(admin, shopDomain);
  const rows: OverstockRow[] = variants
    .map((variant) => {
      const sales30d = variant.sales["30d"];
      const avgDailySales = safeDivide(sales30d, 30);
      const coverageDays = computeCoverage(variant.available, avgDailySales);
      const stockValue = (variant.unitCost ?? 0) * variant.available;
      const lastReplenishedDays = Math.max(3, (variant.available % 45) + 5);
      const severity =
        sales30d === 0 || coverageDays >= 120
          ? "severe"
          : coverageDays >= 90
            ? "severe"
            : coverageDays >= OVERSTOCK_THRESHOLD
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
        lastReplenished: `${lastReplenishedDays} 天前`,
        lastReplenishedDays,
        unitCost: variant.unitCost,
        severity,
      };
    })
    .filter((row) => row.available > 0);

  const severeRows = rows.filter((row) => row.severity === "severe");
  const summary = {
    overstockCount: rows.filter((row) => row.coverageDays >= OVERSTOCK_THRESHOLD).length,
    severeCount: severeRows.length,
    totalStockValue: sum(rows.map((row) => row.stockValue)),
    severeStockValue: sum(severeRows.map((row) => row.stockValue)),
  };

  return { rows, summary };
}

export async function getSettingsData(
  admin: AdminApiClient,
  shopDomain?: string,
): Promise<SettingsPayload> {
  let locations: { id: string; name: string; selected?: boolean }[] = [];
  try {
    locations = await fetchLocations(admin);
  } catch (error) {
    console.error("Failed to fetch locations, falling back to sample", error);
  }

  const withSelection =
    locations.length > 0
      ? locations.map((loc, index) => ({ ...loc, selected: index < 2 }))
      : [
          { id: "us-east", name: "US East (primary)", selected: true },
          { id: "eu-fulfillment", name: "EU Fulfillment", selected: true },
          { id: "pop-up", name: "Pop-up Store", selected: false },
        ];

  let missingCostCount = 0;
  try {
    if (shopDomain) {
      const cached = await getCachedVariantMetrics(shopDomain);
      missingCostCount = cached.filter((variant) => !variant.unitCost || variant.unitCost === 0).length;
    }
  } catch (error) {
    console.error("Failed to read cached metrics for settings", error);
  }
  if (!missingCostCount) {
    missingCostCount = getSampleVariantMetrics().filter((variant) => !variant.unitCost).length;
  }

  return {
    locations: withSelection,
    historyWindow: "30 天",
    shortageThreshold: SHORTAGE_THRESHOLD,
    overstockThreshold: 90,
    safetyDays: 7,
    leadTime: 14,
    digestFrequency: "weekly",
    emailRecipients: "ops@brand.com, founder@brand.com",
    slackWebhook: "https://hooks.slack.com/...",
    slackEnabled: true,
    missingCostCount,
    lastCalculated: "今天 07:45",
    webhookStatus: "orders/paid · inventory_levels/update · products/update",
    lastWebhook: "近 5 分钟有 webhook 增量",
  };
}

async function getVariantMetrics(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<VariantMetrics[]> {
  const freshCached = await getCachedVariantMetrics(shopDomain, CACHE_MAX_MINUTES);
  if (freshCached.length > 0) {
    return freshCached;
  }

  try {
    const [inventory, sales] = await Promise.all([
      fetchVariantInventory(admin),
      fetchOrderSales(admin),
    ]);

    const inventoryById = new Map(inventory.map((item) => [item.id, item]));

    const variants: VariantMetrics[] = [];

    const ids = new Set([...inventoryById.keys(), ...sales.keys()]);
    ids.forEach((id) => {
      const inventoryItem = inventoryById.get(id);
      const salesBuckets = sales.get(id) ?? { "30d": 0, "60d": 0, "90d": 0 };
      variants.push({
        id,
        sku: inventoryItem?.sku ?? "Unknown SKU",
        name: inventoryItem?.name ?? "Unknown product",
        variant: inventoryItem?.variant ?? "",
        available: inventoryItem?.available ?? 0,
        unitCost: inventoryItem?.unitCost,
        sales: salesBuckets,
      });
    });

    if (variants.length > 0) {
      await saveVariantMetrics(shopDomain, variants);
      await recordSync(shopDomain, "inventory", "success", `Variants: ${variants.length}`);
      return variants;
    }
  } catch (error) {
    console.error("Failed to load Shopify data, falling back to cache/sample", error);
  }

  const anyCached = await getCachedVariantMetrics(shopDomain);
  if (anyCached.length > 0) {
    return anyCached;
  }

  await recordSync(shopDomain, "inventory", "failure", "Fallback to sample");
  return getSampleVariantMetrics();
}

async function fetchVariantInventory(admin: AdminApiClient): Promise<VariantInventory[]> {
  const query = `#graphql
    query InventorySnapshot($cursor: String) {
      productVariants(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          sku
          title
          inventoryQuantity
          product { title }
          inventoryItem {
            unitCost { amount }
          }
        }
      }
    }
  `;

  const variants: VariantInventory[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  let guard = 0;

  while (hasNextPage && guard < 3) {
    const response = await admin.graphql(query, { variables: { cursor } });
    const json = await response.json();
    const nodes = json?.data?.productVariants?.nodes ?? [];
    const pageInfo = json?.data?.productVariants?.pageInfo;

    nodes.forEach((node: any) => {
      variants.push({
        id: node.id,
        sku: node.sku ?? "Unknown SKU",
        name: node.product?.title ?? "Unknown product",
        variant: node.title ?? "",
        available: Number(node.inventoryQuantity ?? 0),
        unitCost: Number(node.inventoryItem?.unitCost?.amount ?? 0) || undefined,
      });
    });

    hasNextPage = Boolean(pageInfo?.hasNextPage);
    cursor = pageInfo?.endCursor ?? undefined;
    guard += 1;
  }

  return variants;
}

async function fetchOrderSales(
  admin: AdminApiClient,
): Promise<Map<string, VariantSalesBuckets>> {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const queryString = `created_at:>=${since.toISOString().slice(0, 10)} AND financial_status:paid`;

  const query = `#graphql
    query OrdersForInventory($query: String!, $first: Int!) {
      orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            createdAt
            lineItems(first: 50) {
              edges {
                node {
                  quantity
                  variant {
                    id
                    sku
                    title
                    product { title }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await admin.graphql(query, {
    variables: { query: queryString, first: 80 },
  });
  const json = await response.json();
  const edges = json?.data?.orders?.edges ?? [];

  const sales = new Map<string, VariantSalesBuckets>();
  const now = Date.now();

  edges.forEach((edge: any) => {
    const order = edge?.node;
    if (!order?.createdAt) return;
    const createdAt = new Date(order.createdAt).getTime();
    const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    order.lineItems?.edges?.forEach((lineEdge: any) => {
      const line = lineEdge?.node;
      const variantId = line?.variant?.id;
      if (!variantId) return;
      const quantity = Number(line.quantity ?? 0);
      const buckets = sales.get(variantId) ?? { "30d": 0, "60d": 0, "90d": 0 };

      if (diffDays <= 30) {
        buckets["30d"] += quantity;
      }
      if (diffDays <= 60) {
        buckets["60d"] += quantity;
      }
      if (diffDays <= 90) {
        buckets["90d"] += quantity;
      }

      sales.set(variantId, buckets);
    });
  });

  return sales;
}

async function fetchLocations(
  admin: AdminApiClient,
): Promise<{ id: string; name: string }[]> {
  const query = `#graphql
    query LocationsForInventory($cursor: String) {
      locations(first: 50, after: $cursor) {
        nodes { id name }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const all: { id: string; name: string }[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  let guard = 0;

  while (hasNextPage && guard < 3) {
    const response = await admin.graphql(query, { variables: { cursor } });
    const json = await response.json();
    const nodes = json?.data?.locations?.nodes ?? [];
    const pageInfo = json?.data?.locations?.pageInfo;

    nodes.forEach((node: any) => {
      all.push({ id: node.id, name: node.name });
    });

    hasNextPage = Boolean(pageInfo?.hasNextPage);
    cursor = pageInfo?.endCursor ?? undefined;
    guard += 1;
  }

  return all;
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

  const avg30 = safeDivide(match.sales["30d"], 30);
  const avg60 = safeDivide(match.sales["60d"], 60);
  const avg90 = safeDivide(match.sales["90d"], 90);
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
  const timeframe = buildTimeframe(variants, "30d");
  return {
    title: "[Inventory Copilot] 每周库存雷达 – 缺货风险 & 压货清单",
    summary: {
      inventoryValue: formatCurrency(
        sum(timeframe.shortage.map((row) => row.stockValue ?? 0)) +
          sum(timeframe.overstock.map((row) => row.stockValue ?? 0)),
      ),
      shortageCount: timeframe.shortage.length,
      overstockCount: timeframe.overstock.length,
      updatedAt: new Date().toLocaleString(),
    },
    shortages: timeframe.shortage,
    overstocks: timeframe.overstock,
  };
}

function buildSeriesFromSales(total30d: number): { date: string; quantity: number }[] {
  return Array.from({ length: 14 }).map((_, idx) => ({
    date: `Day ${idx + 1}`,
    quantity: Math.max(0, Math.round((total30d / 30) * (1 + Math.sin(idx) * 0.2))),
  }));
}

function buildSeriesFromInventory(available: number): { date: string; quantity: number }[] {
  return Array.from({ length: 14 }).map((_, idx) => ({
    date: `Day ${idx + 1}`,
    quantity: Math.max(0, Math.round(available - idx * 2)),
  }));
}

function getSampleVariantDetail(): VariantDetail {
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

function buildTimeframe(
  variants: VariantMetrics[],
  timeframe: TimeframeKey,
): DashboardTimeframe {
  const rows = buildRowsForTimeframe(variants, timeframe);

  const shortage = rows
    .filter(
      (row) =>
        row.daysOfStock <= SHORTAGE_THRESHOLD || row.recommendedQty >= MIN_RECOMMENDED_QTY,
    )
    .sort((a, b) => a.daysOfStock - b.daysOfStock)
    .slice(0, 5);

  const overstock = rows
    .filter((row) => (row.coverageDays ?? 0) >= OVERSTOCK_THRESHOLD)
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
      helper: `阈值：≤${SHORTAGE_THRESHOLD} / ≥${OVERSTOCK_THRESHOLD} 天`,
      tone: "warning",
    },
  ];

  return { kpis, shortage, overstock };
}

function buildRowsForTimeframe(
  variants: VariantMetrics[],
  timeframe: TimeframeKey,
): DashboardRow[] {
  const days = timeframe === "30d" ? 30 : timeframe === "60d" ? 60 : 90;

  return variants.map((variant) => {
    const sales = variant.sales[timeframe];
    const hasEnoughSales = sales >= MIN_SALES_FOR_FORECAST;
    const avgDailySalesRaw = hasEnoughSales ? safeDivide(sales, days) : 0;
    const avgDailySales = round1(avgDailySalesRaw);
    const daysOfStock = computeCoverage(variant.available, avgDailySalesRaw);
    const recommendedQty =
      avgDailySalesRaw === 0
        ? 0
        : Math.max(0, Math.ceil(avgDailySalesRaw * TARGET_COVERAGE - variant.available));
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

function buildBudgetPlan(rows: BudgetCandidate[]): BudgetPlan {
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
        risk: row.daysOfStock <= SHORTAGE_THRESHOLD ? "爆款防断货" : "库存紧张",
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
    coverageDays: TARGET_COVERAGE,
    usedAmount: used,
    excludedAmount,
    coverageShare,
    picks,
    excludedValue: formatCurrency(Math.abs(excludedAmount)),
    excludedCount,
  };
}

function buildReminders(
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

function computeCoverage(available: number, avgDailySales: number): number {
  if (avgDailySales <= 0) {
    return available > 0 ? 999 : 0;
  }
  return Math.max(0, Math.round((available / avgDailySales) * 10) / 10);
}

function safeDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
  }
  return sorted[mid];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function getSampleVariantMetrics(): VariantMetrics[] {
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

async function getCachedVariantMetrics(
  shopDomain: string,
  maxMinutes?: number,
): Promise<VariantMetrics[]> {
  const where: any = { shopDomain };
  if (maxMinutes) {
    const since = new Date(Date.now() - maxMinutes * 60 * 1000);
    where.lastCalculated = { gte: since };
  }

  const rows = await prisma.inventoryMetric.findMany({
    where,
    orderBy: { lastCalculated: "desc" },
  });

  return rows.map((row) => ({
    id: row.variantId,
    sku: row.sku,
    name: row.name,
    variant: row.variantTitle,
    available: row.available,
    unitCost: row.unitCost ?? undefined,
    sales: { "30d": row.sales30d, "60d": row.sales60d, "90d": row.sales90d },
  }));
}

async function saveVariantMetrics(shopDomain: string, variants: VariantMetrics[]) {
  const now = new Date();
  await prisma.$transaction(
    variants.map((variant) =>
      prisma.inventoryMetric.upsert({
        where: { shopDomain_variantId: { shopDomain, variantId: variant.id } },
        update: {
          sku: variant.sku,
          name: variant.name,
          variantTitle: variant.variant,
          available: variant.available,
          unitCost: variant.unitCost ?? null,
          sales30d: variant.sales["30d"],
          sales60d: variant.sales["60d"],
          sales90d: variant.sales["90d"],
          lastCalculated: now,
        },
        create: {
          shopDomain,
          variantId: variant.id,
          sku: variant.sku,
          name: variant.name,
          variantTitle: variant.variant,
          available: variant.available,
          unitCost: variant.unitCost ?? null,
          sales30d: variant.sales["30d"],
          sales60d: variant.sales["60d"],
          sales90d: variant.sales["90d"],
          lastCalculated: now,
        },
      }),
    ),
  );
}

async function recordSync(
  shopDomain: string,
  scope: SyncScope,
  status: "success" | "failure",
  message?: string,
) {
  try {
    await prisma.syncLog.create({
      data: { shopDomain, scope, status, message },
    });
  } catch (error) {
    console.error("Failed to record sync log", error);
  }
}

export async function logSyncEvent(
  shopDomain: string,
  scope: SyncScope,
  status: "success" | "failure",
  message?: string,
) {
  await recordSync(shopDomain, scope, status, message);
}
