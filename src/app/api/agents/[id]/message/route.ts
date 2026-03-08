import { NextRequest, NextResponse } from "next/server";
import { logActivity } from "@/lib/activities-db";
import { runOpenClawJson } from "@/lib/openclaw-cli";
import { readOpenClawConfig } from "@/lib/openclaw-runtime";

export const dynamic = "force-dynamic";

interface AgentMessagePayload {
  text?: string;
  mediaUrl?: string | null;
  mediaUrls?: string[];
}

interface AgentMessageResult {
  payloads?: AgentMessagePayload[];
  meta?: {
    durationMs?: number;
    agentMeta?: {
      sessionId?: string;
      model?: string;
      provider?: string;
    };
  };
}

function extractReplyPreview(payloads: AgentMessagePayload[] | undefined): string | null {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return null;
  }

  const chunks = payloads
    .flatMap((payload) => {
      const parts: string[] = [];
      const text = payload.text?.trim();
      if (text) {
        parts.push(text);
      }

      const media = [
        ...(typeof payload.mediaUrl === "string" && payload.mediaUrl.trim() ? [payload.mediaUrl.trim()] : []),
        ...(Array.isArray(payload.mediaUrls) ? payload.mediaUrls.map((url) => url.trim()).filter(Boolean) : []),
      ];
      for (const url of media) {
        parts.push(`MEDIA:${url}`);
      }

      return parts;
    })
    .join("\n\n")
    .trim();

  return chunks ? chunks.slice(0, 300) : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();

  try {
    const { id } = await params;
    const config = readOpenClawConfig();
    const agent = (config.agents?.list || []).find((candidate) => candidate.id === id);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    if (message.length > 10000) {
      return NextResponse.json({ error: "Message is too long" }, { status: 400 });
    }

    const result = runOpenClawJson<AgentMessageResult>(
      ["agent", "--agent", id, "--message", message, "--json"],
      300000
    );
    const duration_ms = Date.now() - startedAt;
    const replyPreview = extractReplyPreview(result.payloads);

    logActivity("message_sent", `Sent message to ${id}`, "success", {
      agent: id,
      duration_ms,
      metadata: {
        sessionId: result.meta?.agentMeta?.sessionId || null,
        model: result.meta?.agentMeta?.model || null,
        provider: result.meta?.agentMeta?.provider || null,
        replyPreview,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const duration_ms = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);

    logActivity("message_sent", `Failed to send message`, "error", {
      duration_ms,
      metadata: { error: message },
    });

    console.error("[agents/message] Error:", error);
    return NextResponse.json({ error: message || "Failed to send message" }, { status: 500 });
  }
}
