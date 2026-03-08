import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { runOpenClaw, tryRunOpenClawJson } from "@/lib/openclaw-cli";
import { OPENCLAW_CRON_JOBS } from "@/lib/openclaw-runtime";

interface CronJobRecord extends Record<string, unknown> {
  id?: string;
  agentId?: string;
  name?: string;
  enabled?: boolean;
  createdAtMs?: number;
  updatedAtMs?: number;
  schedule?: Record<string, unknown>;
  sessionTarget?: unknown;
  payload?: Record<string, unknown>;
  delivery?: unknown;
  state?: Record<string, unknown>;
}

function formatDescription(job: CronJobRecord): string {
  const payload = job.payload;
  if (!payload) return "";
  if (payload.kind === "agentTurn") {
    const msg = (payload.message as string) || "";
    return msg.length > 120 ? `${msg.substring(0, 120)}...` : msg;
  }
  if (payload.kind === "systemEvent") {
    const text = (payload.text as string) || "";
    return text.length > 120 ? `${text.substring(0, 120)}...` : text;
  }
  return "";
}

function formatSchedule(schedule?: Record<string, unknown>): string {
  if (!schedule) return "Unknown";
  switch (schedule.kind) {
    case "cron":
      return `${schedule.expr}${schedule.tz ? ` (${schedule.tz})` : ""}`;
    case "every": {
      const ms = Number(schedule.everyMs || 0);
      if (ms >= 3600000) return `Every ${ms / 3600000}h`;
      if (ms >= 60000) return `Every ${ms / 60000}m`;
      return `Every ${ms / 1000}s`;
    }
    case "at":
      return `Once at ${schedule.at}`;
    default:
      return JSON.stringify(schedule);
  }
}

function mapJobs(rawJobs: CronJobRecord[]) {
  return (rawJobs || []).map((job) => ({
    id: job.id,
    agentId: job.agentId || "main",
    name: job.name || "Unnamed",
    enabled: job.enabled ?? true,
    createdAtMs: job.createdAtMs,
    updatedAtMs: job.updatedAtMs,
    schedule: job.schedule,
    sessionTarget: job.sessionTarget,
    payload: job.payload,
    delivery: job.delivery,
    state: job.state,
    description: formatDescription(job),
    scheduleDisplay: formatSchedule(job.schedule),
    timezone: (job.schedule as Record<string, string> | undefined)?.tz || "UTC",
    nextRun: (job.state as Record<string, number> | undefined)?.nextRunAtMs
      ? new Date((job.state as Record<string, number>).nextRunAtMs).toISOString()
      : null,
    lastRun: (job.state as Record<string, number> | undefined)?.lastRunAtMs
      ? new Date((job.state as Record<string, number>).lastRunAtMs).toISOString()
      : null,
  }));
}

function readCronJobs(): CronJobRecord[] {
  if (fs.existsSync(OPENCLAW_CRON_JOBS)) {
    const parsed = JSON.parse(fs.readFileSync(OPENCLAW_CRON_JOBS, "utf-8")) as {
      jobs?: CronJobRecord[];
    };
    return parsed.jobs || [];
  }

  const data = tryRunOpenClawJson<{ jobs?: CronJobRecord[] }>(["cron", "list", "--json", "--all"], 10000);
  return data?.jobs || [];
}

export async function GET() {
  try {
    return NextResponse.json(mapJobs(readCronJobs()));
  } catch (error) {
    console.error("Error fetching cron jobs:", error);
    return NextResponse.json(
      { error: "Failed to fetch cron jobs" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, enabled } = body;
    if (!id || typeof enabled !== "boolean") {
      return NextResponse.json({ error: "Job ID and enabled are required" }, { status: 400 });
    }

    try {
      runOpenClaw(["cron", enabled ? "enable" : "disable", id, "--json"], 10000);
    } catch {
      runOpenClaw(["cron", "update", id, `--enabled=${enabled}`, "--json"], 10000);
    }

    return NextResponse.json({ success: true, id, enabled, source: "openclaw-cli" });
  } catch (error) {
    console.error("Error updating cron job:", error);
    return NextResponse.json({ error: "Failed to update cron job" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Job ID is required" }, { status: 400 });
    }

    runOpenClaw(["cron", "remove", id], 10000);
    return NextResponse.json({ success: true, deleted: id });
  } catch (error) {
    console.error("Error deleting cron job:", error);
    return NextResponse.json({ error: "Failed to delete cron job" }, { status: 500 });
  }
}
