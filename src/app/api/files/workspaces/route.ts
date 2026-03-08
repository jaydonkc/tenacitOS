import { NextResponse } from "next/server";
import { listWorkspaces } from "@/lib/openclaw-runtime";

export async function GET() {
  try {
    const workspaces = listWorkspaces().map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      emoji: workspace.emoji,
      path: workspace.path,
      agentName: workspace.agentName || workspace.agentIds.join(", "),
    }));

    return NextResponse.json({ workspaces });
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    return NextResponse.json({ workspaces: [] }, { status: 500 });
  }
}
