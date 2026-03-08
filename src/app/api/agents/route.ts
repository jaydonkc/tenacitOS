import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { gatewayGet, gatewayRpc } from "@/lib/openclaw-gateway";

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

const DEFAULT_AGENT_CONFIG: Record<string, { emoji: string; color: string; name?: string }> = {
  main: {
    emoji: process.env.NEXT_PUBLIC_AGENT_EMOJI || "🦞",
    color: "#ff6b35",
    name: process.env.NEXT_PUBLIC_AGENT_NAME || "OpenClaw Main",
  },
};

function getAgentDisplayInfo(agentId: string, agentConfig: any): { emoji: string; color: string; name: string } {
  const defaults = DEFAULT_AGENT_CONFIG[agentId];
  return {
    emoji: agentConfig?.ui?.emoji || defaults?.emoji || "🤖",
    color: agentConfig?.ui?.color || defaults?.color || "#666666",
    name: agentConfig?.name || defaults?.name || agentId,
  };
}

async function getGatewaySessionCounts() {
  const counts: Record<string, number> = {};
  const rpc = await gatewayRpc<{ sessions?: Array<{ key: string }> }>("sessions.list", {});
  const rest = rpc || (await gatewayGet<{ sessions?: Array<{ key: string }> }>(["/api/sessions", "/sessions"]));
  for (const s of rest?.sessions || []) {
    const key = s.key || "";
    const parts = key.split(":");
    if (parts[0] === "agent" && parts[1]) {
      const agentId = parts[1];
      counts[agentId] = (counts[agentId] || 0) + 1;
    }
  }
  return counts;
}

export async function GET() {
  try {
    const configPath = (process.env.OPENCLAW_DIR || "/home/node/.openclaw") + "/openclaw.json";
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const sessionCounts: Record<string, number> = await getGatewaySessionCounts().catch(() => ({} as Record<string, number>));

    const agents: Agent[] = config.agents.list.map((agent: any) => {
      const agentInfo = getAgentDisplayInfo(agent.id, agent);
      const telegramAccount = config.channels?.telegram?.accounts?.[agent.id];
      const allowAgents = agent.subagents?.allowAgents || [];

      let lastActivity: string | undefined = undefined;
      let status: "online" | "offline" = "offline";
      try {
        const today = new Date().toISOString().split("T")[0];
        const memoryFile = join(agent.workspace, "memory", `${today}.md`);
        const stat = require("fs").statSync(memoryFile);
        lastActivity = stat.mtime.toISOString();
        status = Date.now() - stat.mtime.getTime() < 5 * 60 * 1000 ? "online" : "offline";
      } catch {}

      const allowAgentsDetails = allowAgents.map((subagentId: string) => {
        const subagentConfig = config.agents.list.find((a: any) => a.id === subagentId);
        const subagentInfo = getAgentDisplayInfo(subagentId, subagentConfig);
        return { id: subagentId, name: subagentInfo.name, emoji: subagentInfo.emoji, color: subagentInfo.color };
      });

      return {
        id: agent.id,
        name: agent.name || agentInfo.name,
        emoji: agentInfo.emoji,
        color: agentInfo.color,
        model: agent.model?.primary || config.agents.defaults.model.primary,
        workspace: agent.workspace,
        dmPolicy: telegramAccount?.dmPolicy || config.channels?.telegram?.dmPolicy || "pairing",
        allowAgents,
        allowAgentsDetails,
        botToken: telegramAccount?.botToken ? "configured" : undefined,
        status,
        lastActivity,
        activeSessions: sessionCounts[agent.id] || 0,
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Error reading agents:", error);
    return NextResponse.json({ error: "Failed to load agents" }, { status: 500 });
  }
}
