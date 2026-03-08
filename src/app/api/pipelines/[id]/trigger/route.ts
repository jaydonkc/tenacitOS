import { NextRequest, NextResponse } from "next/server";
import { runOpenClaw, runOpenClawJson } from "@/lib/openclaw-cli";
import { getLinkedPipelineJob, getPipelineTriggerConfig } from "@/lib/pipelines";

export const dynamic = "force-dynamic";

interface DirectPipelineRunResult {
  payloads?: Array<{ text?: string }>;
  meta?: {
    agentMeta?: {
      sessionId?: string;
      model?: string;
      provider?: string;
    };
    durationMs?: number;
  };
}

function buildSessionKey(agentId: string, sessionId: string): string {
  return `agent:${agentId}:${sessionId}`;
}

function sanitizeCronExpr(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100) {
    return null;
  }

  return trimmed;
}

function sanitizeTimezone(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 100) {
    return fallback;
  }

  return trimmed;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const triggerConfig = getPipelineTriggerConfig(id);

    if (!triggerConfig) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const cronExpr = sanitizeCronExpr(body?.cronExpr) || triggerConfig.recommendedCronExpr;
    const timezone = sanitizeTimezone(body?.timezone, triggerConfig.recommendedTimezone);
    const enabled = body?.enabled !== false;
    const linkedJob = getLinkedPipelineJob(id);
    const sessionKey = buildSessionKey(triggerConfig.agentId, triggerConfig.sessionId);

    if (linkedJob) {
      const args = [
        "cron",
        "edit",
        linkedJob.id,
        "--name",
        triggerConfig.cronJobName,
        "--description",
        triggerConfig.description,
        "--agent",
        triggerConfig.agentId,
        "--message",
        triggerConfig.prompt,
        "--cron",
        cronExpr,
        "--tz",
        timezone,
        "--session",
        "isolated",
        "--session-key",
        sessionKey,
        "--no-deliver",
        enabled ? "--enable" : "--disable",
      ];

      runOpenClaw(args, 30000);
    } else {
      const args = [
        "cron",
        "add",
        "--name",
        triggerConfig.cronJobName,
        "--description",
        triggerConfig.description,
        "--agent",
        triggerConfig.agentId,
        "--message",
        triggerConfig.prompt,
        "--cron",
        cronExpr,
        "--tz",
        timezone,
        "--session",
        "isolated",
        "--session-key",
        sessionKey,
        "--no-deliver",
        ...(enabled ? [] : ["--disabled"]),
        "--json",
      ];

      runOpenClaw(args, 30000);
    }

    return NextResponse.json({
      success: true,
      pipelineId: id,
      cronExpr,
      timezone,
      enabled,
      linkedJob: getLinkedPipelineJob(id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save pipeline trigger";
    console.error("[pipeline-trigger] PUT error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const triggerConfig = getPipelineTriggerConfig(id);

    if (!triggerConfig) {
      return NextResponse.json({ error: "Pipeline not found" }, { status: 404 });
    }

    const linkedJob = getLinkedPipelineJob(id);

    if (linkedJob) {
      const output = runOpenClaw(["cron", "run", linkedJob.id], 300000);

      return NextResponse.json({
        success: true,
        pipelineId: id,
        source: "cron-job",
        jobId: linkedJob.id,
        message: output.trim() || "Pipeline triggered",
      });
    }

    const result = runOpenClawJson<DirectPipelineRunResult>(
      [
        "agent",
        "--agent",
        triggerConfig.agentId,
        "--session-id",
        triggerConfig.sessionId,
        "--message",
        triggerConfig.prompt,
        "--json",
      ],
      300000
    );

    return NextResponse.json({
      success: true,
      pipelineId: id,
      source: "direct-agent",
      sessionId: result.meta?.agentMeta?.sessionId || triggerConfig.sessionId,
      durationMs: result.meta?.durationMs || null,
      preview:
        result.payloads
          ?.map((payload) => payload.text?.trim())
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 400) || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run pipeline";
    console.error("[pipeline-trigger] POST error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
