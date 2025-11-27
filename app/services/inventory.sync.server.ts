import { CACHE_MAX_MINUTES } from "../config/inventory";
import prisma from "../db.server";
import { logEvent } from "./logger.server";
import {
  getSampleVariantMetrics,
} from "./inventory.helpers.server";
import type {
  VariantInventory,
  VariantMetrics,
  VariantSalesBuckets,
} from "./inventory.types";
import type { AdminApiClient } from "./shopify-graphql.server";
import { paginate } from "./shopify-graphql.server";

export type SyncScope =
  | "inventory"
  | "orders"
  | "digest"
  | "sync-replenishment"
  | "sync-overstock"
  | "export-replenishment"
  | "export-overstock"
  | "budget-plan";

type ProductVariantNode = {
  id: string;
  sku: string | null;
  title: string;
  inventoryQuantity: number | null;
  product: { title: string | null } | null;
  inventoryItem: { unitCost: { amount: string | null } | null } | null;
};

type OrderLineNode = {
  quantity: number;
  variant: {
    id: string;
    sku: string | null;
    title: string | null;
    product: { title: string | null } | null;
  } | null;
};

type OrderNode = {
  id: string;
  createdAt: string;
  lineItems: {
    edges: { node: OrderLineNode }[];
  };
};

type LocationNode = { id: string; name: string };

export async function getVariantMetrics(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<VariantMetrics[]> {
  const freshCached = await getCachedVariantMetrics(shopDomain, CACHE_MAX_MINUTES);
  if (freshCached.length > 0) {
    return freshCached;
  }

  try {
    const [inventory, sales] = await Promise.all([
      fetchVariantInventory(admin, shopDomain),
      fetchOrderSales(admin, shopDomain),
    ]);

    const inventoryById = new Map(inventory.map((item) => [item.id, item]));

    const variants: VariantMetrics[] = [];

    const ids = new Set([...inventoryById.keys(), ...sales.keys()]);
    ids.forEach((id) => {
      const inventoryItem = inventoryById.get(id);
      const salesBuckets = sales.get(id) ?? { "30d": 0, "60d": 0, "90d": 0 };
      variants.push({
        id,
        sku: inventoryItem?.sku ?? "Unknown SKU",
        name: inventoryItem?.name ?? "Unknown product",
        variant: inventoryItem?.variant ?? "",
        available: inventoryItem?.available ?? 0,
        unitCost: inventoryItem?.unitCost,
        sales: salesBuckets,
      });
    });

    if (variants.length > 0) {
      await saveVariantMetrics(shopDomain, variants);
      await logEvent(shopDomain, "sync", "success", `Variants synced: ${variants.length}`);
      return variants;
    }
  } catch (error) {
    await logEvent(
      shopDomain,
      "sync",
      "failure",
      `Failed to load Shopify data: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }

  const anyCached = await getCachedVariantMetrics(shopDomain);
  if (anyCached.length > 0) {
    return anyCached;
  }

  await logEvent(shopDomain, "sync", "failure", "Fallback to sample metrics");
  return getSampleVariantMetrics();
}

async function fetchVariantInventory(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<VariantInventory[]> {
  const query = `#graphql
    query InventorySnapshot($cursor: String) {
      productVariants(first: 50, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          sku
          title
          inventoryQuantity
          product { title }
          inventoryItem {
            unitCost { amount }
          }
        }
      }
    }
  `;

  const nodes = await paginate<ProductVariantNode>(
    admin,
    shopDomain,
    query,
    ["productVariants"],
  );

  return nodes.map((node) => ({
    id: node.id,
    sku: node.sku ?? "Unknown SKU",
    name: node.product?.title ?? "Unknown product",
    variant: node.title ?? "",
    available: Number(node.inventoryQuantity ?? 0),
    unitCost: Number(node.inventoryItem?.unitCost?.amount ?? 0) || undefined,
  }));
}

async function fetchOrderSales(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<Map<string, VariantSalesBuckets>> {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const queryString = `created_at:>=${since.toISOString().slice(0, 10)} AND financial_status:paid`;

  const query = `#graphql
    query OrdersForInventory($query: String!, $first: Int!, $cursor: String) {
      orders(first: $first, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            createdAt
            lineItems(first: 50) {
              edges {
                node {
                  quantity
                  variant {
                    id
                    sku
                    title
                    product { title }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const orders = await paginate<OrderNode>(
    admin,
    shopDomain,
    query,
    ["orders"],
    { query: queryString, first: 80 },
    5,
  );

  const sales = new Map<string, VariantSalesBuckets>();
  const now = Date.now();

  orders.forEach((order) => {
    if (!order.createdAt) return;
    const createdAt = new Date(order.createdAt).getTime();
    const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    order.lineItems?.edges?.forEach((lineEdge) => {
      const line = lineEdge?.node;
      const variantId = line?.variant?.id;
      if (!variantId) return;
      const quantity = Number(line.quantity ?? 0);
      const buckets = sales.get(variantId) ?? { "30d": 0, "60d": 0, "90d": 0 };

      if (diffDays <= 30) {
        buckets["30d"] += quantity;
      }
      if (diffDays <= 60) {
        buckets["60d"] += quantity;
      }
      if (diffDays <= 90) {
        buckets["90d"] += quantity;
      }

      sales.set(variantId, buckets);
    });
  });

  return sales;
}

export async function fetchLocations(
  admin: AdminApiClient,
  shopDomain: string,
): Promise<{ id: string; name: string }[]> {
  const query = `#graphql
    query LocationsForInventory($cursor: String) {
      locations(first: 50, after: $cursor) {
        nodes { id name }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  const nodes = await paginate<LocationNode>(admin, shopDomain, query, ["locations"], undefined, 3);
  return nodes.map((node) => ({ id: node.id, name: node.name }));
}

export async function getCachedVariantMetrics(
  shopDomain: string,
  maxMinutes?: number,
): Promise<VariantMetrics[]> {
  const where: Record<string, unknown> = { shopDomain };
  if (maxMinutes) {
    const since = new Date(Date.now() - maxMinutes * 60 * 1000);
    where.lastCalculated = { gte: since };
  }

  const rows = await prisma.inventoryMetric.findMany({
    where,
    orderBy: { lastCalculated: "desc" },
  });

  return rows.map((row) => ({
    id: row.variantId,
    sku: row.sku,
    name: row.name,
    variant: row.variantTitle,
    available: row.available,
    unitCost: row.unitCost ?? undefined,
    sales: { "30d": row.sales30d, "60d": row.sales60d, "90d": row.sales90d },
  }));
}

async function saveVariantMetrics(shopDomain: string, variants: VariantMetrics[]) {
  const now = new Date();
  await prisma.$transaction(
    variants.map((variant) =>
      prisma.inventoryMetric.upsert({
        where: { shopDomain_variantId: { shopDomain, variantId: variant.id } },
        update: {
          sku: variant.sku,
          name: variant.name,
          variantTitle: variant.variant,
          available: variant.available,
          unitCost: variant.unitCost ?? null,
          sales30d: variant.sales["30d"],
          sales60d: variant.sales["60d"],
          sales90d: variant.sales["90d"],
          lastCalculated: now,
        },
        create: {
          shopDomain,
          variantId: variant.id,
          sku: variant.sku,
          name: variant.name,
          variantTitle: variant.variant,
          available: variant.available,
          unitCost: variant.unitCost ?? null,
          sales30d: variant.sales["30d"],
          sales60d: variant.sales["60d"],
          sales90d: variant.sales["90d"],
          lastCalculated: now,
        },
      }),
    ),
  );
}

export async function buildDashboardLocations(admin: AdminApiClient, shopDomain: string) {
  try {
    const locations = await fetchLocations(admin, shopDomain);
    if (locations.length > 0) {
      return locations.map((location, index) => ({
        ...location,
        selected: index < 2,
      }));
    }
  } catch (error) {
    await logEvent(
      shopDomain,
      "sync",
      "failure",
      `Failed to fetch locations: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  return [
    { id: "us-east", name: "US East (primary)", selected: true },
    { id: "eu-fulfillment", name: "EU Fulfillment", selected: true },
    { id: "pop-up", name: "Pop-up Store", selected: false },
  ];
}

export async function logSyncEvent(
  shopDomain: string,
  scope: "inventory" | "orders" | "digest" | "sync-replenishment" | "sync-overstock" | "export-replenishment" | "export-overstock" | "budget-plan",
  status: "success" | "failure",
  message?: string,
) {
  const note = message ?? "";
  const type = scope === "digest" ? "digest" : "sync";
  await logEvent(
    shopDomain,
    type,
    status,
    `${scope} ${status === "success" ? "ok" : "failed"}${note ? `: ${note}` : ""}`,
  );
}

export async function requestSync(shopDomain: string, scope: SyncScope = "inventory") {
  const job = await prisma.syncLog.create({
    data: { shopDomain, scope, status: "pending", message: "queued" },
  });
  return job.id;
}

export async function performSync(
  admin: AdminApiClient,
  shopDomain: string,
  jobId: string,
) {
  try {
    await getVariantMetrics(admin, shopDomain);
    await prisma.syncLog.update({
      where: { id: jobId },
      data: { status: "success", message: "sync completed" },
    });
  } catch (error) {
    await prisma.syncLog.update({
      where: { id: jobId },
      data: {
        status: "failure",
        message: error instanceof Error ? error.message : "sync failed",
      },
    });
    throw error;
  }
}
