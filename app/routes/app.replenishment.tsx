import { useMemo, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { json, useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import {
  getReplenishmentData,
} from "../services/inventory.replenishment.server";
import { logSyncEvent } from "../services/inventory.sync.server";
import type { ReplenishmentPayload } from "../services/inventory.types";
import {
  DEFAULT_TARGET_COVERAGE,
  MIN_RECOMMENDED_QTY,
  MIN_SALES_FOR_FORECAST,
} from "../config/inventory";
import styles from "./app.replenishment.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  return getReplenishmentData(admin, session.shop);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");
  const skusParam = (formData.get("skus") as string | null) ?? "";
  const selectedSkus = skusParam
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (intent === "export") {
    const data = await getReplenishmentData(admin, session.shop);
    const rows =
      selectedSkus.length > 0
        ? data.rows.filter((row) => selectedSkus.includes(row.sku))
        : data.rows;
    const csv = toCsv(rows);
    await logSyncEvent(
      session.shop,
      "export-replenishment",
      "success",
      `导出 ${rows.length} 行`,
    );
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": 'attachment; filename="replenishment.csv"',
      },
    });
  }

  if (intent === "sync") {
    await getReplenishmentData(admin, session.shop);
    await logSyncEvent(session.shop, "sync-replenishment", "success", "手动同步补货数据");
    return json({ ok: true, message: "同步完成" });
  }

  if (intent === "plan") {
    await logSyncEvent(
      session.shop,
      "budget-plan",
      "success",
      `确认采购优先级：${selectedSkus.length} 个 SKU`,
    );
    return json({
      ok: true,
      message: `已确认采购优先级（${selectedSkus.length} 个 SKU）`,
    });
  }

  return json({ ok: true });
};

const formatCurrency = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function Replenishment() {
  const syncFetcher = useFetcher<typeof action>();
  const planFetcher = useFetcher<typeof action>();
  const { rows, budgetPlan, missingCostCount, locations, suppliers, safetyDays, leadTimeDays, historyWindowDays, targetCoverageDays, shortageThreshold, lastCalculated } =
    useLoaderData<typeof loader>();
  const [budget, setBudget] = useState(budgetPlan.budget);
  const [locationFilter, setLocationFilter] = useState(
    locations.find((location) => location.selected)?.id ?? "All",
  );
  const [supplierFilter, setSupplierFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"shortage" | "all" | "low-sales">("shortage");
  const [sortKey, setSortKey] = useState<"daysOfStock" | "recommendedQty" | "available">(
    "daysOfStock",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [selectedSkus, setSelectedSkus] = useState<string[]>(() =>
    rows.filter((row) => row.recommendedQty > 0).map((row) => row.sku),
  );
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const planCoverage = Math.round((budgetPlan.coverageShare ?? 0) * 100);
  const planGap = budgetPlan.budget - budgetPlan.usedAmount;

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedSkus.includes(row.sku)),
    [rows, selectedSkus],
  );

  const filteredRows = useMemo(() => {
    const selectedLocation = locations.find((location) => location.id === locationFilter);

    return rows.filter((row) => {
      const matchLocation =
        locationFilter === "All" ||
        row.location === "All included locations" ||
        (selectedLocation ? row.location.includes(selectedLocation.name) : false);
      const matchSupplier = supplierFilter === "All" || row.supplier === supplierFilter;
      const matchSearch =
        search.trim().length === 0 ||
        row.sku.toLowerCase().includes(search.toLowerCase()) ||
        row.name.toLowerCase().includes(search.toLowerCase());
      const lowSales = row.avgDailySales * 30 < MIN_SALES_FOR_FORECAST;
      const shortageRisk =
        row.daysOfStock <= shortageThreshold ||
        row.recommendedQty >= MIN_RECOMMENDED_QTY;
      const matchRisk =
        riskFilter === "all"
          ? true
          : riskFilter === "low-sales"
            ? lowSales
            : shortageRisk;

      return matchLocation && matchSupplier && matchSearch && matchRisk;
    });
  }, [rows, locationFilter, supplierFilter, search, riskFilter, locations]);

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows].sort((a, b) => {
      const delta = (a[sortKey] as number) - (b[sortKey] as number);
      return sortDir === "asc" ? delta : -delta;
    });
    return sorted;
  }, [filteredRows, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedRows.slice(start, start + pageSize);
  }, [page, pageSize, sortedRows]);

  const totalAmount = useMemo(
    () => selectedRows.reduce((sum, row) => sum + row.recommendedQty * row.unitCost, 0),
    [selectedRows],
  );

  const totalQty = useMemo(
    () => selectedRows.reduce((sum, row) => sum + row.recommendedQty, 0),
    [selectedRows],
  );

  const toggleSku = (sku: string) => {
    setSelectedSkus((current) =>
      current.includes(sku) ? current.filter((item) => item !== sku) : [...current, sku],
    );
  };

  const budgetDelta = budget - totalAmount;
  const isSyncing = syncFetcher.state !== "idle" && syncFetcher.formData?.get("intent") === "sync";
  const syncMessage = syncFetcher.data?.message;
  const isPlanning = planFetcher.state !== "idle" && planFetcher.formData?.get("intent") === "plan";
  const planMessage = planFetcher.data?.message;

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const runBudgetPlanner = () => {
    const candidates = filteredRows
      .filter((row) => row.recommendedQty > 0)
      .map((row) => {
        const spend = row.recommendedQty * row.unitCost;
        const riskScore = row.daysOfStock > 0 ? 1 / row.daysOfStock : 2;
        const importance = row.avgDailySales * Math.max(row.unitCost, 1);
        const score = riskScore * (importance + 1);
        return { row, spend, score };
      })
      .sort((a, b) => b.score - a.score);

    let used = 0;
    const picked: string[] = [];

    candidates.forEach(({ row, spend }) => {
      if (spend === 0) return;
      if (used + spend <= budget || picked.length === 0) {
        picked.push(row.sku);
        used += spend;
      }
    });

    setSelectedSkus(picked);
    setPage(1);
  };

  const copyTemplate = async (mode: "list" | "supplier") => {
    const fallbackRows = rows.filter((row) => row.recommendedQty > 0);
    const source = selectedRows.length > 0 ? selectedRows : fallbackRows;
    if (source.length === 0) {
      setCopyStatus("没有可复制的 SKU");
      return;
    }

    const perSupplier = new Map<string, { rows: typeof source; total: number }>();
    source.forEach((row) => {
      const amount = row.recommendedQty * row.unitCost;
      const entry = perSupplier.get(row.supplier) ?? { rows: [], total: 0 };
      entry.rows = [...entry.rows, row];
      entry.total += amount;
      perSupplier.set(row.supplier, entry);
    });

    const lines: string[] = [];
    lines.push(`采购清单（预算 ${formatCurrency(budget)}，已选 ${source.length} 个 SKU）`);

    if (mode === "supplier") {
      perSupplier.forEach((entry, supplier) => {
        lines.push(`供应商：${supplier}（小计 ${formatCurrency(entry.total)}）`);
        entry.rows.forEach((row) =>
          lines.push(
            `- ${row.name} ${row.variant} | ${row.sku} × ${row.recommendedQty} = ${formatCurrency(row.recommendedQty * row.unitCost)} | 单位成本 ${formatCurrency(row.unitCost)}`,
          ),
        );
      });
    } else {
      source.forEach((row) =>
        lines.push(
          `- ${row.sku} ${row.name} · ${row.variant} | ${row.recommendedQty} 件 | 目标覆盖 ${row.targetCoverage} 天 | 金额 ${formatCurrency(row.recommendedQty * row.unitCost)}`,
        ),
      );
    }

    lines.push(`总计：${formatCurrency(totalAmount)}`);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyStatus("已复制到剪贴板");
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
            <h1 className={styles.heading}>补货建议</h1>
            <p className={styles.subheading}>
              聚焦缺货风险 SKU，按补货目标覆盖天数与供应商交期计算建议数量。预算受限时也能给出优先级。
            </p>
            <div className={styles.subheading}>数据更新于：{lastCalculated}</div>
            <div className={styles.headerChips}>
              <span className={`${styles.chip} ${styles.chipPrimary}`}>
                缺货阈值：库存覆盖 ≤ {shortageThreshold} 天
              </span>
              <span className={styles.chip}>安全库存：{safetyDays} 天</span>
              <span className={styles.chip}>默认交期：{leadTimeDays} 天</span>
              <span className={styles.chip}>预测窗口：近 {historyWindowDays} 天销量</span>
              <span className={styles.chip}>只读 Shopify（不创建采购单）</span>
            </div>
          </div>
          <div className={styles.headerActions}>
            <s-button
              variant="primary"
              onClick={() =>
                syncFetcher.submit({ intent: "sync" }, { method: "post" })
              }
              {...(isSyncing ? { loading: true } : {})}
            >
              同步 Shopify 数据
            </s-button>
            <form method="post">
              <input type="hidden" name="skus" value={selectedSkus.join(",")} />
              <input type="hidden" name="intent" value="export" />
              <s-button type="submit" variant="tertiary">
                导出 CSV
              </s-button>
            </form>
          </div>
        </div>

        <div className={styles.summaryRow}>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>待补货 SKU</div>
              <div className={styles.summaryValue}>{rows.filter((row) => row.recommendedQty > 0).length}</div>
              <div className={styles.summaryMeta}>
                过滤覆盖 ≤ {DEFAULT_SHORTAGE_THRESHOLD_DAYS} 天 · 推荐数量 &gt; 0
              </div>
            </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>本次采购预算</div>
            <div className={styles.budgetInputWrap}>
              <span className={styles.currency}>$</span>
              <input
                className={styles.budgetInput}
                type="number"
                value={budget}
                min={0}
                onChange={(event) => setBudget(Number(event.target.value))}
              />
            </div>
            <div className={styles.summaryMeta}>预算越紧，优先级排序越重要</div>
          </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryLabel}>覆盖目标</div>
              <div className={styles.summaryValue}>
                {targetCoverageDays ?? DEFAULT_TARGET_COVERAGE} 天
              </div>
              <div className={styles.summaryMeta}>目标 = 交期 + 安全库存</div>
              {syncMessage && <div className={styles.syncNote}>{syncMessage}</div>}
              {planMessage && <div className={styles.planNote}>{planMessage}</div>}
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>缺失成本 SKU</div>
            <div className={styles.summaryValue}>{missingCostCount}</div>
            <div className={styles.summaryMeta}>影响库存金额与排序 · 去设置补齐</div>
            <div className={styles.summaryHint}>
              {missingCostCount > 0 ? (
                <s-link href="/app/settings#costs">点击补齐成本，金额排序将更准确</s-link>
              ) : (
                "已补齐成本，金额计算准确"
              )}
            </div>
          </div>
        </div>

        {missingCostCount > 0 && (
          <div className={styles.alertStrip}>
            <span>有 {missingCostCount} 个 SKU 未填成本，库存金额排序可能不准。</span>
            <s-button size="slim" variant="tertiary" href="/app/settings">
              去 Settings 补齐
            </s-button>
          </div>
        )}

        <div className={styles.filters}>
            <label className={styles.filter}>
              Location
              <select
                className={styles.select}
                value={locationFilter}
                onChange={(event) => {
                  setPage(1);
                  setLocationFilter(event.target.value);
                }}
              >
                <option value="All">All</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.selected ? " (纳入计算)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.filter}>
              Supplier
            <select
              className={styles.select}
              value={supplierFilter}
              onChange={(event) => {
                setPage(1);
                  setSupplierFilter(event.target.value);
                }}
              >
                <option value="All">All</option>
                {suppliers.map((supplier) => (
                  <option key={supplier} value={supplier}>
                    {supplier}
                  </option>
                ))}
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
            <label className={styles.filter}>
              预测窗口
              <select className={styles.select} value={historyWindowDays} readOnly>
                {[historyWindowDays, 60, 90]
                  .filter((value, index, self) => self.indexOf(value) === index)
                  .map((days) => (
                    <option key={days} value={days}>
                      最近 {days} 天
                    </option>
                  ))}
              </select>
            </label>
          <label className={styles.filter}>
            过滤
            <select
              className={styles.select}
              value={riskFilter}
              onChange={(event) => {
                setRiskFilter(event.target.value as typeof riskFilter);
                setPage(1);
              }}
            >
              <option value="shortage">只看缺货风险</option>
              <option value="all">全部 SKU</option>
              <option value="low-sales">销量不足以预测</option>
            </select>
          </label>
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <div>
            <div className={styles.tableTitle}>补货清单</div>
            <div className={styles.tableSubtitle}>
              按“缺货风险 × 重要度”排序，可多选导出采购清单 · 当前 {filteredRows.length} 条 · 仅读数据
            </div>
          </div>
            <div className={styles.tableActions}>
              <s-button size="slim" variant="primary" onClick={runBudgetPlanner}>
                按预算生成采购清单
              </s-button>
              <span className={`${styles.chip} ${styles.chipSoft}`}>
                已选 {selectedRows.length} 个 · {totalQty} 件
              </span>
              <span className={`${styles.chip} ${budgetDelta >= 0 ? styles.chipSuccess : styles.chipWarning}`}>
                预算差额 {formatCurrency(Math.abs(budgetDelta))} {budgetDelta >= 0 ? "剩余" : "超出"}
              </span>
              <span className={styles.chip}>
                预设预算覆盖约 {planCoverage}% · 差额 {formatCurrency(Math.abs(planGap))} {planGap >= 0 ? "剩余" : "超出"}
              </span>
            </div>
          </div>
          {selectedRows.length > 0 && (
            <div className={styles.selectionSummary}>
              <div>
                <div className={styles.selectionTitle}>已选采购清单</div>
                <div className={styles.selectionMeta}>
                  {selectedRows.length} 个 SKU · {totalQty} 件 · 预算差额 {formatCurrency(Math.abs(budgetDelta))} {budgetDelta >= 0 ? "剩余" : "超出"}
                </div>
              </div>
              <div className={styles.selectionList}>
                {selectedRows.slice(0, 4).map((row) => (
                  <span key={row.sku} className={styles.selectionItem}>
                    {row.sku} · {row.recommendedQty} 件
                  </span>
                ))}
                {selectedRows.length > 4 && (
                  <span className={styles.selectionItem}>... 等 {selectedRows.length - 4} 个</span>
                )}
              </div>
            </div>
          )}
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>选择</th>
                  <th>商品</th>
                  <th>SKU</th>
                  <th>所在地点</th>
                  <th onClick={() => toggleSort("available")} className={styles.sortable}>
                    可售库存 {sortKey === "available" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th>日均销量</th>
                  <th onClick={() => toggleSort("daysOfStock")} className={styles.sortable}>
                    预计可售天数 {sortKey === "daysOfStock" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th onClick={() => toggleSort("recommendedQty")} className={styles.sortable}>
                    建议补货 {sortKey === "recommendedQty" ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                  <th>目标覆盖天数</th>
                  <th>单位成本</th>
                  <th>建议采购金额</th>
                  <th>供应商</th>
                  <th>备注</th>
                </tr>
              </thead>
              <tbody>
                {!isSyncing &&
                  hasRows &&
                  pageRows.map((row) => {
                    const amount = row.recommendedQty * row.unitCost;
                    const isCritical = row.daysOfStock <= 7;
                    const isWarning = row.daysOfStock > 7 && row.daysOfStock <= 10;
                    const severityClass = isCritical ? styles.badgeDanger : isWarning ? styles.badgeWarning : styles.badgeInfo;

                    const lowSales = row.avgDailySales * 30 < MIN_SALES_FOR_FORECAST;
                    const note = row.note || (lowSales ? "销量不足以预测" : "");
                    const hasCost = row.unitCost > 0;

                    return (
                      <tr key={row.sku}>
                        <td>
                          <input
                            aria-label={`Select ${row.sku}`}
                            type="checkbox"
                            checked={selectedSkus.includes(row.sku)}
                            onChange={() => toggleSku(row.sku)}
                          />
                        </td>
                        <td>
                          <div className={styles.productCell}>
                            <div className={styles.thumb} />
                            <div>
                              <div className={styles.productName}>
                                <a className={styles.link} href={`/app/variant/${encodeURIComponent(row.sku)}`}>
                                  {row.name}
                                </a>
                              </div>
                              <div className={styles.productMeta}>{row.variant}</div>
                            </div>
                          </div>
                        </td>
                        <td className={styles.sku}>{row.sku}</td>
                        <td>{row.location}</td>
                        <td>{row.available}</td>
                        <td>{row.avgDailySales.toFixed(1)}</td>
                        <td>
                          <span className={`${styles.badge} ${severityClass}`}>{row.daysOfStock} 天</span>
                        </td>
                        <td className={styles.emphasis}>{row.recommendedQty}</td>
                        <td>{row.targetCoverage} 天</td>
                        <td>
                          {hasCost ? (
                            formatCurrency(row.unitCost)
                          ) : (
                            <span className={styles.missingCost}>未填成本</span>
                          )}
                        </td>
                        <td className={styles.emphasis}>
                          {hasCost ? formatCurrency(amount) : <span className={styles.missingCost}>金额待算</span>}
                        </td>
                        <td>{row.supplier}</td>
                        <td className={styles.note}>
                          {note ? <span className={styles.noteBadge}>{note}</span> : "-"}
                        </td>
                      </tr>
                    );
                  })}
                {isSyncing &&
                  Array.from({ length: 5 }).map((_, index) => (
                    <tr key={`skeleton-${index}`} className={styles.skeletonRow}>
                      <td colSpan={13}>
                        <div className={styles.skeletonLine} />
                      </td>
                    </tr>
                  ))}
                {!isSyncing && !hasRows && (
                  <tr>
                    <td colSpan={13}>
                      <div className={styles.emptyState}>没有符合条件的 SKU，换个筛选试试</div>
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

        <div className={styles.footerBar}>
          <div className={styles.footerStat}>
            <div className={styles.footerLabel}>已选采购金额</div>
            <div className={styles.footerValue}>{formatCurrency(totalAmount)}</div>
          </div>
          <div className={styles.footerStat}>
            <div className={styles.footerLabel}>已选数量</div>
            <div className={styles.footerValue}>{totalQty} 件</div>
          </div>
          <div className={styles.footerStat}>
            <div className={styles.footerLabel}>预算差额</div>
            <div className={`${styles.footerValue} ${budgetDelta < 0 ? styles.dangerText : ""}`}>
              {budgetDelta >= 0 ? "剩余 " : "超出 "}
              {formatCurrency(Math.abs(budgetDelta))}
            </div>
          </div>
          <div className={styles.footerActions}>
            <s-button size="slim" onClick={() => copyTemplate("list")}>
              复制采购明细
            </s-button>
            <s-button size="slim" variant="tertiary" onClick={() => copyTemplate("supplier")}>
              一键复制发供应商
            </s-button>
            <s-button
              variant="primary"
              onClick={() =>
                planFetcher.submit(
                  { intent: "plan", skus: selectedSkus.join(",") },
                  { method: "post" },
                )
              }
              {...(isPlanning ? { loading: true } : {})}
            >
              确认采购优先级
            </s-button>
          </div>
          {copyStatus && <div className={styles.copyStatus}>{copyStatus}</div>}
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function toCsv(rows: ReplenishmentPayload["rows"]) {
  const header = [
    "SKU",
    "产品",
    "变体",
    "Location",
    "可售库存",
    "日均销量",
    "预计可售天数",
    "建议补货",
    "目标覆盖天数",
    "单位成本",
    "建议采购金额",
    "供应商",
    "备注",
  ];

  let total = 0;
  const supplierTotals = new Map<string, number>();

  const lines = rows.map((row) => {
    const amount = row.recommendedQty * row.unitCost;
    total += amount;
    const currentSupplierTotal = supplierTotals.get(row.supplier) ?? 0;
    supplierTotals.set(row.supplier, currentSupplierTotal + amount);

    return [
      row.sku,
      row.name,
      row.variant,
      row.location,
      row.available,
      row.avgDailySales.toFixed(1),
      row.daysOfStock,
      row.recommendedQty,
      row.targetCoverage,
      row.unitCost,
      amount,
      row.supplier,
      row.note ?? "",
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",");
  });

  const summaryRow = [
    "总计",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    total,
    "",
    "",
  ]
    .map((value) => `"${String(value)}"`)
    .join(",");

  const supplierRows =
    supplierTotals.size === 0
      ? []
      : [
          ["供应商小计", "", "", "", "", "", "", "", "", "", "", "", ""]
            .map((value) => `"${String(value).replace(/"/g, '""')}"`)
            .join(","),
          ...Array.from(supplierTotals.entries()).map(([supplier, amount]) =>
            [
              supplier,
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              "",
              amount,
              "",
              "",
            ]
              .map((value) => `"${String(value).replace(/"/g, '""')}"`)
              .join(","),
          ),
        ];

  return [header.join(","), ...lines, summaryRow, ...supplierRows].join("\n");
}
