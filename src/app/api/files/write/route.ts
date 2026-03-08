/**
 * Write file content endpoint
 * POST /api/files/write
 * Body: { workspace, path, content }
 */
import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { logActivity } from "@/lib/activities-db";
import { isPathInsideBase, resolveWorkspaceId } from "@/lib/openclaw-runtime";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workspace, path: filePath, content } = body;

    if (!filePath || content === undefined) {
      return NextResponse.json({ error: "Missing path or content" }, { status: 400 });
    }

    const base = resolveWorkspaceId(workspace || "workspace");
    if (!base) {
      return NextResponse.json({ error: "Unknown workspace" }, { status: 400 });
    }

    const fullPath = path.resolve(base, filePath);
    if (!isPathInsideBase(fullPath, base)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");

    const stat = await fs.stat(fullPath);
    logActivity("file_write", `Edited file: ${filePath}`, "success", {
      metadata: { workspace, filePath, size: stat.size },
    });

    return NextResponse.json({ success: true, path: filePath, size: stat.size });
  } catch (error) {
    console.error("[write] Error:", error);
    return NextResponse.json({ error: "Write failed" }, { status: 500 });
  }
}
