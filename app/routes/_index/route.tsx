import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  const featureHighlights = [
    {
      title: "Top SKU 补货建议",
      detail: "基于可售库存 + 30 天日均销量，给出建议补货量与采购金额",
    },
    {
      title: "压货 / 滞销雷达",
      detail: "覆盖天数 ≥ 60 天或 30 天销量为 0 的 SKU 会高亮提醒，按库存占用排序",
    },
    {
      title: "每日 / 每周 Digest",
      detail: "自动把缺货风险 / 压货 Top 列表推到邮箱或 Slack，老板不打开后台也能感知风险",
    },
  ];

  const moduleCards = [
    {
      title: "补货清单",
      tag: "Replenishment",
      bullets: [
        "字段：SKU、Location、可售库存、日均销量、预计可售天数、建议补货、目标覆盖天数、成本、采购金额",
        "规则：target_stock = avg_daily_sales × (lead_time_days + safety_days)，建议补货 = max(0, ceil(target_stock - current_available))",
        "过滤：覆盖 ≤ 10 天或建议补货 ≥ 5 件；按预算生成优先级清单，可导出 CSV / 复制发供应商",
      ],
    },
    {
      title: "压货雷达",
      tag: "Overstock",
      bullets: [
        "字段：库存数量、30 天销量、日均销量、覆盖天数、库存金额、最近补货、标签（严重 / 轻微）",
        "规则：销量为 0 且有库存 → 严重滞销；coverage_days > 90 → 严重过量；60–90 → 轻微过量",
        "动作：建议折扣区间、与爆款捆绑，导出清货候选列表（只读，不自动创建折扣）",
      ],
    },
    {
      title: "Digest 报告",
      tag: "Digest",
      bullets: [
        "内容：库存金额对比上周、缺货风险 Top 5、压货 Top 5、CTA 按钮",
        "配置：频率每日 / 每周，渠道 Email 必选，Slack 可选（Webhook）",
        "目的：即使不登录，也能在周会前/早上看到风险摘要",
      ],
    },
  ];

  const guardrails = [
    "只服务 Shopify 单店（非多店汇总），只读数据，不会改库存或创建采购单",
    "只针对有库存的实体 SKU，不碰 POD / 纯数字商品",
    "V1 只看可售库存 + 历史销量，不做复杂节假日预测；多渠道库存后续版本再支持",
  ];

  const installSteps = [
    "Shopify App Store 安装并 OAuth 授权：read_products, read_inventory, read_orders, read_locations",
    "选择参与计算的 Location，导入 / 填写 SKU 成本价，确认预测窗口（默认 30 天）与历史窗口（90 天）",
    "等待首轮计算完成后，Dashboard 会展示补货建议、压货雷达和 Digest 预览",
  ];

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.heroSection}>
          <div className={styles.heroCopy}>
            <div className={styles.pills}>
              <span className={`${styles.pill} ${styles.pillPrimary}`}>Inventory Copilot V1</span>
              <span className={styles.pill}>库存风险雷达</span>
              <span className={styles.pill}>补货清单</span>
              <span className={styles.pill}>压货预警</span>
            </div>
            <h1 className={styles.heading}>
              给中小 Shopify 店的「库存风险雷达 + 补货清单」
            </h1>
            <p className={styles.lead}>
              盯紧缺货、压货和现金流：基于可售库存与历史销量，计算补货建议、滞销雷达，并把每日 / 每周 Digest 送到邮箱或 Slack。
            </p>
            {showForm && (
              <Form className={styles.form} method="post" action="/auth/login">
                <label className={styles.label}>
                  <span className={styles.labelText}>输入店铺域名</span>
                  <div className={styles.inputRow}>
                    <input
                      className={styles.input}
                      type="text"
                      name="shop"
                      placeholder="your-store.myshopify.com"
                      required
                    />
                    <button className={styles.cta} type="submit">
                      开始安装
                    </button>
                  </div>
                  <span className={styles.hint}>
                    只读权限：read_products · read_inventory · read_orders · read_locations
                  </span>
                </label>
              </Form>
            )}
            {!showForm && (
              <div className={styles.offlineCta}>
                从 Shopify Admin 进入已安装的 Inventory Copilot，或在 App Store 搜索安装。
              </div>
            )}
            <div className={styles.metaRow}>
              <span>90 天历史 + 30 天预测窗口</span>
              <span>只读数据，不改库存</span>
              <span>SKU 成本可导入 CSV</span>
            </div>
            <div className={styles.featureRow}>
              {featureHighlights.map((feature) => (
                <div key={feature.title} className={styles.featureCard}>
                  <div className={styles.featureTitle}>{feature.title}</div>
                  <div className={styles.featureDetail}>{feature.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.heroPanel}>
            <div className={styles.panelHeader}>
              <div>
                <div className={styles.panelTitle}>本周要看的 3 件事</div>
                <div className={styles.panelMeta}>来自夜间任务 + webhook 增量</div>
              </div>
              <span className={styles.panelBadge}>只读 Shopify</span>
            </div>
            <ul className={styles.panelList}>
              <li>
                <div className={styles.panelLabel}>缺货风险 Top 5</div>
                <div className={styles.panelDesc}>覆盖 ≤ 10 天 · 推荐补货量直接抄</div>
              </li>
              <li>
                <div className={styles.panelLabel}>压货 / 滞销 Top 5</div>
                <div className={styles.panelDesc}>覆盖 ≥ 90 天或 30 天销量为 0 · 按占用金额排序</div>
              </li>
              <li>
                <div className={styles.panelLabel}>Digest 摘要</div>
                <div className={styles.panelDesc}>每日 / 每周推送到邮箱或 Slack · 一键打开 App</div>
              </li>
            </ul>
            <div className={styles.panelFooter}>
              <div>夜间任务：拉 90 天订单 & 库存 → 重算补货 / 压货</div>
              <div>Webhooks：orders/paid · inventory_levels/update · products/update</div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>核心模块（V1）</div>
              <div className={styles.sectionSubtitle}>
                聚焦补货、压货与 Digest，帮助 100–5000 单/月的 Shopify 店把 Excel 清单搬进应用
              </div>
            </div>
            <div className={styles.sectionBadge}>内嵌 Polaris · App Bridge</div>
          </div>
          <div className={styles.moduleGrid}>
            {moduleCards.map((card) => (
              <div key={card.title} className={styles.card}>
                <div className={styles.cardHeader}>
                  <span className={styles.cardTag}>{card.tag}</span>
                  <div className={styles.cardTitle}>{card.title}</div>
                </div>
                <ul className={styles.bulletList}>
                  {card.bullets.map((line) => (
                    <li key={line}>
                      <span className={styles.dot} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>产品边界 & 安装流程</div>
              <div className={styles.sectionSubtitle}>V1 只读 Shopify，聚焦决策参考；未来再接入 WMS / 自动采购</div>
            </div>
          </div>
          <div className={styles.bottomGrid}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>V1 边界</div>
              <ul className={styles.list}>
                {guardrails.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>安装与首轮同步</div>
              <ol className={styles.orderedList}>
                {installSteps.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ol>
              <div className={styles.tip}>
                首轮跑完后，Dashboard 会展示补货建议、压货清单、Digest 预览；夜间任务 + webhook 保持数据新鲜。
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>数据更新节奏</div>
              <ul className={styles.list}>
                <li>夜间批量：最近 90 天销量与库存快照，重算 Replenishment & Overstock</li>
                <li>实时增量：orders/paid、inventory_levels/update、products/update</li>
                <li>通知：Digest 任务记录到 NotificationLog，失败会在 Dashboard 警告</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
