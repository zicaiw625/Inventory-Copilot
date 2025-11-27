import { z } from "zod";
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
import type { FieldErrors } from "../types/errors";

export type SettingsField =
  | "shortageThreshold"
  | "overstockThreshold"
  | "mildOverstockThreshold"
  | "safetyDays"
  | "leadTime"
  | "digestSendHour"
  | "locations";

export type SettingsForm = {
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
};

function parseNumber(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const SettingsSchema = z.object({
  shortageThreshold: z.coerce.number().positive(),
  overstockThreshold: z.coerce.number().positive(),
  mildOverstockThreshold: z.coerce.number().positive(),
  safetyDays: z.coerce.number().min(0),
  leadTime: z.coerce.number().min(0),
  historyWindow: z.string(),
  digestFrequency: z.enum(["daily", "weekly", "off"]),
  digestSendHour: z.coerce.number().int().min(0).max(23),
  digestDailyEnabled: z.coerce.boolean(),
  digestWeeklyEnabled: z.coerce.boolean(),
  emailRecipients: z.string().optional().default(""),
  slackWebhook: z.string().optional().default(""),
  slackEnabled: z.coerce.boolean(),
  locations: z.array(z.object({ id: z.string(), selected: z.boolean() })).default([]),
});

export function parseSettings(formData: FormData) {
  const shortageThreshold = parseNumber(
    formData.get("shortageThreshold"),
    DEFAULT_SHORTAGE_THRESHOLD_DAYS,
  );
  const overstockThreshold = parseNumber(
    formData.get("overstockThreshold"),
    DEFAULT_OVERSTOCK_THRESHOLD_DAYS,
  );
  const mildOverstockThreshold = parseNumber(
    formData.get("mildOverstockThreshold"),
    DEFAULT_MILD_OVERSTOCK_THRESHOLD_DAYS,
  );
  const safetyDays = parseNumber(formData.get("safetyDays"), DEFAULT_SAFETY_DAYS);
  const leadTime = parseNumber(formData.get("leadTime"), DEFAULT_LEAD_TIME_DAYS);
  const historyWindow = (formData.get("historyWindow") as string) || `${DEFAULT_HISTORY_DAYS} 天`;
  const digestFrequency = (formData.get("digestFrequency") as string) || "weekly";
  const digestSendHour = parseNumber(formData.get("digestSendHour"), DEFAULT_DIGEST_SEND_HOUR);
  const digestDailyEnabled = formData.get("digestDailyEnabled") === "true";
  const digestWeeklyEnabled = formData.get("digestWeeklyEnabled") !== "false";
  const emailRecipients = (formData.get("emailRecipients") as string) || "";
  const slackWebhook = (formData.get("slackWebhook") as string) || "";
  const slackEnabled = formData.get("slackEnabled") === "true";
  const locationsRaw = (formData.get("locations") as string) || "[]";

  let locations: { id: string; selected: boolean }[] = [];
  try {
    locations = JSON.parse(locationsRaw);
  } catch {
    // handled by schema validation below
  }

  const parsed = SettingsSchema.safeParse({
    shortageThreshold,
    overstockThreshold,
    mildOverstockThreshold,
    safetyDays,
    leadTime,
    historyWindow,
    digestFrequency,
    digestSendHour,
    digestDailyEnabled,
    digestWeeklyEnabled,
    emailRecipients,
    slackWebhook,
    slackEnabled,
    locations,
  });

  if (!parsed.success) {
    const errors: FieldErrors<SettingsField> = {};
    parsed.error.issues.forEach((issue) => {
      const key = issue.path[0] as SettingsField | undefined;
      if (key) {
        errors[key] = issue.message;
      }
    });
    return { success: false, errors };
  }

  const data: SettingsForm = parsed.data;
  return { success: true, data };
}
