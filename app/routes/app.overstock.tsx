import { useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { json, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { DEFAULT_MILD_OVERSTOCK_THRESHOLD_DAYS, DEFAULT_OVERSTOCK_THRESHOLD_DAYS } from "../config/inventory";
import { readSettings } from "../services/inventory.settings.server";
import { getOverstockData } from "../services/inventory.overstock.server";
import { logSyncEvent } from "../services/inventory.sync.server";
import type { OverstockPayload, OverstockRow } from "../services/inventory.types";
import styles from "./app.overstock.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const settings = await readSettings(session.shop);
  return getOverstockData(admin, session.shop, {
    overstockThresholdDays: settings?.overstockThreshold,
    mildOverstockThresholdDays: settings?.mildOverstockThreshold,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "export") {
    const data = await getOverstockData(admin, session.shop);
    const csv = toCsv(data.rows);
    await logSyncEvent(
      session.shop,
      "export-overstock",
      "success",
      `导出 ${data.rows.length} 行`,
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="overstock.csv"',
      },
    });
  }

  if (intent === "sync") {
    await getOverstockData(admin, session.shop);
    await logSyncEvent(session.shop, "sync-overstock", "success", "手动同步压货数据");
    return json({ ok: true, message: "同步完成" });
  }

  return json({ ok: true });
};

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const severityText: Record<OverstockRow["severity"], string> = {
  severe: "严重滞销 / 压货",
  mild: "轻微过量",
  normal: "正常",
};

const DEFAULT_MILD = DEFAULT_MILD_OVERSTOCK_THRESHOLD_DAYS;
const DEFAULT_SEVERE = DEFAULT_OVERSTOCK_THRESHOLD_DAYS;

const discountText = (row: OverstockRow, severeThreshold: number, mildThreshold: number) => {
  if (row.severity === "severe" || row.coverageDays >= severeThreshold) {
    return "15% - 25%";
  }
  if (
    row.severity === "mild" ||
    row.coverageDays >= mildThreshold
  ) {
    return "10% - 15%";
  }
  return "-";
};

export default function Overstock() {
  const { rows, summary, overstockThresholdDays, mildOverstockThresholdDays, lastCalculated } = useLoaderData<typeof loader>();
  const SEVERE_THRESHOLD = overstockThresholdDays ?? DEFAULT_SEVERE;
  const MILD_THRESHOLD = mildOverstockThresholdDays ?? DEFAULT_MILD;
  const syncFetcher = useFetcher<typeof action>();
  const [filter, setFilter] = useState<OverstockRow["severity"] | "all">("severe");
  const [sortKey, setSortKey] = useState<"coverageDays" | "stockValue">("stockValue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [search, setSearch] = useState("");
  const [valueRange, setValueRange] = useState<"all" | "gt5000" | "gt20000" | "lt5000">("all");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const syncMessage = syncFetcher.data?.message;
  const isSyncing =
    syncFetcher.state !== "idle" && syncFetcher.formData?.get("intent") === "sync";

  const visibleRows = useMemo(() => {
    const severityRows = filter === "all" ? rows : rows.filter((row) => row.severity === filter);
    return severityRows.filter((row) => {
      const matchSearch =
        !search.trim() ||
        row.sku.toLowerCase().includes(search.toLowerCase()) ||
        row.name.toLowerCase().includes(search.toLowerCase());

      const matchValue =
        valueRange === "all"
          ? true
          : valueRange === "gt20000"
            ? row.stockValue >= 20000
            : valueRange === "gt5000"
              ? row.stockValue >= 5000
              : row.stockValue < 5000;

      return matchSearch && matchValue;
    });
  }, [filter, rows, search, valueRange]);

  const sortedRows = useMemo(() => {
    const sorted = [...visibleRows].sort((a, b) => {
      const delta = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "asc" ? delta : -delta;
    });
    return sorted;
  }, [visibleRows, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [page, pageSize, sortedRows]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
    setPage(1);
  };

  const copyPromotionPlan = async () => {
    const source = visibleRows.slice(0, 15);
    if (source.length === 0) {
      setCopyStatus("没有可复制的 SKU");
      return;
    }
    const lines: string[] = [];
    lines.push("清货候选 SKU（含折扣建议）");
    source.forEach((row) => {
      lines.push(
        `- ${row.sku} ${row.name} · ${row.variant} | 覆盖 ${row.coverageDays} 天 | 占用 ${formatCurrency(row.stockValue)} | 建议折扣 ${discountText(row, SEVERE_THRESHOLD, MILD_THRESHOLD)}${row.unitCost ? "" : " · 未填成本"}`,
      );
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyStatus("已复制促销方案");
    } catch (error) {
      setCopyStatus("复制失败，请手动选择文本");
    }
  };

  const hasRows = pageRows.length > 0;

  return (
    <s-page className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.heading}>压货 / 滞销雷达</h1>
            <p className={styles.subheading}>
              捕捉覆盖天数过高的 SKU，按占用金额排序，给出清货建议。库存覆盖 ≥ {SEVERE_THRESHOLD} 天 或 30 天销量为 0 会被标记为严重滞销。
            </p>
            <div className={styles.headerBadges}>
              <span className={styles.badge}>覆盖天数阈值：{MILD_THRESHOLD} / {SEVERE_THRESHOLD} 天</span>
              <span className={styles.badge}>销量窗口：30 天</span>
              <span className={styles.badge}>只读 Shopify 库存</span>
              <span className={styles.badge}>建议折扣 10% - 25%（视毛利）</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            <form method="post">
              <input type="hidden" name="intent" value="export" />
              <s-button type="submit" variant="primary">
                导出清货清单
              </s-button>
            </form>
            <s-button
              variant="tertiary"
              onClick={() =>
                syncFetcher.submit({ intent: "sync" }, { method: "post" })
              }
              {...(isSyncing ? { loading: true } : {})}
            >
              同步 Shopify 数据
            </s-button>
          </div>
        </div>

        <div className={styles.summaryRow}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>压货 SKU</div>
            <div className={styles.summaryValue}>{summary.overstockCount}</div>
            <div className={styles.summaryMeta}>
              覆盖 ≥ {SEVERE_THRESHOLD} 天 · 过去 30 天有销量
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>严重滞销</div>
            <div className={styles.summaryValue}>{summary.severeCount}</div>
            <div className={styles.summaryMeta}>
              销量为 0 或覆盖 ≥ {SEVERE_THRESHOLD} 天
            </div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>占用金额</div>
            <div className={styles.summaryValue}>{formatCurrency(summary.totalStockValue)}</div>
            <div className={styles.summaryMeta}>其中严重滞销 {formatCurrency(summary.severeStockValue)}</div>
            {syncMessage && <div className={styles.syncNote}>{syncMessage}</div>}
          </div>
        </div>

        <div className={styles.filters}>
          <label className={styles.filter}>
            严重程度
            <select
              className={styles.select}
              value={filter}
              onChange={(event) =>
                setFilter(event.target.value as OverstockRow["severity"] | "all")
              }
            >
              <option value="severe">只看严重滞销</option>
              <option value="mild">只看轻微过量</option>
              <option value="normal">正常</option>
              <option value="all">全部</option>
            </select>
          </label>
          <label className={styles.filter}>
            排序
            <select
              className={styles.select}
              value={sortKey}
              onChange={(event) => {
                setPage(1);
                setSortKey(event.target.value as typeof sortKey);
              }}
            >
              <option value="stockValue">按库存占用金额</option>
              <option value="coverageDays">按覆盖天数</option>
            </select>
          </label>
          <label className={styles.filter}>
            占用金额
            <select
              className={styles.select}
              value={valueRange}
              onChange={(event) => {
                setPage(1);
                setValueRange(event.target.value as typeof valueRange);
              }}
            >
              <option value="all">全部</option>
              <option value="gt20000">≥ $20,000</option>
              <option value="gt5000">≥ $5,000</option>
              <option value="lt5000">&lt; $5,000</option>
            </select>
          </label>
          <label className={styles.filter}>
            清货策略
            <select className={styles.select}>
              <option>推荐折扣区间 10% - 20%</option>
              <option>推荐与爆款捆绑</option>
            </select>
          </label>
          <label className={styles.filter}>
            搜索 SKU / 名称
            <input
              className={styles.searchInput}
              type="search"
              value={search}
              onChange={(event) => {
                setPage(1);
                setSearch(event.target.value);
              }}
              placeholder="输入 SKU 或商品名"
            />
          </label>
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
              <div className={styles.tableTitle}>压货列表</div>
              <div className={styles.tableSubtitle}>覆盖天数 ≥ 60 天 或 30 天销量为 0 的 SKU · 仅读数据</div>
              <div className={styles.tableMeta}>数据更新于：{lastCalculated}</div>
            </div>
            <span className={`${styles.badge} ${styles.badgeSoft}`}>结果 {visibleRows.length} 条</span>
          </div>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>SKU / 商品</th>
                  <th>当前库存</th>
                  <th>30 天销量</th>
                  <th>日均销量</th>
                  <th onClick={() => toggleSort("coverageDays")} className={styles.sortable}>
                    覆盖天数 {sortKey === "coverageDays" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th onClick={() => toggleSort("stockValue")} className={styles.sortable}>
                    库存金额 {sortKey === "stockValue" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th>建议折扣</th>
                  <th>标签</th>
                </tr>
              </thead>
              <tbody>
                {!isSyncing && hasRows &&
                  pageRows.map((row) => (
                    <tr key={row.sku}>
                      <td>
                        <div className={styles.productCell}>
                          <div className={styles.thumb} />
                          <div>
                            <div className={styles.productName}>
                              <a className={styles.link} href={`/app/variant/${encodeURIComponent(row.sku)}`}>
                                {row.name}
                              </a>
                            </div>
                            <div className={styles.productMeta}>{row.sku} · {row.variant}</div>
                          </div>
                        </div>
                      </td>
                      <td>{row.available}</td>
                      <td>{row.sales30d}</td>
                      <td>{row.avgDailySales.toFixed(1)}</td>
                      <td>{row.coverageDays} 天</td>
                      <td className={styles.stockValue}>
                        {formatCurrency(row.stockValue)}
                        {!row.unitCost && <span className={styles.missingCost}>未填成本</span>}
                      </td>
                      <td>{discountText(row, SEVERE_THRESHOLD, MILD_THRESHOLD)}</td>
                      <td>
                        <span
                          className={`${styles.severityBadge} ${
                            row.severity === "severe"
                              ? styles.severitySevere
                              : row.severity === "mild"
                                ? styles.severityMild
                                : styles.severityNormal
                          }`}
                        >
                          {severityText[row.severity]}
                        </span>
                      </td>
                    </tr>
                  ))}
                {isSyncing &&
                  Array.from({ length: 5 }).map((_, index) => (
                  <tr key={`skeleton-${index}`} className={styles.skeletonRow}>
                    <td colSpan={8}>
                      <div className={styles.skeletonLine} />
                    </td>
                  </tr>
                ))}
                {!isSyncing && !hasRows && (
                  <tr>
                    <td colSpan={8}>
                      <div className={styles.emptyState}>没有符合条件的 SKU，调整筛选试试</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className={styles.pagination}>
            <label className={styles.pageSize}>
              每页
              <select
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                <option value={8}>8</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.pageButton}
              disabled={page === 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              上一页
            </button>
            <span className={styles.pageMeta}>
              第 {page} / {totalPages} 页
            </span>
            <button
              type="button"
              className={styles.pageButton}
              disabled={page === totalPages}
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            >
              下一页
            </button>
          </div>
        </div>

        <div className={styles.actionGrid}>
          <div className={styles.actionCard}>
            <div className={styles.actionTitle}>建议动作</div>
            <ul className={styles.actionList}>
              <li>
                <span className={styles.dot} />
                严重滞销（覆盖 ≥ {SEVERE_THRESHOLD} 天）：建议折扣 15% - 25%，或与 A 类爆款捆绑。
              </li>
              <li>
                <span className={styles.dot} />
                轻微过量（覆盖 {MILD_THRESHOLD}-{SEVERE_THRESHOLD} 天）：放缓补货，同时在主页做轻提醒。
              </li>
              <li>
                <span className={styles.dot} />
                未填成本的 SKU：尽快补齐，以便准确计算库存占用金额。
              </li>
            </ul>
            <div className={styles.actionFooter}>
              <s-button size="slim">导出清货候选 CSV</s-button>
              <s-button variant="tertiary" size="slim" onClick={copyPromotionPlan}>
                复制到促销方案
              </s-button>
            </div>
            {copyStatus && <div className={styles.copyStatus}>{copyStatus}</div>}
          </div>

            <div className={styles.actionCard}>
              <div className={styles.actionTitle}>监控阈值</div>
              <div className={styles.thresholdBox}>
                <div>
                  <div className={styles.thresholdLabel}>覆盖天数上限</div>
                  <div className={styles.thresholdValue}>{SEVERE_THRESHOLD} 天</div>
                  <div className={styles.thresholdMeta}>&gt; {SEVERE_THRESHOLD} 天 标记严重压货</div>
                </div>
                <div>
                  <div className={styles.thresholdLabel}>销量为 0</div>
                  <div className={styles.thresholdValue}>近 30 天</div>
                <div className={styles.thresholdMeta}>销量为 0 的现货 SKU 直接标记</div>
              </div>
            </div>
            <div className={styles.thresholdFooter}>
              <s-button size="slim" variant="tertiary">
                修改阈值
              </s-button>
              <span className={styles.thresholdNote}>调整后将在夜间任务重新计算</span>
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

function toCsv(rows: OverstockPayload["rows"]) {
  const header = [
    "SKU",
    "产品",
    "变体",
    "当前库存",
    "30天销量",
    "日均销量",
    "覆盖天数",
    "库存金额",
    "建议折扣",
    "标签",
  ];

  const lines = rows.map((row) =>
    [
      row.sku,
      row.name,
      row.variant,
      row.available,
      row.sales30d,
      row.avgDailySales.toFixed(1),
      row.coverageDays,
      row.stockValue,
      discountText(row, SEVERE_THRESHOLD, MILD_THRESHOLD),
      severityText[row.severity],
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}
