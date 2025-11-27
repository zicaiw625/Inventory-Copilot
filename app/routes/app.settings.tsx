import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { json, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getSettingsData, saveSettings } from "../services/inventory.settings.server";
import { logSyncEvent } from "../services/inventory.sync.server";
import type { SettingsPayload } from "../services/inventory.types";
import type { FieldErrors } from "../types/errors";
import { parseSettings, type SettingsField, type SettingsForm } from "../validation/settings";
import styles from "./app.settings.module.css";

type SettingsActionResponse = {
  ok: boolean;
  message?: string;
  errors?: FieldErrors<SettingsField>;
  savedAt?: string;
  data?: SettingsForm;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  return getSettingsData(admin, session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const data = await request.formData();

  const parsed = parseSettings(data);
  if (!parsed.success) {
    return json<SettingsActionResponse>({ ok: false, errors: parsed.errors }, { status: 400 });
  }

  await logSyncEvent(
    session.shop,
    "sync-replenishment",
    "success",
    `更新设置：阈值 ${parsed.data.shortageThreshold}/${parsed.data.overstockThreshold}，交期 ${parsed.data.leadTime}`,
  );

  await saveSettings(session.shop, parsed.data);

  return json<SettingsActionResponse>({
    ok: true,
    message: "设置已保存，将在夜间任务和 webhook 增量中生效",
    savedAt: new Date().toISOString(),
    data: parsed.data,
  });
};

export default function Settings() {
  const initial = useLoaderData<typeof loader>();
  const saveFetcher = useFetcher<typeof action>();

  const [locations, setLocations] = useState(initial.locations);
  const [historyWindow, setHistoryWindow] = useState(initial.historyWindow);
  const [shortageThreshold, setShortageThreshold] = useState(initial.shortageThreshold);
  const [overstockThreshold, setOverstockThreshold] = useState(initial.overstockThreshold);
  const [mildOverstockThreshold, setMildOverstockThreshold] = useState(initial.mildOverstockThreshold);
  const [safetyDays, setSafetyDays] = useState(initial.safetyDays);
  const [leadTime, setLeadTime] = useState(initial.leadTime);
  const [digestFrequency, setDigestFrequency] = useState(initial.digestFrequency);
  const [digestSendHour, setDigestSendHour] = useState(initial.digestSendHour);
  const [digestDailyEnabled, setDigestDailyEnabled] = useState(initial.digestDailyEnabled);
  const [digestWeeklyEnabled, setDigestWeeklyEnabled] = useState(initial.digestWeeklyEnabled);
  const [emailRecipients, setEmailRecipients] = useState(initial.emailRecipients);
  const [slackWebhook, setSlackWebhook] = useState(initial.slackWebhook);
  const [slackEnabled, setSlackEnabled] = useState(initial.slackEnabled);
  const isSaving = saveFetcher.state !== "idle";
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const errors = saveFetcher.data?.errors ?? {};

  useEffect(() => {
    if (saveFetcher.data?.message) {
      setSaveMessage(saveFetcher.data.message);
      const timer = setTimeout(() => setSaveMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [saveFetcher.data]);

  useEffect(() => {
    if (saveFetcher.data?.data) {
      const saved = saveFetcher.data.data;
      setLocations(saved.locations);
      setHistoryWindow(saved.historyWindow);
      setShortageThreshold(saved.shortageThreshold);
      setOverstockThreshold(saved.overstockThreshold);
      setMildOverstockThreshold(saved.mildOverstockThreshold);
      setSafetyDays(saved.safetyDays);
      setLeadTime(saved.leadTime);
      setDigestFrequency(saved.digestFrequency);
      setDigestSendHour(saved.digestSendHour);
      setDigestDailyEnabled(saved.digestDailyEnabled);
      setDigestWeeklyEnabled(saved.digestWeeklyEnabled);
      setEmailRecipients(saved.emailRecipients);
      setSlackWebhook(saved.slackWebhook);
      setSlackEnabled(saved.slackEnabled);
    }
  }, [saveFetcher.data]);

  const toggleLocation = (id: string) => {
    setLocations((current) =>
      current.map((loc) =>
        loc.id === id ? { ...loc, selected: !loc.selected } : loc,
      ),
    );
  };

  const handleSave = () => {
    const formData = {
      historyWindow,
      shortageThreshold: String(shortageThreshold),
      overstockThreshold: String(overstockThreshold),
      mildOverstockThreshold: String(mildOverstockThreshold),
      safetyDays: String(safetyDays),
      leadTime: String(leadTime),
      digestFrequency,
      digestSendHour: String(digestSendHour),
      digestDailyEnabled: String(digestDailyEnabled),
      digestWeeklyEnabled: String(digestWeeklyEnabled),
      emailRecipients,
      slackWebhook,
      slackEnabled: String(slackEnabled),
      locations: JSON.stringify(locations.map((loc) => ({ id: loc.id, selected: loc.selected }))),
    };
    saveFetcher.submit(formData, { method: "post" });
  };

  const handleReset = () => {
    setLocations(initial.locations);
    setHistoryWindow(initial.historyWindow);
    setShortageThreshold(initial.shortageThreshold);
    setOverstockThreshold(initial.overstockThreshold);
    setMildOverstockThreshold(initial.mildOverstockThreshold);
    setSafetyDays(initial.safetyDays);
    setLeadTime(initial.leadTime);
    setDigestFrequency(initial.digestFrequency);
    setDigestSendHour(initial.digestSendHour);
    setDigestDailyEnabled(initial.digestDailyEnabled);
    setDigestWeeklyEnabled(initial.digestWeeklyEnabled);
    setEmailRecipients(initial.emailRecipients);
    setSlackWebhook(initial.slackWebhook);
    setSlackEnabled(initial.slackEnabled);
    setSaveMessage(null);
  };

  return (
    <s-page className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.heading}>设置</h1>
            <p className={styles.subheading}>
              配置参与计算的仓库、阈值、交期和通知渠道。所有设置会在下一次夜间任务和 webhook 增量中生效。
            </p>
            <div className={styles.effectiveHint}>生效时间：夜间任务 + 实时 webhook（约 10 分钟内刷新）</div>
            <div className={styles.effectiveHint}>
              只读 Shopify 数据（read_products / read_inventory / read_orders / read_locations），不会修改库存或创建采购单。
            </div>
            {saveMessage && <div className={styles.saveMessage}>{saveMessage}</div>}
            {errors && Object.keys(errors).length > 0 && (
              <div className={styles.errorMessage}>请检查填写：{Object.values(errors).join(" · ")}</div>
            )}
          </div>
          <div className={styles.headerActions}>
            <s-button variant="tertiary" onClick={handleReset}>
              重置
            </s-button>
            <s-button variant="primary" onClick={handleSave} {...(isSaving ? { loading: true } : {})}>
              保存设置
            </s-button>
          </div>
        </div>

        <div className={styles.grid}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>参与计算的库存地点</div>
                <div className={styles.cardSubtitle}>仅计算勾选的仓库可售库存与销量</div>
              </div>
              <span className={`${styles.chip} ${styles.chipSuccess}`}>已勾选 {locations.filter((loc) => loc.selected).length} 个</span>
            </div>
            <ul className={styles.optionList}>
              {locations.map((location) => (
                <li key={location.id} className={styles.option}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={location.selected}
                      onChange={() => toggleLocation(location.id)}
                    />
                    <span>{location.name}</span>
                  </label>
                  <span className={styles.optionHint}>读取 Shopify Location</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>阈值与默认参数</div>
                <div className={styles.cardSubtitle}>用于补货计算与压货标记</div>
              </div>
              <span className={`${styles.chip} ${styles.chipSoft}`}>实时保存</span>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                历史销量窗口
                <select
                  className={styles.select}
                  value={historyWindow}
                  onChange={(event) => setHistoryWindow(event.target.value)}
                >
                  <option>30 天</option>
                  <option>60 天</option>
                  <option>90 天</option>
                </select>
              </label>
              <label className={styles.field}>
                缺货阈值（覆盖天数）
                <input
                  className={styles.input}
                  type="number"
                  value={shortageThreshold}
                  aria-invalid={Boolean(errors.shortageThreshold)}
                  onChange={(event) => setShortageThreshold(Number(event.target.value))}
                />
                {errors.shortageThreshold && (
                  <span className={styles.fieldError}>{errors.shortageThreshold}</span>
                )}
              </label>
              <label className={styles.field}>
                过量阈值（覆盖天数）
                <input
                  className={styles.input}
                  type="number"
                  value={overstockThreshold}
                  aria-invalid={Boolean(errors.overstockThreshold)}
                  onChange={(event) => setOverstockThreshold(Number(event.target.value))}
                />
                {errors.overstockThreshold && (
                  <span className={styles.fieldError}>{errors.overstockThreshold}</span>
                )}
              </label>
              <label className={styles.field}>
                轻微过量阈值（覆盖天数）
                <input
                  className={styles.input}
                  type="number"
                  value={mildOverstockThreshold}
                  aria-invalid={Boolean(errors.mildOverstockThreshold)}
                  onChange={(event) => setMildOverstockThreshold(Number(event.target.value))}
                />
                {errors.mildOverstockThreshold && (
                  <span className={styles.fieldError}>{errors.mildOverstockThreshold}</span>
                )}
              </label>
              <label className={styles.field}>
                安全库存天数
                <input
                  className={styles.input}
                  type="number"
                  value={safetyDays}
                  aria-invalid={Boolean(errors.safetyDays)}
                  onChange={(event) => setSafetyDays(Number(event.target.value))}
                />
                {errors.safetyDays && (
                  <span className={styles.fieldError}>{errors.safetyDays}</span>
                )}
              </label>
              <label className={styles.field}>
                默认供应商交期（天）
                <input
                  className={styles.input}
                  type="number"
                  value={leadTime}
                  aria-invalid={Boolean(errors.leadTime)}
                  onChange={(event) => setLeadTime(Number(event.target.value))}
                />
                {errors.leadTime && <span className={styles.fieldError}>{errors.leadTime}</span>}
              </label>
              <div className={styles.field}>
                计算说明
                <p className={styles.helpText}>
                  目标库存 = 日均销量 × (交期 + 安全库存)，推荐补货 = max(0, 目标库存 - 当前可售库存)。缺货阈值：覆盖天数 ≤
                  {shortageThreshold}；过量阈值：覆盖天数 ≥ {overstockThreshold}（轻微过量从 {mildOverstockThreshold} 天开始）。
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className={styles.grid}>
          <section className={styles.card} id="digest">
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>Digest 报告 & 通知</div>
                <div className={styles.cardSubtitle}>每日 / 每周摘要邮件或 Slack 通知</div>
              </div>
              <span className={`${styles.chip} ${styles.chipSuccess}`}>正常运行</span>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                频率
                <select
                  className={styles.select}
                  value={digestFrequency}
                  onChange={(event) => setDigestFrequency(event.target.value)}
                >
                  <option value="daily">每日</option>
                  <option value="weekly">每周一</option>
                  <option value="off">不发送</option>
                </select>
                <div className={styles.checkboxGroup}>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={digestDailyEnabled}
                      onChange={() => setDigestDailyEnabled((prev) => !prev)}
                    />
                    <span>开启每日 Digest</span>
                  </label>
                  <label className={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={digestWeeklyEnabled}
                      onChange={() => setDigestWeeklyEnabled((prev) => !prev)}
                    />
                    <span>开启每周 Digest</span>
                  </label>
                </div>
              </label>
              <label className={styles.field}>
                发送时间（整点）
                <input
                  className={styles.input}
                  type="number"
                  min={0}
                  max={23}
                  value={digestSendHour}
                  aria-invalid={Boolean(errors.digestSendHour)}
                  onChange={(event) => setDigestSendHour(Number(event.target.value))}
                />
                {errors.digestSendHour && (
                  <span className={styles.fieldError}>{errors.digestSendHour}</span>
                )}
                <span className={styles.helpText}>本地时区整点，例如 9 = 上午 9:00</span>
              </label>
              <label className={styles.field}>
                邮件收件人
                <input
                  className={styles.input}
                  type="text"
                  value={emailRecipients}
                  onChange={(event) => setEmailRecipients(event.target.value)}
                />
                <span className={styles.helpText}>逗号分隔多个邮箱</span>
              </label>
              <label className={styles.field}>
                Slack Webhook
                <input
                  className={styles.input}
                  type="text"
                  value={slackWebhook}
                  onChange={(event) => setSlackWebhook(event.target.value)}
                  disabled={!slackEnabled}
                />
                <label className={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={slackEnabled}
                    onChange={() => setSlackEnabled((current) => !current)}
                  />
                  <span>启用 Slack 推送</span>
                </label>
              </label>
              <div className={styles.field}>
                报告内容
                <p className={styles.helpText}>
                  缺货风险 Top 5 · 压货 Top 5 · 库存金额对比上周 · CTA：打开 Inventory Copilot 查看详情。
                </p>
                <p className={styles.helpText}>
                  发送失败会记录到 NotificationLog，并在 Dashboard 提醒。渠道：Email（必选），Slack Webhook（可选）。
                </p>
              </div>
            </div>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>数据健康</div>
                <div className={styles.cardSubtitle}>Webhook + 成本价导入</div>
              </div>
              <span className={`${styles.chip} ${styles.chipSoft}`}>只读 Shopify</span>
            </div>
            <div className={styles.healthBox}>
              <div className={styles.healthRow}>
                <div>
                  <div className={styles.healthTitle}>缺失成本</div>
                  <div className={styles.healthMeta}>当前 {initial.missingCostCount} 个 SKU 未填成本</div>
                </div>
                <s-button size="slim" variant="tertiary" href="/app/settings">
                  去补齐
                </s-button>
              </div>
              <div className={styles.healthRow}>
                <div>
                  <div className={styles.healthTitle}>成本价导入</div>
                  <div className={styles.healthMeta}>支持 CSV 导入或逐个编辑</div>
                </div>
                <s-button size="slim">导入 CSV</s-button>
              </div>
              <div className={styles.healthRow}>
                <div>
                  <div className={styles.healthTitle}>Webhook 状态</div>
                  <div className={styles.healthMeta}>{initial.webhookStatus}</div>
                </div>
                <span className={`${styles.chip} ${styles.chipSuccess}`}>已启用</span>
              </div>
              <div className={styles.healthRow}>
                <div>
                  <div className={styles.healthTitle}>最近一次数据更新</div>
                  <div className={styles.healthMeta}>
                    {initial.lastCalculated} · {initial.lastWebhook}
                  </div>
                </div>
                <s-button variant="tertiary" size="slim">
                  查看日志
                </s-button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
