import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { json, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

interface KpiCard {
  title: string;
  value: string;
  helper?: string;
  tone?: "positive" | "warning" | "subdued";
}

interface ReplenishmentRow {
  sku: string;
  name: string;
  location: string;
  available: number;
  dailySales: number;
  daysOfStock: number;
  recommendedQty: number;
  unitCost: number;
  supplier: string;
}

interface OverstockRow {
  sku: string;
  name: string;
  available: number;
  avgDailySales: number;
  coverageDays: number;
  stockValue: number;
  severity: "severe" | "mild" | "none";
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const kpis: KpiCard[] = [
    { title: "参与计算的 SKU", value: "428", helper: "本周新增 4 个" },
    { title: "库存总金额", value: "$186,420", helper: "含在途 12,000" },
    { title: "预计可售天数（中位数）", value: "23 天", helper: "以最近 30 天销量" },
    {
      title: "本周预计缺货 / 压货",
      value: "12 / 7",
      helper: "按阈值自动识别",
      tone: "warning",
    },
  ];

  const replenishmentTop: ReplenishmentRow[] = [
    {
      sku: "TSHIRT-BLK-M",
      name: "经典款 T 恤 / 黑 / M",
      location: "主要仓库",
      available: 18,
      dailySales: 6.4,
      daysOfStock: 3,
      recommendedQty: 160,
      unitCost: 6.8,
      supplier: "Ace Garment",
    },
    {
      sku: "SCRUB-SET-PEACH",
      name: "香氛磨砂膏礼盒",
      location: "海外仓",
      available: 42,
      dailySales: 2.1,
      daysOfStock: 20,
      recommendedQty: 120,
      unitCost: 9.5,
      supplier: "Glow Labs",
    },
    {
      sku: "USB-C-HUB-8P",
      name: "8 合 1 USB-C 扩展坞",
      location: "主要仓库",
      available: 30,
      dailySales: 4.2,
      daysOfStock: 7,
      recommendedQty: 95,
      unitCost: 11.2,
      supplier: "Nova Tech",
    },
    {
      sku: "SOFA-THROW-GRY",
      name: "灰色云绒盖毯",
      location: "主要仓库",
      available: 26,
      dailySales: 1.1,
      daysOfStock: 24,
      recommendedQty: 35,
      unitCost: 18.5,
      supplier: "North Home",
    },
    {
      sku: "SUNSCREEN-SPF50",
      name: "SPF50 防晒乳 100ml",
      location: "海外仓",
      available: 12,
      dailySales: 2.9,
      daysOfStock: 4,
      recommendedQty: 95,
      unitCost: 7.4,
      supplier: "Glow Labs",
    },
  ];

  const overstockTop: OverstockRow[] = [
    {
      sku: "YOGA-MAT-PINK",
      name: "加厚瑜伽垫 / 粉色",
      available: 420,
      avgDailySales: 3.8,
      coverageDays: 110,
      stockValue: 5880,
      severity: "severe",
    },
    {
      sku: "AROMA-DIFF-SET",
      name: "无火香薰套装",
      available: 260,
      avgDailySales: 4.5,
      coverageDays: 58,
      stockValue: 4420,
      severity: "mild",
    },
    {
      sku: "MOUSE-PAD-XXL",
      name: "电竞加长鼠标垫",
      available: 180,
      avgDailySales: 1.2,
      coverageDays: 150,
      stockValue: 2160,
      severity: "severe",
    },
    {
      sku: "TOTE-BAG-LINEN",
      name: "亚麻托特包",
      available: 95,
      avgDailySales: 0.9,
      coverageDays: 105,
      stockValue: 1330,
      severity: "severe",
    },
    {
      sku: "COFFEE-DRIP-SET",
      name: "手冲咖啡入门套装",
      available: 60,
      avgDailySales: 0.7,
      coverageDays: 86,
      stockValue: 3180,
      severity: "mild",
    },
  ];

  const reminders = {
    missingCostSkus: 22,
    lastSynced: "今天 06:30 已完成增量同步",
    digestSchedule: "每周一 09:00 邮件 + Slack 推送",
  };

  return json({ kpis, replenishmentTop, overstockTop, reminders });
};

const severityCopy: Record<OverstockRow["severity"], string> = {
  severe: "严重滞销 / 压货",
  mild: "轻微过量",
  none: "正常",
};

const severityTone: Record<OverstockRow["severity"], string> = {
  severe: "#B42318",
  mild: "#B54708",
  none: "#1F6E43",
};

export default function Index() {
  const { kpis, replenishmentTop, overstockTop, reminders } =
    useLoaderData<typeof loader>();

  const styles = `
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .panel-grid {
      display: grid;
      grid-template-columns: 2fr 2fr 1.1fr;
      gap: 12px;
    }
    .panel-grid__wide {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 12px;
    }
    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 14px;
      box-shadow: 0px 1px 2px rgba(16, 24, 40, 0.05);
    }
    .card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .card__title {
      font-weight: 600;
      font-size: 14px;
      color: #111827;
    }
    .kpi-value {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
    }
    .kpi-helper {
      color: #6b7280;
      margin-top: 4px;
      font-size: 13px;
    }
    .list-table {
      width: 100%;
      border-collapse: collapse;
    }
    .list-table th {
      text-align: left;
      font-size: 12px;
      color: #6b7280;
      padding: 6px 4px;
      border-bottom: 1px solid #e5e7eb;
    }
    .list-table td {
      padding: 8px 4px;
      font-size: 13px;
      color: #111827;
      border-bottom: 1px solid #f3f4f6;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: #f3f4f6;
      color: #1f2937;
    }
    .highlight {
      color: #0f766e;
      font-weight: 600;
    }
    .reminder-list {
      display: grid;
      gap: 8px;
    }
    .reminder-item {
      display: grid;
      gap: 4px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 8px;
      background: #ecfeff;
      color: #0ea5e9;
      font-weight: 600;
      font-size: 12px;
    }
    @media (max-width: 1100px) {
      .panel-grid {
        grid-template-columns: 1fr;
      }
      .panel-grid__wide {
        grid-template-columns: 1fr;
      }
    }
  `;

  return (
    <s-page heading="Inventory Copilot" subtitle="库存风险雷达 + 补货清单概览">
      <style>{styles}</style>
      <s-section>
        <div className="kpi-grid">
          {kpis.map((kpi) => (
            <div className="card" key={kpi.title}>
              <div className="card__header">
                <span className="card__title">{kpi.title}</span>
                {kpi.tone === "warning" && <span className="tag">提醒</span>}
              </div>
              <div className="kpi-value">{kpi.value}</div>
              {kpi.helper ? <div className="kpi-helper">{kpi.helper}</div> : null}
            </div>
          ))}
        </div>
      </s-section>

      <s-section heading="本周库存风险雷达">
        <div className="panel-grid">
          <div className="card">
            <div className="card__header">
              <span className="card__title">缺货风险 Top 5 SKU</span>
              <span className="badge">基于最近 30 天销量</span>
            </div>
            <table className="list-table">
              <thead>
                <tr>
                  <th>SKU / 名称</th>
                  <th>当前库存</th>
                  <th>日均销量</th>
                  <th>预计可售天数</th>
                  <th>建议补货</th>
                </tr>
              </thead>
              <tbody>
                {replenishmentTop.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>{row.sku}</div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>{row.location}</div>
                    </td>
                    <td>{row.available}</td>
                    <td>{row.dailySales.toFixed(1)}</td>
                    <td>
                      <span className="highlight">{row.daysOfStock} 天</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700 }}>{row.recommendedQty} 件</div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        采购金额 ~ ${(row.recommendedQty * row.unitCost).toFixed(0)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card__header">
              <span className="card__title">压货 / 滞销 Top 5 SKU</span>
              <span className="badge">按覆盖天数 + 占用金额排序</span>
            </div>
            <table className="list-table">
              <thead>
                <tr>
                  <th>SKU / 名称</th>
                  <th>当前库存</th>
                  <th>覆盖天数</th>
                  <th>库存金额</th>
                  <th>标签</th>
                </tr>
              </thead>
              <tbody>
                {overstockTop.map((row) => (
                  <tr key={row.sku}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{row.name}</div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>{row.sku}</div>
                    </td>
                    <td>{row.available}</td>
                    <td>{row.coverageDays} 天</td>
                    <td>${row.stockValue.toLocaleString()}</td>
                    <td>
                      <span
                        className="tag"
                        style={{ background: `${severityTone[row.severity]}14`, color: severityTone[row.severity] }}
                      >
                        {severityCopy[row.severity]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="card__header">
              <span className="card__title">提醒</span>
              <span className="badge">行动项</span>
            </div>
            <div className="reminder-list">
              <div className="reminder-item">
                <div style={{ fontWeight: 600 }}>成本价未补全 SKU</div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>
                  还有 <span className="highlight">{reminders.missingCostSkus} 个</span> SKU 没有填写成本价，无法计算库存金额。
                </div>
              </div>
              <div className="reminder-item">
                <div style={{ fontWeight: 600 }}>数据更新</div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>{reminders.lastSynced}</div>
              </div>
              <div className="reminder-item">
                <div style={{ fontWeight: 600 }}>Digest 推送</div>
                <div style={{ color: "#6b7280", fontSize: 13 }}>{reminders.digestSchedule}</div>
              </div>
            </div>
          </div>
        </div>
      </s-section>

      <s-section heading="补货与预算">
        <div className="panel-grid__wide">
          <div className="card">
            <div className="card__header">
              <span className="card__title">按预算生成采购清单</span>
              <span className="badge">简单优先级策略</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ color: "#111827", fontWeight: 600 }}>
                预算：<span className="highlight">$20,000</span>
              </div>
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                已为你优先选中 8 个高风险 SKU（按缺货天数 × 销售额排序），预计花费 $18,760，可覆盖 30 天。
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <s-button variant="primary">导出采购清单 (CSV)</s-button>
                <s-button variant="tertiary">调整预算与优先级</s-button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <span className="card__title">日常提示</span>
              <span className="badge">运营建议</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#4b5563", lineHeight: 1.6 }}>
              <li>补货建议基于默认交期 10 天 + 安全库存 7 天计算，可在设置中修改。</li>
              <li>销量不足阈值：近 30 天销量 &lt; 10 的 SKU 暂不输出建议。</li>
              <li>压货标签：覆盖天数 &gt; 90 天标记严重，60–90 天标记轻微。</li>
            </ul>
          </div>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
