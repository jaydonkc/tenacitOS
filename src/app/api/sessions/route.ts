/**
 * Sessions API
 * GET /api/sessions          -> list all sessions
 * GET /api/sessions?id=xxx   -> get messages from a specific session JSONL transcript
 */
import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { findSessionTranscriptPath } from "@/lib/openclaw-runtime";
import { tryRunOpenClawJson } from "@/lib/openclaw-cli";

interface RawSession {
  key: string;
  kind?: string;
  agentId?: string;
  updatedAt: number;
  ageMs: number;
  sessionId?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  model?: string;
  modelProvider?: string;
  contextTokens?: number;
}

interface ParsedSession {
  id: string;
  key: string;
  agentId: string;
  type: "main" | "cron" | "subagent" | "direct" | "unknown";
  typeLabel: string;
  typeEmoji: string;
  sessionId: string | null;
  cronJobId?: string;
  subagentId?: string;
  updatedAt: number;
  ageMs: number;
  model: string;
  modelProvider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  contextTokens: number;
  contextUsedPercent: number | null;
  aborted: boolean;
}

function parseSessionKey(raw: RawSession): {
  agentId: string;
  type: "main" | "cron" | "subagent" | "direct" | "unknown";
  typeLabel: string;
  typeEmoji: string;
  cronJobId?: string;
  subagentId?: string;
  isRunEntry: boolean;
} {
  const parts = raw.key.split(":");
  const agentId = raw.agentId || parts[1] || "main";

  if (parts.includes("run")) {
    return { agentId, type: "unknown", typeLabel: "Run Entry", typeEmoji: "🔁", isRunEntry: true };
  }

  if (parts[2] === "main") {
    return { agentId, type: "main", typeLabel: `${agentId} Main`, typeEmoji: "🧠", isRunEntry: false };
  }

  if (parts[2] === "cron") {
    return {
      agentId,
      type: "cron",
      typeLabel: "Cron Job",
      typeEmoji: "🕐",
      cronJobId: parts[3],
      isRunEntry: false,
    };
  }

  if (parts[2] === "subagent") {
    return {
      agentId,
      type: "subagent",
      typeLabel: `${agentId} Sub-agent`,
      typeEmoji: "🤖",
      subagentId: parts[3],
      isRunEntry: false,
    };
  }

  return {
    agentId,
    type: "direct",
    typeLabel: parts[2] ? `${parts[2].charAt(0).toUpperCase() + parts[2].slice(1)} Chat` : "Direct Chat",
    typeEmoji: "💬",
    isRunEntry: false,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("id");

  if (sessionId) {
    return getSessionMessages(sessionId);
  }

  return listSessions();
}

async function listSessions(): Promise<NextResponse> {
  try {
    const data = tryRunOpenClawJson<{ sessions?: RawSession[] }>(["sessions", "--json", "--all-agents"]);
    const rawSessions = data?.sessions || [];

    const sessions: ParsedSession[] = rawSessions.reduce<ParsedSession[]>((acc, raw) => {
      const parsed = parseSessionKey(raw);
      if (parsed.isRunEntry || parsed.type === "unknown") {
        return acc;
      }

      const totalTokens = raw.totalTokens || 0;
      const contextTokens = raw.contextTokens || 0;
      const contextUsedPercent =
        contextTokens > 0 && raw.totalTokensFresh
          ? Math.round((totalTokens / contextTokens) * 100)
          : null;

      acc.push({
        id: raw.key,
        key: raw.key,
        agentId: parsed.agentId,
        type: parsed.type,
        typeLabel: parsed.typeLabel,
        typeEmoji: parsed.typeEmoji,
        sessionId: raw.sessionId || null,
        cronJobId: parsed.cronJobId,
        subagentId: parsed.subagentId,
        updatedAt: raw.updatedAt,
        ageMs: raw.ageMs,
        model: raw.model || "unknown",
        modelProvider: raw.modelProvider || "unknown",
        inputTokens: raw.inputTokens || 0,
        outputTokens: raw.outputTokens || 0,
        totalTokens,
        contextTokens,
        contextUsedPercent,
        aborted: raw.abortedLastRun || false,
      });
      return acc;
    }, []);

    sessions.sort((a, b) => b.updatedAt - a.updatedAt);

    return NextResponse.json({ sessions, total: sessions.length });
  } catch (error) {
    console.error("[sessions] Error listing sessions:", error);
    return NextResponse.json({ error: "Failed to list sessions", sessions: [] }, { status: 500 });
  }
}

interface JsonlLine {
  type: string;
  id?: string;
  timestamp?: string;
  modelId?: string;
  message?: {
    role: string;
    content:
      | string
      | Array<{
          type: string;
          text?: string;
          name?: string;
          arguments?: unknown;
          input?: unknown;
          toolName?: string;
          toolCallId?: string;
          id?: string;
        }>;
  };
}

async function getSessionMessages(sessionId: string): Promise<NextResponse> {
  if (!/^[A-Za-z0-9._-]+$/.test(sessionId)) {
    return NextResponse.json({ error: "Invalid session ID" }, { status: 400 });
  }

  const filePath = findSessionTranscriptPath(sessionId);
  if (!filePath) {
    return NextResponse.json({ error: "Session not found", messages: [] }, { status: 404 });
  }

  try {
    const raw = readFileSync(filePath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);

    interface ParsedMessage {
      id: string;
      type: "user" | "assistant" | "tool_use" | "tool_result" | "model_change" | "system";
      role?: string;
      content: string;
      timestamp: string;
      model?: string;
      toolName?: string;
    }

    const messages: ParsedMessage[] = [];
    let currentModel = "";

    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as JsonlLine;

        if (obj.type === "model_change" && obj.modelId) {
          currentModel = obj.modelId;
          continue;
        }

        if (obj.type !== "message" || !obj.message) {
          continue;
        }

        const role = obj.message.role;
        const timestamp = obj.timestamp || new Date().toISOString();

        if (typeof obj.message.content === "string") {
          messages.push({
            id: obj.id || Math.random().toString(36).slice(2),
            type: role === "user" ? "user" : role === "toolResult" ? "tool_result" : "assistant",
            role,
            content: obj.message.content,
            timestamp,
            model: currentModel || undefined,
          });
          continue;
        }

        for (const block of obj.message.content) {
          if (block.type === "text" && block.text) {
            messages.push({
              id: `${obj.id || Math.random().toString(36).slice(2)}-text`,
              type: role === "user" ? "user" : role === "toolResult" ? "tool_result" : "assistant",
              role,
              content: block.text,
              timestamp,
              model: currentModel || undefined,
            });
            continue;
          }

          if (block.type === "toolCall" && block.name) {
            const input = block.arguments ?? block.input;
            messages.push({
              id: block.id || `${obj.id || Math.random().toString(36).slice(2)}-tool`,
              type: "tool_use",
              role,
              content: `${block.name}(${input ? JSON.stringify(input).slice(0, 300) : ""})`,
              timestamp,
              toolName: block.name,
              model: currentModel || undefined,
            });
            continue;
          }

          if (role === "toolResult" && block.text) {
            messages.push({
              id: `${obj.id || Math.random().toString(36).slice(2)}-result`,
              type: "tool_result",
              role,
              content: block.text.slice(0, 1000),
              timestamp,
              toolName: block.toolName,
              model: currentModel || undefined,
            });
          }
        }
      } catch {
        // Skip malformed JSONL lines.
      }
    }

    return NextResponse.json({
      sessionId,
      messages,
      total: messages.length,
    });
  } catch (error) {
    console.error("[sessions] Error reading session file:", error);
    return NextResponse.json({ error: "Failed to read session", messages: [] }, { status: 500 });
  }
}
