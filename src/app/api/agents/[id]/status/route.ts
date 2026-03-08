import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { tryRunOpenClawJson } from "@/lib/openclaw-cli";
import { getAgentWorkspace, getDefaultModel, readOpenClawConfig } from "@/lib/openclaw-runtime";

export const dynamic = "force-dynamic";

interface RawSession {
  key: string;
  agentId?: string;
  sessionId?: string;
  updatedAt?: number;
  model?: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const config = readOpenClawConfig();
    const agent = (config.agents?.list || []).find((candidate) => candidate.id === id);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const workspace = getAgentWorkspace(agent, config);
    const memoryPath = path.join(workspace, "memory");
    let recentFiles: Array<{ date: string; size: number; modified: string }> = [];

    try {
      recentFiles = fs
        .readdirSync(memoryPath)
        .filter((file) => file.match(/^\d{4}-\d{2}-\d{2}\.md$/))
        .map((file) => {
          const stat = fs.statSync(path.join(memoryPath, file));
          return {
            date: file.replace(".md", ""),
            size: stat.size,
            modified: stat.mtime.toISOString(),
          };
        })
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7);
    } catch {
      recentFiles = [];
    }

    const sessionIndex = tryRunOpenClawJson<{ sessions?: RawSession[] }>(["sessions", "--json", "--all-agents"]);
    const sessions = (sessionIndex?.sessions || [])
      .filter((session) => (session.agentId || session.key.split(":")[1]) === id)
      .map((session) => ({
        id: session.sessionId || session.key,
        key: session.key,
        updatedAt: session.updatedAt || null,
        model: session.model || null,
      }));

    const telegramAccount = config.channels?.telegram?.accounts?.[id];

    return NextResponse.json({
      agent: {
        id: agent.id,
        name: agent.name || id,
        model: agent.model?.primary || getDefaultModel(config),
        workspace,
        dmPolicy: telegramAccount?.dmPolicy || config.channels?.telegram?.dmPolicy || "pairing",
        allowAgents: agent.subagents?.allowAgents || [],
        telegramConfigured: Boolean(telegramAccount?.botToken || config.channels?.telegram?.botToken),
      },
      memory: {
        recentFiles,
      },
      sessions,
    });
  } catch (error) {
    console.error("Error getting agent status:", error);
    return NextResponse.json(
      { error: "Failed to get agent status" },
      { status: 500 }
    );
  }
}
