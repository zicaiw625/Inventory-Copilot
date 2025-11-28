import { useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { json, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { DEFAULT_SHORTAGE_THRESHOLD_DAYS } from "../config/inventory";
import { authenticate } from "../shopify.server";
import { getDashboardData } from "../services/inventory.digest.server";
import { logSyncEvent } from "../services/inventory.sync.server";
import type {
  DashboardPayload,
  DashboardRow,
  TimeframeKey,
} from "../services/inventory.types";
import styles from "./app._index.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const data = await getDashboardData(admin, session.shop);
  return data;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    await getDashboardData(admin, session.shop);
    await logSyncEvent(session.shop, "inventory", "success", "Dashboard sync trigger");
    return json({ ok: true, message: "同步完成" });
  }

  if (intent === "digest") {
    // 在真实场景下这里触发后台任务发送 digest 邮件/Slack
    await logSyncEvent(session.shop, "digest", "success", "手动触发 digest");
    return json({ ok: true, message: "已触发 Digest 发送" });
  }

  return json({ ok: true });
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const [timeframe, setTimeframe] = useState<TimeframeKey>("30d");
  const [budget, setBudget] = useState<number>(data.budgetPlan.budget);
  const [locationFilter, setLocationFilter] = useState(
    data.locations.find((location) => location.selected)?.id ?? "all",
  );
  const [targetCoverage, setTargetCoverage] = useState<number>(data.targetCoverages[0]);
  const [safetyDays, setSafetyDays] = useState<number>(data.safetyDays);
  const snapshot = data.timeframes[timeframe];
  const syncFetcher = useFetcher<typeof action>();
  const digestFetcher = useFetcher<typeof action>();
  const liveBudgetPlan = useMemo(
    () => buildBudgetPlanFromRows(data.recommendationPool, budget, targetCoverage),
    [budget, data.recommendationPool, targetCoverage],
  );
  const hasRows =
    Object.values(data.timeframes ?? {}).find((tf) => tf.rows.length > 0) !== undefined;

  const coveragePct = Math.round((liveBudgetPlan.coverageShare ?? 0) * 100);
  const budgetGap = budget - liveBudgetPlan.usedAmount;

  return (
    <s-page className={styles.page}>
      <div className={styles.container}>
        <div className={styles.heroRow}>
          <div className={styles.heroCard}>
            <div className={styles.badgeRow}>
              <span className={`${styles.badge} ${styles.badgePrimary}`}>库存风险雷达</span>
              <span className={styles.badge}>Shopify 单店</span>
              <span className={styles.badge}>只读数据</span>
            </div>
            <div className={styles.heroTitle}>
              Inventory Copilot
              <span className={styles.heroSubtitle}>看住缺货、压货和现金流</span>
            </div>
            <p className={styles.heroText}>
              每天自动计算可售库存、日均销量和覆盖天数，生成补货清单 & 压货雷达。聚焦本周必做的动作，老板可直接抄单决策。
            </p>
            <div className={styles.heroActions}>
              <s-button variant="primary" href="/app/replenishment">
                按预算生成采购清单
              </s-button>
              <s-button
                variant="tertiary"
                onClick={() =>
                  syncFetcher.submit({ intent: "sync" }, { method: "post" })
                }
                {...(syncFetcher.state !== "idle" ? { loading: true } : {})}
              >
                立即同步 Shopify 数据
              </s-button>
              <span className={styles.heroHint}>
                单店 · 只读 Shopify 数据（不会改库存或创建采购单） · 数据更新于：{data.lastCalculated} · 90 天历史 + 30 天预测窗口
                {syncFetcher.state !== "idle" ? " · 同步中..." : ""}
                {syncFetcher.data?.message ? ` · ${syncFetcher.data.message}` : ""}
              </span>
            </div>
          </div>
          <div className={styles.heroSide}>
            <div className={styles.sideHeader}>
              <div>
                <div className={styles.sideTitle}>每日 / 每周 Digest</div>
                <div className={styles.sideSub}>风险摘要自动推送到邮箱或 Slack</div>
              </div>
              <span
                className={`${styles.chip} ${
                  data.digest.status === "ok" ? styles.chipSuccess : styles.chipWarning
                }`}
              >
                {data.digest.status === "ok" ? "正常" : "注意"}
              </span>
            </div>
            <dl className={styles.sideList}>
              <div>
                <dt>时间窗口</dt>
                <dd>{data.digest.window}</dd>
              </div>
              <div>
                <dt>推送节奏</dt>
                <dd>{data.digest.cadence}</dd>
              </div>
              <div>
                <dt>渠道</dt>
                <dd>{data.digest.channels}</dd>
              </div>
              <div>
                <dt>最近发送</dt>
                <dd>{data.digest.lastSent}</dd>
              </div>
            </dl>
            <div className={styles.sideActions}>
              <s-button
                size="slim"
                onClick={() =>
                  digestFetcher.submit({ intent: "digest" }, { method: "post" })
                }
                {...(digestFetcher.state !== "idle" ? { loading: true } : {})}
              >
                立即发送一版
              </s-button>
              <s-button variant="tertiary" size="slim" href="/app/settings#digest">
                配置收件人
              </s-button>
              <s-button variant="tertiary" size="slim" href="/app/digest/preview">
                预览 Digest
              </s-button>
            </div>
            <div className={styles.sideMeta}>
              <div>最近成功：{data.digest.lastSuccess}</div>
              <div className={styles.sideWarning}>
                最近失败：{data.digest.lastFailure || "无"}
                {data.digest.lastError ? ` · ${data.digest.lastError}` : ""}
              </div>
            </div>
            <div className={styles.sideFooter}>
              <span className={`${styles.chip} ${styles.chipInfo}`}>Webhook</span>
              <span className={styles.sideFootText}>orders/paid · inventory_levels/update 已开启</span>
            </div>
          </div>
        </div>

        {!hasRows && (
          <div className={styles.card}>
            <div className={styles.cardTitle}>还没有库存分析数据</div>
            <p className={styles.subheading}>
              首次同步 Shopify 数据后，会生成缺货和压货列表。建议先累积至少 7 天销量，并在 Settings 补齐成本价以便准确计算库存金额。点击下方按钮开始同步。
            </p>
            <s-button
              variant="primary"
              onClick={() => syncFetcher.submit({ intent: "sync" }, { method: "post" })}
              {...(syncFetcher.state !== "idle" ? { loading: true } : {})}
            >
              立即同步数据
            </s-button>
            {syncFetcher.data?.message && (
              <div className={styles.heroHint}>{syncFetcher.data.message}</div>
            )}
          </div>
        )}

        <div className={styles.toolbar}>
          <div className={styles.timeframe}>
            {["30d", "60d", "90d"].map((key) => (
              <button
                key={key}
                className={`${styles.timeframeButton} ${timeframe === key ? styles.timeframeActive : ""}`}
                onClick={() => setTimeframe(key as TimeframeKey)}
                type="button"
              >
                {key === "30d" && "近 30 天"}
                {key === "60d" && "近 60 天"}
                {key === "90d" && "近 90 天"}
              </button>
            ))}
          </div>
          <div className={styles.filterRow}>
            <label className={styles.filterLabel}>
              Location
              <select
                className={styles.select}
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
              >
                <option value="all">All included locations</option>
                {data.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.selected ? " (纳入计算)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterLabel}>
              补货目标覆盖天数
              <select
                className={styles.select}
                value={targetCoverage}
                onChange={(event) => setTargetCoverage(Number(event.target.value))}
              >
                {data.targetCoverages.map((days) => (
                  <option key={days} value={days}>
                    {days} 天
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filterLabel}>
              安全库存天数
              <select
                className={styles.select}
                value={safetyDays}
                onChange={(event) => setSafetyDays(Number(event.target.value))}
              >
                {[data.safetyDays, data.safetyDays + 3, data.safetyDays + 7].map((days) => (
                  <option key={days} value={days}>
                    {days} 天
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className={styles.kpiGrid}>
          {snapshot.kpis.map((kpi) => (
            <div key={kpi.label} className={styles.kpiCard}>
              <div className={styles.kpiLabelRow}>
                <div className={styles.kpiLabel}>{kpi.label}</div>
                <span className={styles.kpiInfo} title={kpi.helper} aria-label={kpi.helper}>
                  i
                </span>
              </div>
              <div className={styles.kpiValue}>{kpi.value}</div>
              <div className={`${styles.kpiHelper} ${kpi.tone ? styles[`tone${kpi.tone}`] : ""}`}>{kpi.helper}</div>
            </div>
          ))}
        </div>

        <div className={styles.twoColumn}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>缺货风险 Top 5 SKU</div>
                <div className={styles.cardSubtitle}>按日均销量 × 库存覆盖天数排序，过滤覆盖 ≤ 10 天 或建议补货量 ≥ 5 件</div>
              </div>
              <div className={styles.cardActions}>
                <s-button size="slim">去补货清单</s-button>
                <span className={`${styles.chip} ${styles.chipWarning}`}>高优先级</span>
              </div>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SKU / 产品</th>
                  <th>可售库存</th>
                  <th>日均销量</th>
                  <th>预计可售天数</th>
                  <th>建议补货</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.shortage.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      <a className={styles.skuLink} href={`/app/variant/${encodeURIComponent(row.sku)}`}>
                        <div className={styles.skuCell}>
                          <div className={styles.skuLabel}>{row.sku}</div>
                          <div className={styles.skuName}>{row.name}</div>
                          <div className={styles.skuMeta}>{row.variant}</div>
                        </div>
                      </a>
                    </td>
                    <td>{row.available}</td>
                    <td>{row.avgDailySales.toFixed(1)}</td>
                    <td>
                      <span className={`${styles.badge} ${row.daysOfStock <= 7 ? styles.badgeDanger : styles.badgeWarning}`}>
                        {row.daysOfStock} 天
                      </span>
                    </td>
                    <td className={styles.emphasis}>{row.recommendedQty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>压货 / 滞销 Top 5 SKU</div>
                <div className={styles.cardSubtitle}>按覆盖天数与库存占用金额排序，突出严重滞销 & 过量库存</div>
              </div>
              <div className={styles.cardActions}>
                <s-button size="slim" variant="tertiary">
                  去压货雷达
                </s-button>
              </div>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SKU / 产品</th>
                  <th>当前库存</th>
                  <th>日均销量</th>
                  <th>覆盖天数</th>
                  <th>库存金额</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.overstock.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      <a className={styles.skuLink} href={`/app/variant/${encodeURIComponent(row.sku)}`}>
                        <div className={styles.skuCell}>
                          <div className={styles.skuLabel}>{row.sku}</div>
                          <div className={styles.skuName}>{row.name}</div>
                          <div className={styles.skuMeta}>{row.variant}</div>
                        </div>
                      </a>
                    </td>
                    <td>{row.available}</td>
                    <td>{row.avgDailySales.toFixed(1)}</td>
                    <td>
                      <span className={`${styles.badge} ${row.coverageDays >= 120 ? styles.badgeDanger : styles.badgeWarning}`}>
                        {row.coverageDays} 天
                      </span>
                    </td>
                    <td className={styles.emphasis}>{formatCurrency(row.stockValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.threeColumn}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>预算版采购清单</div>
              <span className={`${styles.chip} ${styles.chipInfo}`}>
                目标覆盖 {liveBudgetPlan.coverageDays} 天
              </span>
            </div>
            <p className={styles.cardSubtitle}>
              输入预算后，按缺货风险 × 重要度自动排序；使用补货页可进一步微调。
            </p>
            <div className={styles.budgetRow}>
              <div>
                <div className={styles.budgetLabel}>预算</div>
                <div className={styles.budgetValue}>
                  $
                  <input
                    className={styles.budgetInputInline}
                    type="number"
                    value={budget}
                    onChange={(event) => setBudget(Number(event.target.value))}
                    aria-label="本次预算"
                  />
                </div>
              </div>
              <div className={styles.divider} />
              <div>
                <div className={styles.budgetLabel}>已覆盖缺货金额</div>
                <div className={styles.budgetValue}>约 {coveragePct}%</div>
              </div>
              <div className={styles.divider} />
              <div>
                <div className={styles.budgetLabel}>预算差额</div>
                <div className={styles.budgetValue}>
                  {budgetGap >= 0 ? "剩余" : "超出"} {formatCurrency(Math.abs(budgetGap))}
                </div>
              </div>
            </div>
            <div className={styles.budgetMeta}>
              <div>最新计算：{data.lastCalculated}</div>
              <s-button
                size="slim"
                variant="tertiary"
                onClick={() => syncFetcher.submit({ intent: "sync" }, { method: "post" })}
                {...(syncFetcher.state !== "idle" ? { loading: true } : {})}
              >
                立即同步 Shopify
              </s-button>
            </div>
            <ul className={styles.planList}>
              {liveBudgetPlan.picks.map((pick) => (
                <li key={pick.sku}>
                  <div>
                    <div className={styles.planName}>{pick.name}</div>
                    <div className={styles.planMeta}>
                      {pick.sku}
                      {pick.supplier ? ` · ${pick.supplier}` : ""}
                    </div>
                  </div>
                  <div className={styles.planQty}>{pick.qty} 件</div>
                  <div className={styles.planAmount}>{pick.amount}</div>
                  <span className={`${styles.chip} ${styles.chipWarning}`}>{pick.risk}</span>
                </li>
              ))}
            </ul>
            <div className={styles.planFooter}>
              <div>
                被排除的 SKU：{liveBudgetPlan.excludedCount} 个（合计金额 {liveBudgetPlan.excludedValue}，可手动加入）
              </div>
              <s-button size="slim" variant="tertiary">
                调整预算与优先级
              </s-button>
              <s-button size="slim" href="/app/replenishment">
                去补货清单微调
              </s-button>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>作业与数据新鲜度</div>
              <span className={`${styles.chip} ${styles.chipSuccess}`}>正常</span>
            </div>
            <ul className={styles.statusList}>
              <li>
                <div>
                  <div className={styles.statusTitle}>夜间任务</div>
                  <div className={styles.statusMeta}>拉取最近 90 天订单 & 库存 → 重算建议</div>
                </div>
                <span className={styles.statusValue}>07:45 完成</span>
              </li>
              <li>
                <div>
                  <div className={styles.statusTitle}>Webhook 增量</div>
                  <div className={styles.statusMeta}>orders/paid · inventory_levels/update</div>
                </div>
                <span className={styles.statusValue}>近 5 分钟有更新</span>
              </li>
              <li>
                <div>
                  <div className={styles.statusTitle}>成本与交期配置</div>
                  <div className={styles.statusMeta}>92% SKU 已填写成本 · 默认交期 14 天</div>
                </div>
                <span className={`${styles.chip} ${styles.chipInfo}`}>较健康</span>
              </li>
            </ul>
            <div className={styles.alertBox}>
              <div>
                <div className={styles.alertTitle}>缺失成本价的 SKU</div>
                <div className={styles.alertMeta}>
                  {data.missingCostCount > 0
                    ? `${data.missingCostCount} 个 SKU 未填成本，会影响库存金额与优先级排序。`
                    : "所有参与计算的 SKU 已填写成本，金额与优先级计算更准确。"}
                </div>
              </div>
              <s-button size="slim" href="/app/settings">
                {data.missingCostCount > 0 ? "去完善" : "查看配置"}
              </s-button>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>提醒与下一步</div>
            </div>
            <ul className={styles.reminderList}>
              {data.reminders.map((item) => (
                <li key={item.title}>
                  <span
                    className={`${styles.chip} ${
                      item.tone === "warning" ? styles.chipWarning : styles.chipInfo
                    }`}
                  >
                    {item.tone === "warning" ? "待处理" : "通知"}
                  </span>
                  <div>
                    <div className={styles.reminderTitle}>{item.title}</div>
                    <div className={styles.reminderMeta}>{item.action}</div>
                  </div>
                </li>
              ))}
            </ul>
            <div className={styles.checklist}>
              <div className={styles.checkItem}>
                <input type="checkbox" defaultChecked />
                <span>每日 Digest 已发送</span>
              </div>
              <div className={styles.checkItem}>
                <input type="checkbox" />
                <span>本周采购预算已确认</span>
              </div>
              <div className={styles.checkItem}>
                <input type="checkbox" />
                <span>压货 SKU 清货方案已排期</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function formatCurrency(value?: number): string {
  return (value ?? 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function buildBudgetPlanFromRows(
  rows: DashboardRow[],
  budget: number,
  targetCoverage: number,
): DashboardPayload["budgetPlan"] {
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
  const picks: DashboardPayload["budgetPlan"]["picks"] = [];

  candidates.forEach(({ row, spend }) => {
    if (spend <= 0) return;
    if (used + spend <= budget || picks.length === 0) {
      used += spend;
      picks.push({
        sku: row.sku,
        name: row.name,
        qty: row.recommendedQty,
        amount: formatCurrency(spend),
        risk: row.daysOfStock <= DEFAULT_SHORTAGE_THRESHOLD_DAYS ? "爆款防断货" : "库存紧张",
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
    coverageDays: targetCoverage,
    usedAmount: used,
    excludedAmount,
    coverageShare,
    picks,
    excludedValue: formatCurrency(Math.abs(excludedAmount)),
    excludedCount,
  };
}
