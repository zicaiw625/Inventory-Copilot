import type { EventType } from "./logger.server";
import { logEvent } from "./logger.server";

export type AdminApiClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

type GraphqlError = { message: string };

type PageInfo = {
  hasNextPage: boolean;
  endCursor?: string | null;
};

type PaginationContainer<T> = {
  nodes?: T[];
  edges?: { node: T }[];
  pageInfo?: PageInfo;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: GraphqlError[];
};

function extractContainer<T>(
  data: unknown,
  path: string[],
): PaginationContainer<T> | undefined {
  return path.reduce<PaginationContainer<T> | undefined>((current, key) => {
    if (current === undefined) return undefined;
    return (current as Record<string, unknown>)[key] as PaginationContainer<T> | undefined;
  }, data as PaginationContainer<T>);
}

function formatErrors(errors?: GraphqlError[]) {
  return errors?.map((error) => error.message).join(" | ");
}

export async function executeGraphql<T>(
  admin: AdminApiClient,
  shopDomain: string,
  query: string,
  options?: { variables?: Record<string, unknown> },
  logScope = "graphql",
  type: EventType = "sync",
): Promise<T> {
  const response = await admin.graphql(query, options);
  const raw = await response.text();
  let json: GraphqlResponse<T> | undefined;
  try {
    json = JSON.parse(raw) as GraphqlResponse<T>;
  } catch {
    // ignore json parse error, handled below
  }

  if (!response.ok) {
    await logEvent(
      shopDomain,
      type,
      "failure",
      `GraphQL ${logScope} failed with status ${response.status}${json?.errors ? ` | ${formatErrors(json.errors)}` : ""}`,
    );
    throw new Error(`GraphQL ${logScope} failed (${response.status})`);
  }

  if (json?.errors && json.errors.length > 0) {
    await logEvent(shopDomain, type, "failure", `GraphQL ${logScope} errors: ${formatErrors(json.errors)}`);
    throw new Error(`GraphQL ${logScope} returned errors`);
  }

  if (!json?.data) {
    await logEvent(shopDomain, type, "failure", `GraphQL ${logScope} returned no data`);
    throw new Error(`GraphQL ${logScope} returned no data`);
  }

  return json.data;
}

export async function paginate<T>(
  admin: AdminApiClient,
  shopDomain: string,
  query: string,
  path: string[],
  variables?: Record<string, unknown>,
  limitPages = 10,
): Promise<T[]> {
  const records: T[] = [];
  let cursor: string | undefined;
  let hasNextPage = true;
  let guard = 0;

  while (hasNextPage && guard < limitPages) {
    const data = await executeGraphql<unknown>(
      admin,
      shopDomain,
      query,
      { variables: { ...variables, cursor } },
      path.join("."),
    );
    const container = extractContainer<T>(data, path);
    if (!container) {
      await logEvent(
        shopDomain,
        "sync",
        "failure",
        `Missing path ${path.join(".")} in GraphQL response`,
      );
      break;
    }
    const pageInfo = container?.pageInfo;
    const nodes = container?.nodes ?? container?.edges?.map((edge) => edge.node) ?? [];

    records.push(...nodes);
    hasNextPage = Boolean(pageInfo?.hasNextPage);
    cursor = pageInfo?.endCursor ?? undefined;
    guard += 1;
  }

  if (hasNextPage) {
    await logEvent(
      shopDomain,
      "sync",
      "failure",
      `Pagination guard triggered for ${path.join(".")}, stopped after ${guard} pages`,
    );
  }

  return records;
}
