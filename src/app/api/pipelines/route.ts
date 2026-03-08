import { NextResponse } from "next/server";
import { getPipelineDashboardSnapshot } from "@/lib/pipelines";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(getPipelineDashboardSnapshot());
  } catch (error) {
    console.error("[pipelines] Error:", error);
    return NextResponse.json({ error: "Failed to load pipelines" }, { status: 500 });
  }
}
