import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { tryRunOpenClawJson } from "@/lib/openclaw-cli";
import {
  getAgentWorkspace,
  getDefaultModel,
  readOpenClawConfig,
  type OpenClawAgentConfig,
} from "@/lib/openclaw-runtime";

export const dynamic = "force-dynamic";

interface Agent {
  id: string;
  name?: string;
  emoji: string;
  color: string;
  model: string;
  workspace: string;
  dmPolicy?: string;
  allowAgents?: string[];
  allowAgentsDetails?: Array<{ id: string; name: string; emoji: string; color: string }>;
  botToken?: string;
  status: "online" | "offline";
  lastActivity?: string;
  activeSessions: number;
}

interface RawSession {
  key: string;
  agentId?: string;
}

const DEFAULT_AGENT_CONFIG: Record<string, { emoji: string; color: string; name?: string }> = {
  main: {
    emoji: process.env.NEXT_PUBLIC_AGENT_EMOJI || "🦞",
    color: "#ff6b35",
    name: process.env.NEXT_PUBLIC_AGENT_NAME || "Main",
  },
  coding: { emoji: "🧩", color: "#60a5fa", name: "Coding" },
  planner: { emoji: "🗺️", color: "#f59e0b", name: "Planner" },
  implementer: { emoji: "🛠️", color: "#4ade80", name: "Implementer" },
  reviewer: { emoji: "🔍", color: "#a78bfa", name: "Reviewer" },
};

function getAgentDisplayInfo(agentId: string, agentConfig: OpenClawAgentConfig) {
  const defaults = DEFAULT_AGENT_CONFIG[agentId];
  return {
    emoji: agentConfig.ui?.emoji || defaults?.emoji || "🤖",
    color: agentConfig.ui?.color || defaults?.color || "#666666",
    name: agentConfig.name || defaults?.name || agentId,
  };
}

function getSessionCounts() {
  const counts: Record<string, number> = {};
  const data = tryRunOpenClawJson<{ sessions?: RawSession[] }>(["sessions", "--json", "--all-agents"]);

  for (const session of data?.sessions || []) {
    const parsedAgentId = session.agentId || session.key.split(":")[1];
    if (!parsedAgentId) {
      continue;
    }
    counts[parsedAgentId] = (counts[parsedAgentId] || 0) + 1;
  }

  return counts;
}

function getLatestMemoryTimestamp(workspace: string): string | undefined {
  const memoryPath = path.join(workspace, "memory");
  if (!fs.existsSync(memoryPath)) {
    return undefined;
  }

  try {
    const latestFile = fs
      .readdirSync(memoryPath)
      .filter((file) => file.endsWith(".md"))
      .sort()
      .reverse()[0];

    if (!latestFile) {
      return undefined;
    }

    return fs.statSync(path.join(memoryPath, latestFile)).mtime.toISOString();
  } catch {
    return undefined;
  }
}

export async function GET() {
  try {
    const config = readOpenClawConfig();
    const defaultModel = getDefaultModel(config);
    const sessionCounts = getSessionCounts();

    const agents: Agent[] = (config.agents?.list || []).map((agent) => {
      const agentInfo = getAgentDisplayInfo(agent.id, agent);
      const workspace = getAgentWorkspace(agent, config);
      const lastActivity = getLatestMemoryTimestamp(workspace);
      const activeSessions = sessionCounts[agent.id] || 0;
      const lastActivityMs = lastActivity ? new Date(lastActivity).getTime() : 0;
      const isRecentlyActive = lastActivityMs > 0 && Date.now() - lastActivityMs < 15 * 60 * 1000;
      const telegramAccount = config.channels?.telegram?.accounts?.[agent.id];
      const allowAgents = agent.subagents?.allowAgents || [];

      const allowAgentsDetails = allowAgents.map((subagentId) => {
        const subagentConfig = (config.agents?.list || []).find((candidate) => candidate.id === subagentId);
        const subagentInfo = getAgentDisplayInfo(subagentId, subagentConfig || { id: subagentId });
        return {
          id: subagentId,
          name: subagentInfo.name,
          emoji: subagentInfo.emoji,
          color: subagentInfo.color,
        };
      });

      return {
        id: agent.id,
        name: agentInfo.name,
        emoji: agentInfo.emoji,
        color: agentInfo.color,
        model: agent.model?.primary || defaultModel,
        workspace,
        dmPolicy: telegramAccount?.dmPolicy || config.channels?.telegram?.dmPolicy || "pairing",
        allowAgents,
        allowAgentsDetails,
        botToken: telegramAccount?.botToken ? "configured" : undefined,
        status: activeSessions > 0 || isRecentlyActive ? "online" : "offline",
        lastActivity,
        activeSessions,
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Error reading agents:", error);
    return NextResponse.json({ error: "Failed to load agents" }, { status: 500 });
  }
}
