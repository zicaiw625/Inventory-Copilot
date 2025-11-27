import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getVariantDetail } from "../services/inventory.digest.server";
import type { VariantDetail } from "../services/inventory.types";
import styles from "./app.variant.$id.module.css";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const variantId = params.id ? decodeURIComponent(params.id) : "";
  const detail = await getVariantDetail(admin, session.shop, variantId);
  return detail;
};

export default function VariantDetailPage() {
  const detail = useLoaderData<typeof loader>();

  return (
    <s-page className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.breadcrumb}>
            <s-link href="/app">Dashboard</s-link>
            <span> / </span>
            <s-link href="/app/replenishment">补货建议</s-link>
            <span> / </span>
            <span>{detail.sku}</span>
          </div>
          <div className={styles.titleRow}>
            <div>
              <div className={styles.sku}>{detail.sku}</div>
              <h1 className={styles.heading}>{detail.name}</h1>
              <div className={styles.variant}>{detail.variant}</div>
              <div className={styles.subtext}>只读 Shopify 数据，不会改库存或创建采购单</div>
            </div>
            <s-button variant="tertiary" href="/app/replenishment">
              返回补货清单
            </s-button>
          </div>
        </header>

        <section className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>当前可售库存</div>
            <div className={styles.kpiValue}>{detail.available}</div>
            <div className={styles.kpiMeta}>库存覆盖 {detail.daysOfStock} 天</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>单位成本</div>
            <div className={styles.kpiValue}>
              {detail.unitCost ? `$${detail.unitCost.toFixed(2)}` : "未填写"}
            </div>
            <div className={styles.kpiMeta}>
              {detail.unitCost ? `毛利率 ${detail.grossMargin ?? 0}%` : "补齐成本后可算库存金额"}
            </div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>日均销量</div>
            <div className={styles.kpiValue}>{detail.avgDailySales["30d"].toFixed(1)}</div>
            <div className={styles.kpiMeta}>30 / 60 / 90 天对比</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>历史缺货天数</div>
            <div className={styles.kpiValue}>{detail.historicalStockouts}</div>
            <div className={styles.kpiMeta}>最近 90 天</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>覆盖天数 (60 / 90)</div>
            <div className={styles.kpiValue}>
              {detail.coverage60d} / {detail.coverage90d} 天
            </div>
            <div className={styles.kpiMeta}>近期消耗速度</div>
          </div>
        </section>

        <section className={styles.grid}>
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>销量趋势（最近 14 天）</div>
              <span className={styles.chip}>按发货量</span>
            </div>
            {detail.salesHistory.length === 0 ? (
              <div className={styles.emptyChart}>暂无销量数据</div>
            ) : (
              <div className={styles.chart}>
                {detail.salesHistory.map((point) => (
                  <div key={point.date} className={styles.barWrapper}>
                    <div
                      className={styles.bar}
                      style={{ height: `${Math.max(8, point.quantity * 4)}px` }}
                      aria-label={`${point.date}: ${point.quantity}`}
                    />
                    <span className={styles.barLabel}>{point.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitle}>库存快照（最近 14 天）</div>
              <span className={`${styles.chip} ${styles.chipInfo}`}>只读</span>
            </div>
            {detail.inventoryHistory.length === 0 ? (
              <div className={styles.emptyChart}>暂无库存快照</div>
            ) : (
              <div className={styles.chart}>
                {detail.inventoryHistory.map((point) => (
                  <div key={point.date} className={styles.barWrapper}>
                    <div
                      className={`${styles.bar} ${styles.barSecondary}`}
                      style={{ height: `${Math.max(8, point.quantity * 3)}px` }}
                      aria-label={`${point.date}: ${point.quantity}`}
                    />
                    <span className={styles.barLabel}>{point.quantity}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <div className={styles.cardTitle}>风险与建议</div>
                <div className={styles.cardSubtitle}>
                  基于日均销量与当前库存覆盖，提供手动决策参考
                </div>
              </div>
              <span className={`${styles.chip} ${styles.chipWarning}`}>
                days_of_stock: {detail.daysOfStock} 天
              </span>
            </div>
            <ul className={styles.recoList}>
              <li>
                <span className={styles.dot} />
                过去 30 天日均销量 {detail.avgDailySales["30d"].toFixed(1)}，预计可售 {detail.daysOfStock} 天，建议提前锁货。
              </li>
              <li>
                <span className={styles.dot} />
                60 / 90 天覆盖 {detail.coverage60d} / {detail.coverage90d} 天，如持续下降可降补货量。
              </li>
              <li>
                <span className={styles.dot} />
                最近补货：{detail.lastReplenished}；若成本未填，请在 Settings 补齐以便精准算库存金额。
              </li>
            </ul>
          </section>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
