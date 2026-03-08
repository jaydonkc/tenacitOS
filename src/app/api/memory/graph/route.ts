import { NextRequest, NextResponse } from "next/server";
import { getMemoryGraphSnapshot } from "@/lib/memory-stack";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId.trim() : "";
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    const limit = typeof body?.limit === "number" ? body.limit : undefined;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }
    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    const data = getMemoryGraphSnapshot({ workspaceId, query, limit });
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load memory graph";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
