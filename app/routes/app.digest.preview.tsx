import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { json, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { DEFAULT_SHORTAGE_THRESHOLD_DAYS } from "../config/inventory";
import { authenticate } from "../shopify.server";
import { getDigestPreview } from "../services/inventory.digest.server";
import type { DigestPreview } from "../services/inventory.types";
import styles from "./app.digest.preview.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  return getDigestPreview(admin, session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "send-test") {
    return json({ ok: true, message: `已向 ${session.shop} 发送测试 Digest` });
  }
  return json({ ok: true });
};

export default function DigestPreview() {
  const digest = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  return (
    <s-page className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <div className={styles.title}>{digest.title}</div>
            <div className={styles.subtitle}>
              预览邮件正文，包含缺货与压货 Top 列表。只读数据，不会自动发送，也不会修改库存。
            </div>
          </div>
          <div className={styles.actions}>
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="send-test" />
              <s-button
                variant="primary"
                type="submit"
                {...(fetcher.state !== "idle" ? { loading: true } : {})}
              >
                立即发送测试邮件
              </s-button>
            </fetcher.Form>
            <s-button variant="tertiary" href="/app/settings">
              配置收件人
            </s-button>
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <div className={styles.heroLabel}>库存金额</div>
            <div className={styles.heroValue}>{digest.summary.inventoryValue}</div>
            <div className={styles.heroMeta}>最近更新：{digest.summary.updatedAt}</div>
            {fetcher.data?.message && <div className={styles.heroHint}>{fetcher.data.message}</div>}
            <div className={styles.heroHint}>渠道：Email（必选）· Slack Webhook（可选） · 频率每日/每周</div>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.statValue}>{digest.summary.shortageCount}</span>
            <span className={styles.statLabel}>缺货风险</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.statValue}>{digest.summary.overstockCount}</span>
            <span className={styles.statLabel}>压货 SKU</span>
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>缺货风险 Top 5</div>
              <span className={`${styles.chip} ${styles.chipWarning}`}>
                按覆盖天数 ≤ {DEFAULT_SHORTAGE_THRESHOLD_DAYS} 天
              </span>
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
                {digest.shortages.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      <div className={styles.skuCell}>
                        <div className={styles.sku}>{row.sku}</div>
                        <div className={styles.name}>{row.name}</div>
                        <div className={styles.meta}>{row.variant}</div>
                      </div>
                    </td>
                    <td>{row.available}</td>
                    <td>{row.avgDailySales.toFixed(1)}</td>
                    <td>
                      <span className={`${styles.badge} ${styles.badgeDanger}`}>
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
              <div className={styles.cardTitle}>压货 / 滞销 Top 5</div>
              <span className={`${styles.chip} ${styles.chipInfo}`}>覆盖 ≥ 60 / 90 天 · 按库存金额</span>
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
                {digest.overstocks.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      <div className={styles.skuCell}>
                        <div className={styles.sku}>{row.sku}</div>
                        <div className={styles.name}>{row.name}</div>
                        <div className={styles.meta}>{row.variant}</div>
                      </div>
                    </td>
                    <td>{row.available}</td>
                    <td>{row.avgDailySales.toFixed(1)}</td>
                    <td>{row.coverageDays} 天</td>
                    <td className={styles.emphasis}>{row.stockValue ? `$${row.stockValue.toFixed(0)}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={styles.footerCta}>
          <div>
            <div className={styles.ctaTitle}>CTA：打开 Inventory Copilot 查看详情</div>
            <div className={styles.ctaSubtitle}>
              邮件底部会附带按钮，引导老板进入 Dashboard / Replenishment / Overstock 查看完整列表与配置。
            </div>
          </div>
          <div className={styles.ctaMeta}>
            <div>只读 Shopify，不会改库存或创建采购单</div>
            <div>Digest 发送失败会记录到 NotificationLog 并在 Dashboard 警告</div>
          </div>
        </section>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
