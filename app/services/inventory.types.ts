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
  rows: DashboardRow[];
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
  recommendationPool: DashboardRow[];
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
  locations: { id: string; name: string; selected: boolean }[];
  targetCoverages: number[];
  safetyDays: number;
  leadTimeDays: number;
  historyWindowDays: number;
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
  locations: { id: string; name: string; selected: boolean }[];
  suppliers: string[];
  safetyDays: number;
  leadTimeDays: number;
  shortageThreshold: number;
  historyWindowDays: number;
  targetCoverageDays: number;
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
  overstockThresholdDays: number;
  mildOverstockThresholdDays: number;
};

export type SettingsPayload = {
  locations: { id: string; name: string; selected: boolean }[];
  historyWindow: "30 天" | "60 天" | "90 天";
  shortageThreshold: number;
  overstockThreshold: number;
  mildOverstockThreshold: number;
  safetyDays: number;
  leadTime: number;
  digestFrequency: "daily" | "weekly" | "off";
  digestSendHour: number;
  digestDailyEnabled: boolean;
  digestWeeklyEnabled: boolean;
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

export type VariantInventory = {
  id: string;
  sku: string;
  name: string;
  variant: string;
  available: number;
  unitCost?: number;
};

export type VariantSalesBuckets = {
  "30d": number;
  "60d": number;
  "90d": number;
};

export type VariantMetrics = VariantInventory & {
  sales: VariantSalesBuckets;
};
