import { runBinaryJson, tryRunDockerCompose } from "@/lib/openclaw-cli";
import {
  detectComposeFile,
  listWorkspaces,
  readOpenClawConfig,
  type OpenClawConfig,
} from "@/lib/openclaw-runtime";

type Mem0PluginConfig = {
  baseUrl?: string;
  userId?: string;
  autoRecall?: boolean;
  autoCapture?: boolean;
  allowAgents?: string[];
  agentBaseUrls?: Record<string, string>;
};

type OpenClawConfigWithPlugins = OpenClawConfig & {
  plugins?: {
    slots?: {
      memory?: string;
    };
    entries?: {
      mem0?: {
        enabled?: boolean;
        config?: Mem0PluginConfig;
      };
    };
  };
};

interface Mem0HealthPayload {
  status?: string;
  memory_ready?: boolean;
  graph_enabled?: boolean;
  defaults?: {
    add_infer?: boolean;
    search_rerank?: boolean;
  };
}

interface DockerFetchEnvelope {
  ok: boolean;
  status: number;
  body?: string;
  error?: string;
}

interface NormalizedSearchPayload {
  results: unknown[];
  relations: unknown[];
}

export interface MemoryServiceHealth {
  baseUrl: string;
  serviceName: string | null;
  reachable: boolean;
  statusCode: number | null;
  composeStatus: string | null;
  healthStatus: string | null;
  memoryReady: boolean | null;
  graphEnabled: boolean | null;
  addInferDefault: boolean | null;
  searchRerankDefault: boolean | null;
  error?: string | null;
}

export interface WorkspaceMemoryBackend {
  workspaceId: string;
  workspaceName: string;
  workspaceEmoji: string;
  workspacePath: string;
  agentIds: string[];
  agentName?: string;
  primaryAgentId: string | null;
  baseUrl: string | null;
  serviceName: string | null;
  backendLabel: string;
  graphEnabled: boolean;
  neo4jEnabled: boolean;
  health: MemoryServiceHealth | null;
}

export interface MemoryStackSnapshot {
  pluginEnabled: boolean;
  pluginSlot: string | null;
  userId: string | null;
  autoRecall: boolean;
  autoCapture: boolean;
  neo4jStatus: string | null;
  workspaces: WorkspaceMemoryBackend[];
}

export interface MemoryGraphNode {
  id: string;
  label: string;
}

export interface MemoryGraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface MemorySearchResultSnippet {
  id: string;
  text: string;
  score: number | null;
}

export interface MemoryGraphSnapshot {
  workspaceId: string;
  workspaceName: string;
  query: string;
  backendLabel: string;
  serviceName: string | null;
  graphEnabled: boolean;
  rawResultsCount: number;
  rawRelationsCount: number;
  nodes: MemoryGraphNode[];
  edges: MemoryGraphEdge[];
  results: MemorySearchResultSnippet[];
}

function normalizeBaseUrl(url: string | undefined | null): string | null {
  const trimmed = url?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

function getMem0Config(config: OpenClawConfigWithPlugins): Mem0PluginConfig | null {
  return config.plugins?.entries?.mem0?.config || null;
}

function getServiceName(baseUrl: string | null): string | null {
  if (!baseUrl) {
    return null;
  }

  try {
    return new URL(baseUrl).hostname || null;
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inferComposeStatus(table: string | null, serviceName: string | null): string | null {
  if (!table || !serviceName) {
    return null;
  }

  const servicePattern = new RegExp(`\\s${escapeRegExp(serviceName)}\\s+`);
  const line = table
    .split("\n")
    .find((entry) => servicePattern.test(entry));

  if (!line) {
    return null;
  }
  if (line.includes("healthy")) {
    return "healthy";
  }
  if (line.includes("Up")) {
    return "up";
  }
  if (line.includes("Exited")) {
    return "exited";
  }
  return line.trim();
}

function runGatewayFetch<T>(
  composeFile: string,
  url: string,
  options?: {
    method?: "GET" | "POST";
    body?: unknown;
  },
  timeout = 10000
): { ok: boolean; status: number; payload?: T; error?: string } {
  const script = `
const request = {
  url: ${JSON.stringify(url)},
  method: ${JSON.stringify(options?.method || "GET")},
  body: ${JSON.stringify(options?.body ? JSON.stringify(options.body) : null)},
};
const headers = { "x-api-key": process.env.MEM0_API_KEY || "" };
if (request.body) headers["content-type"] = "application/json";
fetch(request.url, {
  method: request.method,
  headers,
  ...(request.body ? { body: request.body } : {}),
}).then(async (res) => {
  const body = await res.text();
  console.log(JSON.stringify({ ok: res.ok, status: res.status, body }));
}).catch((error) => {
  console.log(JSON.stringify({ ok: false, status: 0, error: String(error) }));
});
`;

  const envelope = runBinaryJson<DockerFetchEnvelope>(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "exec",
      "-T",
      "openclaw-gateway",
      "node",
      "-e",
      script,
    ],
    timeout
  );

  if (!envelope.ok) {
    return {
      ok: false,
      status: envelope.status,
      error: envelope.error || `Request failed with status ${envelope.status}`,
    };
  }

  try {
    return {
      ok: true,
      status: envelope.status,
      payload: envelope.body ? (JSON.parse(envelope.body) as T) : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      status: envelope.status,
      error: error instanceof Error ? error.message : "Failed to parse mem0 response",
    };
  }
}

function readEntityString(value: unknown, depth = 0): string | null {
  if (depth > 2 || value == null) {
    return null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const resolved = readEntityString(item, depth + 1);
      if (resolved) {
        return resolved;
      }
    }
    return null;
  }
  if (typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    for (const key of ["name", "label", "id", "entity", "title", "text", "value"]) {
      const resolved = readEntityString(candidate[key], depth + 1);
      if (resolved) {
        return resolved;
      }
    }
  }
  return null;
}

function normalizeSearchPayload(payload: unknown): NormalizedSearchPayload {
  const data = (payload || {}) as Record<string, unknown>;
  const results = Array.isArray(data.results)
    ? data.results
    : Array.isArray((data.results as Record<string, unknown> | undefined)?.results)
      ? ((data.results as Record<string, unknown>).results as unknown[])
      : [];
  const relations = Array.isArray(data.relations)
    ? data.relations
    : Array.isArray((data.results as Record<string, unknown> | undefined)?.relations)
      ? ((data.results as Record<string, unknown>).relations as unknown[])
      : [];

  return { results, relations };
}

function normalizeGraph(relations: unknown[]): { nodes: MemoryGraphNode[]; edges: MemoryGraphEdge[] } {
  const nodeMap = new Map<string, MemoryGraphNode>();
  const edges: MemoryGraphEdge[] = [];

  relations.forEach((relation, index) => {
    const item = (relation || {}) as Record<string, unknown>;
    const source = readEntityString(
      item.source ?? item.from ?? item.subject ?? item.entity1 ?? item.node1 ?? item.start
    );
    const target = readEntityString(
      item.destination ?? item.target ?? item.to ?? item.object ?? item.entity2 ?? item.node2 ?? item.end
    );
    const label =
      readEntityString(item.relationship ?? item.relation ?? item.type ?? item.predicate ?? item.label) ||
      "related";

    if (!source || !target) {
      return;
    }

    if (!nodeMap.has(source)) {
      nodeMap.set(source, { id: source, label: source });
    }
    if (!nodeMap.has(target)) {
      nodeMap.set(target, { id: target, label: target });
    }

    edges.push({
      id: `edge-${index}-${source}-${target}-${label}`,
      source,
      target,
      label,
    });
  });

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

function normalizeResults(results: unknown[]): MemorySearchResultSnippet[] {
  return results
    .map((result, index) => {
      const item = (result || {}) as Record<string, unknown>;
      const text =
        readEntityString(item.memory) ||
        readEntityString(item.text) ||
        readEntityString(item.content) ||
        readEntityString(item.summary) ||
        readEntityString(item.value);

      if (!text) {
        return null;
      }

      const score =
        typeof item.score === "number"
          ? item.score
          : typeof item.similarity === "number"
            ? item.similarity
            : null;

      return {
        id: readEntityString(item.id) || `result-${index}`,
        text,
        score,
      };
    })
    .filter((item): item is MemorySearchResultSnippet => Boolean(item));
}

function buildWorkspaceBackends(
  config: OpenClawConfigWithPlugins,
  healthByUrl: Map<string, MemoryServiceHealth>,
  composeStatusTable: string | null
): WorkspaceMemoryBackend[] {
  const mem0Config = getMem0Config(config);
  const workspaces = listWorkspaces(config);

  return workspaces.map((workspace) => {
    const primaryAgentId = workspace.agentIds[0] || null;
    const baseUrls = Array.from(
      new Set(
        workspace.agentIds
          .map((agentId) => normalizeBaseUrl(mem0Config?.agentBaseUrls?.[agentId] || mem0Config?.baseUrl))
          .filter((url): url is string => Boolean(url))
      )
    );

    const baseUrl = baseUrls.length === 1 ? baseUrls[0] : baseUrls[0] || null;
    const serviceName = getServiceName(baseUrl);
    const health = baseUrl ? healthByUrl.get(baseUrl) || null : null;
    const graphEnabled = health?.graphEnabled ?? serviceName === "mem0-server";

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      workspaceEmoji: workspace.emoji,
      workspacePath: workspace.path,
      agentIds: workspace.agentIds,
      agentName: workspace.agentName,
      primaryAgentId,
      baseUrl,
      serviceName,
      backendLabel: graphEnabled ? "mem0 + Neo4j GraphRAG" : "mem0 (vector only)",
      graphEnabled,
      neo4jEnabled: graphEnabled,
      health: health
        ? {
            ...health,
            composeStatus: health.composeStatus || inferComposeStatus(composeStatusTable, serviceName),
          }
        : null,
    };
  });
}

export function getMemoryStackSnapshot(): MemoryStackSnapshot {
  const config = readOpenClawConfig() as OpenClawConfigWithPlugins;
  const mem0Config = getMem0Config(config);
  const composeFile = detectComposeFile();
  const distinctBaseUrls = Array.from(
    new Set(
      Object.values(mem0Config?.agentBaseUrls || {})
        .concat(mem0Config?.baseUrl || [])
        .map((url) => normalizeBaseUrl(url))
        .filter((url): url is string => Boolean(url))
    )
  );

  const composeStatusTable = composeFile
    ? tryRunDockerCompose(composeFile, ["ps", "--all", "mem0-server", "mem0-server-simple", "neo4j-mem0"], 10000)
    : null;
  const healthByUrl = new Map<string, MemoryServiceHealth>();

  for (const baseUrl of distinctBaseUrls) {
    const serviceName = getServiceName(baseUrl);

    if (!composeFile) {
      healthByUrl.set(baseUrl, {
        baseUrl,
        serviceName,
        reachable: false,
        statusCode: null,
        composeStatus: null,
        healthStatus: null,
        memoryReady: null,
        graphEnabled: null,
        addInferDefault: null,
        searchRerankDefault: null,
        error: "Compose file not found",
      });
      continue;
    }

    try {
      const result = runGatewayFetch<Mem0HealthPayload>(composeFile, `${baseUrl}/health`);
      healthByUrl.set(baseUrl, {
        baseUrl,
        serviceName,
        reachable: result.ok,
        statusCode: result.status || null,
        composeStatus: inferComposeStatus(composeStatusTable, serviceName),
        healthStatus: result.payload?.status || null,
        memoryReady: result.payload?.memory_ready ?? null,
        graphEnabled: result.payload?.graph_enabled ?? null,
        addInferDefault: result.payload?.defaults?.add_infer ?? null,
        searchRerankDefault: result.payload?.defaults?.search_rerank ?? null,
        error: result.error || null,
      });
    } catch (error) {
      healthByUrl.set(baseUrl, {
        baseUrl,
        serviceName,
        reachable: false,
        statusCode: null,
        composeStatus: inferComposeStatus(composeStatusTable, serviceName),
        healthStatus: null,
        memoryReady: null,
        graphEnabled: null,
        addInferDefault: null,
        searchRerankDefault: null,
        error: error instanceof Error ? error.message : "Failed to query mem0 health",
      });
    }
  }

  return {
    pluginEnabled: config.plugins?.entries?.mem0?.enabled !== false,
    pluginSlot: config.plugins?.slots?.memory || null,
    userId: mem0Config?.userId || null,
    autoRecall: mem0Config?.autoRecall !== false,
    autoCapture: mem0Config?.autoCapture === true,
    neo4jStatus: inferComposeStatus(composeStatusTable, "neo4j-mem0"),
    workspaces: buildWorkspaceBackends(config, healthByUrl, composeStatusTable),
  };
}

export function getMemoryGraphSnapshot(params: {
  workspaceId: string;
  query: string;
  limit?: number;
}): MemoryGraphSnapshot {
  const query = params.query.trim();
  if (!query) {
    throw new Error("Query is required");
  }

  const stack = getMemoryStackSnapshot();
  const workspace = stack.workspaces.find((entry) => entry.workspaceId === params.workspaceId);
  if (!workspace) {
    throw new Error("Workspace not found");
  }
  if (!workspace.baseUrl || !workspace.primaryAgentId) {
    throw new Error("Workspace is not mapped to a mem0 backend");
  }
  if (!workspace.graphEnabled) {
    return {
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.workspaceName,
      query,
      backendLabel: workspace.backendLabel,
      serviceName: workspace.serviceName,
      graphEnabled: false,
      rawResultsCount: 0,
      rawRelationsCount: 0,
      nodes: [],
      edges: [],
      results: [],
    };
  }

  const composeFile = detectComposeFile();
  if (!composeFile) {
    throw new Error("OpenClaw compose file not found");
  }

  const result = runGatewayFetch<Record<string, unknown>>(
    composeFile,
    `${workspace.baseUrl}/memories/search`,
    {
      method: "POST",
      body: {
        query,
        user_id: stack.userId || "default",
        agent_id: workspace.primaryAgentId,
        limit: params.limit || 12,
      },
    },
    20000
  );

  if (!result.ok) {
    throw new Error(result.error || "Failed to query mem0 graph");
  }

  const normalized = normalizeSearchPayload(result.payload);
  const graph = normalizeGraph(normalized.relations);

  return {
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    query,
    backendLabel: workspace.backendLabel,
    serviceName: workspace.serviceName,
    graphEnabled: true,
    rawResultsCount: normalized.results.length,
    rawRelationsCount: normalized.relations.length,
    nodes: graph.nodes,
    edges: graph.edges,
    results: normalizeResults(normalized.results),
  };
}
