import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { tryRunOpenClawJson } from "@/lib/openclaw-cli";
import { getAgentWorkspace, getDefaultModel, readOpenClawConfig } from "@/lib/openclaw-runtime";

export const dynamic = "force-dynamic";

type OfficeStatus = "idle" | "working" | "thinking" | "error";

const AGENT_CONFIG = {
  main: { emoji: "🦞", color: "#ff6b35", name: "Main", role: "Coordinator" },
  coding: { emoji: "🧩", color: "#60a5fa", name: "Coding", role: "Builder" },
  planner: { emoji: "🗺️", color: "#f59e0b", name: "Planner", role: "Planning" },
  implementer: { emoji: "🛠️", color: "#4ade80", name: "Implementer", role: "Execution" },
  reviewer: { emoji: "🔍", color: "#a78bfa", name: "Reviewer", role: "Review" },
} as const;

interface RawSession {
  key: string;
  agentId?: string;
}

function getLatestMemoryActivity(workspace: string): { currentTask: string; lastSeen: number } {
  try {
    const memoryPath = path.join(workspace, "memory");
    const latestFile = fs
      .readdirSync(memoryPath)
      .filter((file) => file.endsWith(".md"))
      .sort()
      .reverse()[0];

    if (!latestFile) {
      return { currentTask: "No recent memory updates", lastSeen: 0 };
    }

    const fullPath = path.join(memoryPath, latestFile);
    const stat = fs.statSync(fullPath);
    const content = fs.readFileSync(fullPath, "utf-8");
    const lines = content.trim().split("\n").filter((line) => line.trim());
    const lastMeaningfulLine = lines
      .slice(-12)
      .reverse()
      .find((line) => line.length > 20 && !line.match(/^#+\s/));

    return {
      currentTask: lastMeaningfulLine
        ? lastMeaningfulLine.replace(/^[-*]\s*/, "").slice(0, 120)
        : "No recent task summary",
      lastSeen: stat.mtime.getTime(),
    };
  } catch {
    return { currentTask: "No recent memory updates", lastSeen: 0 };
  }
}

function getStatus(lastSeen: number, activeSessions: number): OfficeStatus {
  if (lastSeen === 0 && activeSessions === 0) {
    return "idle";
  }

  if (activeSessions > 0 || Date.now() - lastSeen < 15 * 60 * 1000) {
    return "working";
  }

  if (Date.now() - lastSeen < 2 * 60 * 60 * 1000) {
    return "thinking";
  }

  return "idle";
}

export async function GET() {
  try {
    const config = readOpenClawConfig();
    const defaultModel = getDefaultModel(config);
    const sessionData = tryRunOpenClawJson<{ sessions?: RawSession[] }>(["sessions", "--json", "--all-agents"]);
    const sessionCounts: Record<string, number> = {};

    for (const session of sessionData?.sessions || []) {
      const agentId = session.agentId || session.key.split(":")[1];
      if (!agentId) {
        continue;
      }
      sessionCounts[agentId] = (sessionCounts[agentId] || 0) + 1;
    }

    const agents = (config.agents?.list || []).map((agent) => {
      const defaults = AGENT_CONFIG[agent.id as keyof typeof AGENT_CONFIG] || {
        emoji: "🤖",
        color: "#666666",
        name: agent.id,
        role: "Agent",
      };
      const workspace = getAgentWorkspace(agent, config);
      const activity = getLatestMemoryActivity(workspace);
      const activeSessions = sessionCounts[agent.id] || 0;
      const status = getStatus(activity.lastSeen, activeSessions);

      return {
        id: agent.id,
        name: agent.name || defaults.name,
        emoji: agent.ui?.emoji || defaults.emoji,
        color: agent.ui?.color || defaults.color,
        role: defaults.role,
        currentTask: activity.currentTask,
        isActive: status === "working",
        status,
        model: agent.model?.primary || defaultModel,
        activeSessions,
        lastSeen: activity.lastSeen,
      };
    });

    return NextResponse.json({ agents });
  } catch (error) {
    console.error("Error getting office data:", error);
    return NextResponse.json(
      { error: "Failed to load office data" },
      { status: 500 }
    );
  }
}
