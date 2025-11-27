import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { json, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";

interface SettingItem {
  name: string;
  value: string;
  description: string;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const settings: SettingItem[] = [
    {
      name: "参与计算的库存地点",
      value: "主要仓库 + 海外仓",
      description: "可在这里勾选需要纳入销量与库存计算的 Shopify Location。",
    },
    {
      name: "历史窗口",
      value: "30 天",
      description: "用于计算日均销量，可切换 30 / 60 / 90 天。",
    },
    {
      name: "缺货阈值",
      value: "库存覆盖天数 ≤ 10 天",
      description: "低于该阈值的 SKU 会进入缺货风险列表。",
    },
    {
      name: "过量库存阈值",
      value: "库存覆盖天数 ≥ 90 天",
      description: "高于该阈值的 SKU 会被标记压货/滞销。",
    },
    {
      name: "安全库存天数",
      value: "7 天",
      description: "补货目标覆盖天数 = 交期 + 安全库存。",
    },
    {
      name: "默认供应商交期",
      value: "10 天",
      description: "可按供应商单独配置，默认用于全部 SKU。",
    },
    {
      name: "Digest 报告推送",
      value: "每周一 09:00 邮件 + Slack Webhook",
      description: "可切换每日 / 每周 / 不发送，并配置收件人。",
    },
  ];

  return json({ settings });
};

export default function SettingsPage() {
  const { settings } = useLoaderData<typeof loader>();

  return (
    <s-page heading="设置" subtitle="控制补货、压货逻辑以及通知推送">
      <s-section>
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text tone="base" as="p">
              V1 聚焦简单可落地的配置。未来会支持按供应商上传交期、按产品线设置阈值，以及更灵活的通知策略。
            </s-text>
            <s-button variant="primary">编辑设置</s-button>
          </s-stack>
        </s-box>
      </s-section>

      <s-section heading="当前配置快照">
        <div style={{ display: "grid", gap: 12 }}>
          {settings.map((item) => (
            <s-box
              key={item.name}
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <s-stack direction="block" gap="base">
                <s-text as="h3" variant="headingMd">
                  {item.name}
                </s-text>
                <s-text tone="success" as="p" variant="headingSm">
                  {item.value}
                </s-text>
                <s-text as="p" tone="subdued">
                  {item.description}
                </s-text>
              </s-stack>
            </s-box>
          ))}
        </div>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
