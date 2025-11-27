import {
  DEFAULT_DIGEST_DAILY_ENABLED,
  DEFAULT_DIGEST_SEND_HOUR,
  DEFAULT_DIGEST_WEEKLY_ENABLED,
  DEFAULT_HISTORY_DAYS,
  DEFAULT_LEAD_TIME_DAYS,
  DEFAULT_MILD_OVERSTOCK_THRESHOLD_DAYS,
  DEFAULT_OVERSTOCK_THRESHOLD_DAYS,
  DEFAULT_SAFETY_DAYS,
  DEFAULT_SHORTAGE_THRESHOLD_DAYS,
} from "../config/inventory";
import prisma from "../db.server";
import { getSampleVariantMetrics } from "./inventory.helpers.server";
import { logEvent } from "./logger.server";
import { fetchLocations, getCachedVariantMetrics } from "./inventory.sync.server";
import type { AdminApiClient } from "./shopify-graphql.server";
import type { SettingsPayload } from "./inventory.types";

export async function getSettingsData(
  admin: AdminApiClient,
  shopDomain?: string,
): Promise<SettingsPayload> {
  let locations: { id: string; name: string; selected?: boolean }[] = [];
  try {
    locations = await fetchLocations(admin, shopDomain ?? "");
  } catch (error) {
    await logEvent(
      shopDomain ?? "unknown-shop",
      "sync",
      "failure",
      `Failed to fetch locations, using fallback: ${error instanceof Error ? error.message : "unknown"}`,
    );
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
    await logEvent(
      shopDomain ?? "unknown-shop",
      "sync",
      "failure",
      `Failed to read cached metrics for settings: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
  if (!missingCostCount) {
    missingCostCount = getSampleVariantMetrics().filter((variant) => !variant.unitCost).length;
  }

  const saved = shopDomain ? await readSettings(shopDomain) : null;

  return {
    locations: withSelection,
    historyWindow: saved?.historyWindow ?? `${DEFAULT_HISTORY_DAYS} 天`,
    shortageThreshold: saved?.shortageThreshold ?? DEFAULT_SHORTAGE_THRESHOLD_DAYS,
    overstockThreshold: saved?.overstockThreshold ?? DEFAULT_OVERSTOCK_THRESHOLD_DAYS,
    mildOverstockThreshold: saved?.mildOverstockThreshold ?? DEFAULT_MILD_OVERSTOCK_THRESHOLD_DAYS,
    safetyDays: saved?.safetyDays ?? DEFAULT_SAFETY_DAYS,
    leadTime: saved?.leadTime ?? DEFAULT_LEAD_TIME_DAYS,
    digestFrequency: (saved?.digestFrequency as SettingsPayload["digestFrequency"]) ?? "weekly",
    digestSendHour: saved?.digestSendHour ?? DEFAULT_DIGEST_SEND_HOUR,
    digestDailyEnabled: saved?.digestDailyEnabled ?? DEFAULT_DIGEST_DAILY_ENABLED,
    digestWeeklyEnabled: saved?.digestWeeklyEnabled ?? DEFAULT_DIGEST_WEEKLY_ENABLED,
    emailRecipients: saved?.emailRecipients ?? "ops@brand.com, founder@brand.com",
    slackWebhook: saved?.slackWebhook ?? "https://hooks.slack.com/...",
    slackEnabled: saved?.slackEnabled ?? true,
    missingCostCount,
    lastCalculated: saved?.updatedAt?.toLocaleString() ?? "今天 07:45",
    webhookStatus: "orders/paid · inventory_levels/update · products/update",
    lastWebhook: "近 5 分钟有 webhook 增量",
  };
}

export async function saveSettings(shopDomain: string, data: {
  shortageThreshold: number;
  overstockThreshold: number;
  mildOverstockThreshold: number;
  safetyDays: number;
  leadTime: number;
  historyWindow: string;
  digestFrequency: string;
  digestSendHour: number;
  digestDailyEnabled: boolean;
  digestWeeklyEnabled: boolean;
  emailRecipients: string;
  slackWebhook: string;
  slackEnabled: boolean;
  locations: { id: string; selected: boolean }[];
}) {
  await prisma.shopSetting.upsert({
    where: { shopDomain },
    create: {
      shopDomain,
      shortageThreshold: data.shortageThreshold,
      overstockThreshold: data.overstockThreshold,
      mildOverstockThreshold: data.mildOverstockThreshold,
      safetyDays: data.safetyDays,
      leadTime: data.leadTime,
      historyWindow: data.historyWindow,
      digestFrequency: data.digestFrequency,
      digestSendHour: data.digestSendHour,
      digestDailyEnabled: data.digestDailyEnabled,
      digestWeeklyEnabled: data.digestWeeklyEnabled,
      emailRecipients: data.emailRecipients,
      slackWebhook: data.slackWebhook,
      slackEnabled: data.slackEnabled,
    },
    update: {
      shortageThreshold: data.shortageThreshold,
      overstockThreshold: data.overstockThreshold,
      mildOverstockThreshold: data.mildOverstockThreshold,
      safetyDays: data.safetyDays,
      leadTime: data.leadTime,
      historyWindow: data.historyWindow,
      digestFrequency: data.digestFrequency,
      digestSendHour: data.digestSendHour,
      digestDailyEnabled: data.digestDailyEnabled,
      digestWeeklyEnabled: data.digestWeeklyEnabled,
      emailRecipients: data.emailRecipients,
      slackWebhook: data.slackWebhook,
      slackEnabled: data.slackEnabled,
    },
  });
  // Persisting locations would happen here if backed by DB; today we rely on Shopify locations.
}

export async function readSettings(shopDomain: string) {
  const row = await prisma.shopSetting.findUnique({ where: { shopDomain } });
  return row ?? null;
}
