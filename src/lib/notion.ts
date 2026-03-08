const NOTION_API_BASE_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2025-09-03";
const NOTION_QUERY_PAGE_SIZE = 100;
const NOTION_QUERY_MAX_PAGES = 10;
const NOTION_UUID_PATTERN = /[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/gi;
const BOARD_PROPERTY_LABEL_HINTS = ["status", "stage", "phase", "pipeline", "progress", "state"];

type BoardPropertyType = "status" | "select" | "multi_select" | "rich_text" | "title";

type NotionApiErrorResponse = {
  message?: string;
  code?: string;
};

type NotionStatusOption = {
  id?: string;
  name?: string;
  color?: string;
};

type NotionPropertySchema = {
  id?: string;
  name?: string;
  type?: string;
  status?: {
    options?: NotionStatusOption[];
  };
  select?: {
    options?: NotionStatusOption[];
  };
  multi_select?: {
    options?: NotionStatusOption[];
  };
};

type NotionDataSourceResponse = {
  id?: string;
  name?: string;
  url?: string;
  properties?: Record<string, NotionPropertySchema>;
};

type NotionDatabaseResponse = {
  id?: string;
  url?: string;
  data_sources?: Array<{
    id?: string;
    name?: string;
  }>;
};

type NotionPagePropertyValue = {
  id?: string;
  type?: string;
  status?: {
    name?: string;
    color?: string;
  } | null;
  select?: {
    name?: string;
    color?: string;
  } | null;
  multi_select?: Array<{
    name?: string;
    color?: string;
  }> | null;
  rich_text?: Array<{
    plain_text?: string;
  }> | null;
  title?: Array<{
    plain_text?: string;
  }> | null;
};

type NotionQueryPage = {
  last_edited_time?: string;
  properties?: Record<string, NotionPagePropertyValue>;
};

type NotionQueryResponse = {
  results?: NotionQueryPage[];
  has_more?: boolean;
  next_cursor?: string | null;
};

export interface NotionStatusBucket {
  name: string;
  color: string | null;
  count: number;
  expected: boolean;
}

export interface NotionBoardSnapshot {
  available: boolean;
  source: "data_source" | "database" | null;
  dataSourceId: string | null;
  schemaName: string | null;
  propertyName: string | null;
  propertyType: BoardPropertyType | null;
  totalPages: number | null;
  lastEditedTime: string | null;
  statusOptions: string[];
  buckets: NotionStatusBucket[];
  missingExpectedStages: string[];
  extraStages: string[];
  aligned: boolean;
  error: string | null;
}

function defaultBoardSnapshot(): NotionBoardSnapshot {
  return {
    available: false,
    source: null,
    dataSourceId: null,
    schemaName: null,
    propertyName: null,
    propertyType: null,
    totalPages: null,
    lastEditedTime: null,
    statusOptions: [],
    buckets: [],
    missingExpectedStages: [],
    extraStages: [],
    aligned: false,
    error: null,
  };
}

function normalizeStageName(value: string): string {
  return value.trim().toLowerCase();
}

function formatUuid(value: string): string | null {
  const compact = value.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(compact)) {
    return null;
  }

  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
}

function extractUuidFromString(value: string): string | null {
  const matches = value.match(NOTION_UUID_PATTERN);
  if (!matches?.length) {
    return null;
  }

  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const formatted = formatUuid(matches[index] || "");
    if (formatted) {
      return formatted;
    }
  }

  return null;
}

export function extractNotionResourceId(value: string | null | undefined): string | null {
  const input = String(value || "").trim();
  if (!input) {
    return null;
  }

  const direct = formatUuid(input);
  if (direct) {
    return direct;
  }

  try {
    const url = new URL(input);
    const segments = decodeURIComponent(url.pathname).split("/").filter(Boolean).reverse();

    for (const segment of segments) {
      const extracted = extractUuidFromString(segment);
      if (extracted) {
        return extracted;
      }
    }
  } catch {
    // Input is not a URL; fall back to generic extraction.
  }

  return extractUuidFromString(input);
}

function parseApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const error = payload as NotionApiErrorResponse;
  if (error.message) {
    return error.message;
  }
  if (error.code) {
    return error.code;
  }

  return null;
}

function propertyHasLabelHint(property: NotionPropertySchema): boolean {
  const label = String(property.name || "").trim().toLowerCase();
  return BOARD_PROPERTY_LABEL_HINTS.some((hint) => label === hint || label.includes(hint));
}

function boardPropertyLabelScore(property: NotionPropertySchema): number {
  const label = String(property.name || "").trim().toLowerCase();
  if (!label) {
    return 0;
  }

  if (label === "status") {
    return 100;
  }
  if (label === "stage") {
    return 95;
  }
  if (label === "phase") {
    return 90;
  }
  if (label === "state") {
    return 85;
  }
  if (label === "pipeline") {
    return 80;
  }
  if (label === "progress") {
    return 75;
  }
  if (label.endsWith(" status")) {
    return 60;
  }
  if (label.endsWith(" stage")) {
    return 55;
  }
  if (label.includes("status")) {
    return 40;
  }
  if (label.includes("stage")) {
    return 35;
  }
  if (label.includes("phase")) {
    return 30;
  }
  if (label.includes("state")) {
    return 25;
  }
  if (label.includes("pipeline")) {
    return 20;
  }
  if (label.includes("progress")) {
    return 15;
  }

  return 0;
}

function summarizeProperties(properties: Record<string, NotionPropertySchema> | undefined): string {
  if (!properties) {
    return "none";
  }

  const summary = Object.values(properties)
    .map((property) => `${property.name || "Unnamed"} (${property.type || "unknown"})`)
    .slice(0, 8);

  return summary.length > 0 ? summary.join(", ") : "none";
}

async function notionRequest<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${NOTION_API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    let message = `Notion returned ${response.status}`;

    try {
      const payload = (await response.json()) as NotionApiErrorResponse;
      message = parseApiError(payload) || message;
    } catch {
      // Keep the HTTP status fallback.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

async function resolveDataSource(
  token: string,
  databaseOrDataSourceId: string
): Promise<{
  source: "data_source" | "database";
  dataSource: NotionDataSourceResponse;
}> {
  try {
    const dataSource = await notionRequest<NotionDataSourceResponse>(
      token,
      `/data_sources/${databaseOrDataSourceId}`
    );

    return {
      source: "data_source",
      dataSource,
    };
  } catch {
    const database = await notionRequest<NotionDatabaseResponse>(token, `/databases/${databaseOrDataSourceId}`);
    const primaryDataSource = database.data_sources?.[0];

    if (!primaryDataSource?.id) {
      throw new Error("No data sources found under the configured Notion database.");
    }

    const dataSource = await notionRequest<NotionDataSourceResponse>(token, `/data_sources/${primaryDataSource.id}`);

    return {
      source: "database",
      dataSource,
    };
  }
}

function findBoardProperty(
  properties: Record<string, NotionPropertySchema> | undefined
): { name: string; property: NotionPropertySchema; type: BoardPropertyType } | null {
  if (!properties) {
    return null;
  }

  const entries = Object.entries(properties);
  const findByType = (type: BoardPropertyType, requireHint: boolean) => {
    const candidates = entries
      .filter(([, property]) => property.type === type && (!requireHint || propertyHasLabelHint(property)))
      .sort((left, right) => {
        const leftScore = boardPropertyLabelScore(left[1]);
        const rightScore = boardPropertyLabelScore(right[1]);

        if (leftScore !== rightScore) {
          return rightScore - leftScore;
        }

        return String(left[1].name || left[0]).length - String(right[1].name || right[0]).length;
      });

    return candidates[0];
  };

  for (const type of ["status", "select", "multi_select"] as const) {
    const hinted = findByType(type, true);
    if (hinted) {
      return { name: hinted[0], property: hinted[1], type };
    }
  }

  for (const type of ["status", "select", "multi_select"] as const) {
    const first = findByType(type, false);
    if (first) {
      return { name: first[0], property: first[1], type };
    }
  }

  for (const type of ["rich_text", "title"] as const) {
    const hinted = findByType(type, true);
    if (hinted) {
      return { name: hinted[0], property: hinted[1], type };
    }
  }

  return null;
}

function findPagePropertyValue(
  pageProperties: Record<string, NotionPagePropertyValue> | undefined,
  propertyName: string,
  propertyId: string | undefined,
  propertyType: BoardPropertyType
): NotionPagePropertyValue | null {
  if (!pageProperties) {
    return null;
  }

  const direct = pageProperties[propertyName];
  if (direct?.type === propertyType || direct?.id === propertyId) {
    return direct;
  }

  return (
    Object.values(pageProperties).find(
      (property) =>
        property?.type === propertyType && (propertyId ? property.id === propertyId : true)
    ) || null
  );
}

function collectStatusOptions(property: NotionPropertySchema, propertyType: BoardPropertyType): NotionStatusOption[] {
  const options =
    propertyType === "status"
      ? property.status?.options
      : propertyType === "select"
        ? property.select?.options
        : propertyType === "multi_select"
          ? property.multi_select?.options
          : [];
  return Array.isArray(options) ? options : [];
}

function extractPropertySelections(
  propertyValue: NotionPagePropertyValue | null,
  propertyType: BoardPropertyType
): Array<{ name: string; color: string | null }> {
  if (!propertyValue) {
    return [];
  }

  if (propertyType === "status" && propertyValue.status?.name?.trim()) {
    return [{ name: propertyValue.status.name.trim(), color: propertyValue.status.color || null }];
  }

  if (propertyType === "select" && propertyValue.select?.name?.trim()) {
    return [{ name: propertyValue.select.name.trim(), color: propertyValue.select.color || null }];
  }

  if (propertyType === "multi_select" && Array.isArray(propertyValue.multi_select)) {
    return propertyValue.multi_select
      .map((entry) => ({
        name: entry.name?.trim() || "",
        color: entry.color || null,
      }))
      .filter((entry) => Boolean(entry.name));
  }

  if (propertyType === "rich_text" && Array.isArray(propertyValue.rich_text)) {
    const name = propertyValue.rich_text.map((entry) => entry.plain_text || "").join("").trim();
    return name ? [{ name, color: null }] : [];
  }

  if (propertyType === "title" && Array.isArray(propertyValue.title)) {
    const name = propertyValue.title.map((entry) => entry.plain_text || "").join("").trim();
    return name ? [{ name, color: null }] : [];
  }

  return [];
}

export async function getNotionBoardSnapshot(input: {
  token: string;
  databaseId: string;
  expectedStages: string[];
}): Promise<NotionBoardSnapshot> {
  const snapshot = defaultBoardSnapshot();

  try {
    const resolved = await resolveDataSource(input.token, input.databaseId);
    const dataSource = resolved.dataSource;
    const boardProperty = findBoardProperty(dataSource.properties);

    snapshot.source = resolved.source;
    snapshot.dataSourceId = dataSource.id || null;
    snapshot.schemaName = dataSource.name || null;

    if (!boardProperty) {
      snapshot.error = `No stage-like Notion property was found on the configured board. Available properties: ${summarizeProperties(dataSource.properties)}.`;
      return snapshot;
    }

    const propertyName = boardProperty.property.name || boardProperty.name;
    const propertyId = boardProperty.property.id;
    const statusOptions = collectStatusOptions(boardProperty.property, boardProperty.type)
      .map((option) => option.name?.trim())
      .filter((name): name is string => Boolean(name));
    const bucketMap = new Map<string, NotionStatusBucket>();

    snapshot.propertyName = propertyName;
    snapshot.propertyType = boardProperty.type;
    const expectedStageSet = new Set(input.expectedStages.map(normalizeStageName));

    collectStatusOptions(boardProperty.property, boardProperty.type).forEach((option) => {
      const name = option.name?.trim();
      if (!name) {
        return;
      }

      bucketMap.set(name, {
        name,
        color: option.color || null,
        count: 0,
        expected: expectedStageSet.has(normalizeStageName(name)),
      });
    });

    let totalPages = 0;
    let lastEditedTime: string | null = null;
    let nextCursor: string | null = null;
    let pageCount = 0;
    const dataSourceId = snapshot.dataSourceId;

    if (!dataSourceId) {
      snapshot.error = "The configured Notion board resolved without a data source ID.";
      return snapshot;
    }

    do {
      const filterProperty = encodeURIComponent(propertyId || propertyName);
      const querySuffix = `?filter_properties[]=${filterProperty}`;
      const payload: NotionQueryResponse = await notionRequest<NotionQueryResponse>(
        input.token,
        `/data_sources/${dataSourceId}/query${querySuffix}`,
        {
          method: "POST",
          body: JSON.stringify({
            page_size: NOTION_QUERY_PAGE_SIZE,
            start_cursor: nextCursor || undefined,
          }),
        }
      );

      const results = Array.isArray(payload.results) ? payload.results : [];

      results.forEach((page) => {
        totalPages += 1;

        if (page.last_edited_time && (!lastEditedTime || page.last_edited_time > lastEditedTime)) {
          lastEditedTime = page.last_edited_time;
        }

        const propertyValue = findPagePropertyValue(page.properties, propertyName, propertyId, boardProperty.type);
        const selections = extractPropertySelections(propertyValue, boardProperty.type);

        selections.forEach((selection) => {
          const bucket = bucketMap.get(selection.name);
          if (bucket) {
            bucket.count += 1;
            if (!bucket.color && selection.color) {
              bucket.color = selection.color;
            }
            return;
          }

          bucketMap.set(selection.name, {
            name: selection.name,
            color: selection.color,
            count: 1,
            expected: expectedStageSet.has(normalizeStageName(selection.name)),
          });
        });
      });

      nextCursor = payload.has_more ? payload.next_cursor || null : null;
      pageCount += 1;
    } while (nextCursor && pageCount < NOTION_QUERY_MAX_PAGES);

    snapshot.available = true;
    snapshot.totalPages = totalPages;
    snapshot.lastEditedTime = lastEditedTime;
    snapshot.statusOptions =
      statusOptions.length > 0
        ? statusOptions
        : Array.from(bucketMap.values())
            .map((bucket) => bucket.name)
            .sort((left, right) => left.localeCompare(right));
    snapshot.buckets = Array.from(bucketMap.values()).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
    snapshot.missingExpectedStages = [];
    snapshot.extraStages = [];
    snapshot.aligned = true;

    if (nextCursor) {
      snapshot.error = `Status snapshot capped at ${NOTION_QUERY_PAGE_SIZE * NOTION_QUERY_MAX_PAGES} pages for performance.`;
    }

    return snapshot;
  } catch (error) {
    snapshot.error = error instanceof Error ? error.message : "Failed to read Notion pipeline board.";
    return snapshot;
  }
}
