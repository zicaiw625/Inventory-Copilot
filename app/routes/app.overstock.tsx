import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { json, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

interface OverstockDetail {
  sku: string;
  name: string;
  available: number;
  sales30d: number;
  coverageDays: number;
  stockValue: number;
  severity: "severe" | "mild" | "none";
  note: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const overstock: OverstockDetail[] = [
    {
      sku: "YOGA-MAT-PINK",
      name: "加厚瑜伽垫 / 粉色",
      available: 420,
      sales30d: 114,
      coverageDays: 110,
      stockValue: 5880,
      severity: "severe",
      note: "建议 15% 折扣 + 捆绑爆款瑜伽服",
    },
    {
      sku: "MOUSE-PAD-XXL",
      name: "电竞加长鼠标垫",
      available: 180,
      sales30d: 36,
      coverageDays: 150,
      stockValue: 2160,
      severity: "severe",
      note: "覆盖超 120 天，考虑减缓补货",
    },
    {
      sku: "COFFEE-DRIP-SET",
      name: "手冲咖啡入门套装",
      available: 60,
      sales30d: 21,
      coverageDays: 86,
      stockValue: 3180,
      severity: "mild",
      note: "轻微过量，优先与咖啡豆做组合",
    },
  ];

  return json({ overstock });
};

const severityColor: Record<OverstockDetail["severity"], string> = {
  severe: "#B42318",
  mild: "#B54708",
  none: "#1F6E43",
};

const severityLabel: Record<OverstockDetail["severity"], string> = {
  severe: "库存严重过量",
  mild: "轻微过量",
  none: "正常",
};

export default function OverstockPage() {
  const { overstock } = useLoaderData<typeof loader>();

  return (
    <s-page
      heading="压货 / 滞销雷达"
      subtitle="用覆盖天数和占用金额定位最需要清理的 SKU"
    >
      <s-section>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text tone="base" as="p">
              规则：销量为 0 且有库存标记为严重滞销；覆盖天数 &gt; 90 天为严重过量，60–90 天为轻微过量。
            </s-text>
            <s-text tone="subdued" as="p">
              提示：可以按占用金额排序，优先处理「最占钱」的 SKU，并结合促销 / bundle App 执行清货。
            </s-text>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="压货 SKU (示例数据)">
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
                  产品 / SKU
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  当前库存
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  最近 30 天销量
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  覆盖天数
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  库存金额
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  标签
                </th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: "#6b7280" }}>
                  建议动作
                </th>
              </tr>
            </thead>
            <tbody>
              {overstock.map((row) => (
                <tr key={row.sku} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "10px 8px" }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>{row.name}</div>
                    <div style={{ color: "#6b7280" }}>{row.sku}</div>
                  </td>
                  <td style={{ padding: "10px 8px" }}>{row.available}</td>
                  <td style={{ padding: "10px 8px" }}>{row.sales30d}</td>
                  <td style={{ padding: "10px 8px" }}>{row.coverageDays} 天</td>
                  <td style={{ padding: "10px 8px" }}>${row.stockValue.toLocaleString()}</td>
                  <td style={{ padding: "10px 8px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        padding: "4px 8px",
                        borderRadius: 999,
                        background: `${severityColor[row.severity]}14`,
                        color: severityColor[row.severity],
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      {severityLabel[row.severity]}
                    </span>
                  </td>
                  <td style={{ padding: "10px 8px", color: "#4b5563" }}>{row.note}</td>
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
