import { NextRequest, NextResponse } from "next/server";
import { tryRunOpenClawJson } from "@/lib/openclaw-cli";

interface RawRun {
  id?: string;
  startedAt?: string;
  createdAt?: string;
  completedAt?: string;
  finishedAt?: string;
  status?: string;
  durationMs?: number;
  error?: string;
}

interface RunEntry {
  id: string;
  jobId: string;
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  durationMs: number | null;
  error: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Job ID required" }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
    }

    const data = tryRunOpenClawJson<{ runs?: RawRun[] }>(["cron", "runs", id, "--json"], 10000);
    const rawRuns = data?.runs || [];
    const runs: RunEntry[] = rawRuns.map((run) => ({
      id: run.id || `${id}-${run.startedAt || run.createdAt || "unknown"}`,
      jobId: id,
      startedAt: run.startedAt || run.createdAt || null,
      completedAt: run.completedAt || run.finishedAt || null,
      status: run.status || "unknown",
      durationMs:
        run.durationMs ||
        (run.startedAt && run.completedAt
          ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
          : null),
      error: run.error || null,
    }));

    return NextResponse.json({ runs, total: runs.length });
  } catch (error) {
    console.error("Error fetching run history:", error);
    return NextResponse.json({ error: "Failed to fetch run history" }, { status: 500 });
  }
}
