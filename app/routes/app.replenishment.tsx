import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { json, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

interface ReplenishmentDetail {
  sku: string;
  name: string;
  location: string;
  available: number;
  avgDailySales: number;
  daysOfStock: number;
  recommendedQty: number;
  targetCoverage: number;
  unitCost: number;
  supplier: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const suggestions: ReplenishmentDetail[] = [
    {
      sku: "TSHIRT-BLK-M",
      name: "经典款 T 恤 / 黑 / M",
      location: "主要仓库",
      available: 18,
      avgDailySales: 6.4,
      daysOfStock: 3,
      recommendedQty: 160,
      targetCoverage: 17,
      unitCost: 6.8,
      supplier: "Ace Garment",
    },
    {
      sku: "USB-C-HUB-8P",
      name: "8 合 1 USB-C 扩展坞",
      location: "主要仓库",
      available: 30,
      avgDailySales: 4.2,
      daysOfStock: 7,
      recommendedQty: 95,
      targetCoverage: 17,
      unitCost: 11.2,
      supplier: "Nova Tech",
    },
    {
      sku: "SUNSCREEN-SPF50",
      name: "SPF50 防晒乳 100ml",
      location: "海外仓",
      available: 12,
      avgDailySales: 2.9,
      daysOfStock: 4,
      recommendedQty: 95,
      targetCoverage: 17,
      unitCost: 7.4,
      supplier: "Glow Labs",
    },
  ];

  return json({ suggestions });
};

export default function ReplenishmentPage() {
  const { suggestions } = useLoaderData<typeof loader>();

  return (
    <s-page
      heading="补货建议"
      subtitle="基于最近销量、交期与安全库存，快速生成可执行的补货清单"
    >
      <s-section>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text tone="base" as="p">
              预算优先级：按缺货风险 × 销售额排序，优先覆盖 30 天库存。可在设置中调整交期与安全库存。
            </s-text>
            <s-stack direction="inline" gap="base">
              <s-button variant="primary">导出采购 CSV</s-button>
              <s-button variant="tertiary">按预算重排</s-button>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="候选 SKU (示例数据)">
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 13,
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  产品 / SKU / 仓库
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  当前可售
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  日均销量
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  可售天数
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  补货建议
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  目标覆盖天数
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  单位成本
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  供应商
                </th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((row) => (
                <tr key={row.sku} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>{row.name}</div>
                    <div style={{ color: "#6b7280" }}>{row.sku}</div>
                    <div style={{ color: "#6b7280" }}>{row.location}</div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{row.available}</td>
                  <td style={{ padding: "10px 8px" }}>{row.avgDailySales.toFixed(1)}</td>
                  <td style={{ padding: "10px 8px" }}>{row.daysOfStock} 天</td>
                  <td style={{ padding: "10px 8px", fontWeight: 700 }}>
                    {row.recommendedQty} 件
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      ~ ${(row.recommendedQty * row.unitCost).toFixed(0)} 采购额
                    </div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{row.targetCoverage} 天</td>
                  <td style={{ padding: "10px 8px" }}>${row.unitCost.toFixed(2)}</td>
                  <td style={{ padding: "10px 8px" }}>{row.supplier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
