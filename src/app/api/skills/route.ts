import { NextResponse } from "next/server";
import { readOpenClawSkillsReport } from "@/lib/openclaw-skills-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = readOpenClawSkillsReport();
    return NextResponse.json({
      source: "openclaw-gateway-skills-status",
      ...report,
    });
  } catch (error) {
    console.error("Failed to load default OpenClaw skills status:", error);
    return NextResponse.json({ error: "Failed to load skills" }, { status: 500 });
  }
}
