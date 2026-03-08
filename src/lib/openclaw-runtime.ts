import fs from "fs";
import os from "os";
import path from "path";

const LEGACY_CONTAINER_OPENCLAW_DIR = "/home/node/.openclaw";

function firstExistingPath(candidates: Array<string | undefined>, fallback: string): string {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }
  return path.resolve(fallback);
}

function resolveOpenClawDir(): string {
  const homeOpenClawDir = path.join(os.homedir(), ".openclaw");
  return firstExistingPath(
    [process.env.OPENCLAW_DIR, homeOpenClawDir, LEGACY_CONTAINER_OPENCLAW_DIR],
    process.env.OPENCLAW_DIR || homeOpenClawDir
  );
}

export const OPENCLAW_DIR = resolveOpenClawDir();
export const OPENCLAW_WORKSPACE = resolveHostOpenClawPath(
  process.env.OPENCLAW_WORKSPACE || path.join(OPENCLAW_DIR, "workspace")
);
export const OPENCLAW_CONFIG = path.join(OPENCLAW_DIR, "openclaw.json");
export const OPENCLAW_MEDIA = path.join(OPENCLAW_DIR, "media");
export const OPENCLAW_CRON_DIR = path.join(OPENCLAW_DIR, "cron");
export const OPENCLAW_CRON_JOBS = path.join(OPENCLAW_CRON_DIR, "jobs.json");
export const OPENCLAW_AGENTS_DIR = path.join(OPENCLAW_DIR, "agents");

export interface OpenClawAgentConfig {
  id: string;
  name?: string | null;
  workspace?: string | null;
  model?: {
    primary?: string | null;
  } | null;
  ui?: {
    emoji?: string | null;
    color?: string | null;
  } | null;
  subagents?: {
    allowAgents?: string[];
  } | null;
}

export interface OpenClawConfig {
  gateway?: {
    port?: number;
    auth?: {
      token?: string;
    };
  };
  agents?: {
    defaults?: {
      workspace?: string;
      model?: {
        primary?: string;
      };
    };
    list?: OpenClawAgentConfig[];
  };
  channels?: {
    telegram?: {
      dmPolicy?: string;
      botToken?: string;
      accounts?: Record<
        string,
        {
          dmPolicy?: string;
          botToken?: string;
        }
      >;
    };
  };
}

export interface WorkspaceDescriptor {
  id: string;
  name: string;
  path: string;
  emoji: string;
  agentIds: string[];
  agentName?: string;
}

export function resolveHostOpenClawPath(input?: string | null): string {
  if (!input) {
    return path.resolve(path.join(OPENCLAW_DIR, "workspace"));
  }

  const resolved = path.resolve(input);
  if (
    resolved === LEGACY_CONTAINER_OPENCLAW_DIR ||
    resolved.startsWith(`${LEGACY_CONTAINER_OPENCLAW_DIR}${path.sep}`)
  ) {
    return path.join(OPENCLAW_DIR, path.relative(LEGACY_CONTAINER_OPENCLAW_DIR, resolved));
  }

  return resolved;
}

export function readOpenClawConfig(): OpenClawConfig {
  return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG, "utf-8")) as OpenClawConfig;
}

export function getDefaultModel(config: OpenClawConfig): string {
  return config.agents?.defaults?.model?.primary || "unknown";
}

export function getAgentWorkspace(
  agent: Pick<OpenClawAgentConfig, "workspace">,
  config: OpenClawConfig
): string {
  return resolveHostOpenClawPath(agent.workspace || config.agents?.defaults?.workspace || OPENCLAW_WORKSPACE);
}

export function getWorkspaceId(workspacePath: string): string {
  const resolved = resolveHostOpenClawPath(workspacePath);
  const basename = path.basename(resolved);
  return basename === "workspace" ? "workspace" : basename;
}

function getWorkspaceLabel(id: string): string {
  if (id === "workspace") {
    return "Main Workspace";
  }
  if (id.startsWith("workspace-")) {
    const label = id.slice("workspace-".length);
    return `${label.charAt(0).toUpperCase()}${label.slice(1)} Workspace`;
  }
  return id;
}

function readWorkspaceIdentity(workspacePath: string): { name?: string; emoji?: string } {
  const identityPath = path.join(workspacePath, "IDENTITY.md");
  if (!fs.existsSync(identityPath)) {
    return {};
  }

  try {
    const content = fs.readFileSync(identityPath, "utf-8");
    const nameMatch = content.match(/- \*\*Name:\*\* (.+)/);
    const emojiMatch = content.match(/- \*\*Emoji:\*\* (.+)/);
    return {
      name: nameMatch?.[1]?.trim(),
      emoji: emojiMatch?.[1]?.trim().split(/\s+/)[0],
    };
  } catch {
    return {};
  }
}

export function listWorkspaces(config: OpenClawConfig = readOpenClawConfig()): WorkspaceDescriptor[] {
  const workspaces = new Map<string, WorkspaceDescriptor>();
  const agents = config.agents?.list || [];

  for (const agent of agents) {
    const workspacePath = getAgentWorkspace(agent, config);
    const id = getWorkspaceId(workspacePath);
    const identity = readWorkspaceIdentity(workspacePath);
    const existing = workspaces.get(id);

    if (!existing) {
      workspaces.set(id, {
        id,
        name: getWorkspaceLabel(id),
        path: workspacePath,
        emoji: identity.emoji || (id === "workspace" ? "🦞" : "🤖"),
        agentIds: [agent.id],
        agentName: identity.name || agent.name || agent.id,
      });
      continue;
    }

    if (!existing.agentIds.includes(agent.id)) {
      existing.agentIds.push(agent.id);
    }
  }

  if (!workspaces.has("workspace") && fs.existsSync(OPENCLAW_WORKSPACE)) {
    const identity = readWorkspaceIdentity(OPENCLAW_WORKSPACE);
    workspaces.set("workspace", {
      id: "workspace",
      name: "Main Workspace",
      path: OPENCLAW_WORKSPACE,
      emoji: identity.emoji || "🦞",
      agentIds: ["main"],
      agentName: identity.name || "main",
    });
  }

  return Array.from(workspaces.values()).sort((a, b) => {
    if (a.id === "workspace") return -1;
    if (b.id === "workspace") return 1;
    return a.name.localeCompare(b.name);
  });
}

export function resolveWorkspaceId(
  workspaceId: string | null | undefined,
  config: OpenClawConfig = readOpenClawConfig()
): string | null {
  if (!workspaceId || workspaceId === "workspace") {
    return OPENCLAW_WORKSPACE;
  }

  const match = listWorkspaces(config).find((workspace) => workspace.id === workspaceId);
  if (match) {
    return match.path;
  }

  const candidate = path.resolve(OPENCLAW_DIR, workspaceId);
  return isPathInsideBase(candidate, OPENCLAW_DIR) ? candidate : null;
}

export function isPathInsideBase(targetPath: string, basePath: string): boolean {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(targetPath);
  return (
    resolvedTarget === resolvedBase ||
    resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
  );
}

export function findSessionTranscriptPath(sessionId: string): string | null {
  if (!fs.existsSync(OPENCLAW_AGENTS_DIR)) {
    return null;
  }

  const agentDirs = fs.readdirSync(OPENCLAW_AGENTS_DIR, { withFileTypes: true });
  for (const entry of agentDirs) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(OPENCLAW_AGENTS_DIR, entry.name, "sessions", `${sessionId}.jsonl`);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function detectComposeFile(): string | null {
  const candidates = [
    process.env.OPENCLAW_COMPOSE_FILE,
    path.join(os.homedir(), "openclaw", "docker-compose.yml"),
    path.join(os.homedir(), "openclaw", "compose.yaml"),
    path.join(os.homedir(), "openclaw", "compose.yml"),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return path.resolve(candidate);
    }
  }

  return null;
}
