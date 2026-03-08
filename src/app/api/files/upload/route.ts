import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { logActivity } from "@/lib/activities-db";
import { isPathInsideBase, resolveWorkspaceId } from "@/lib/openclaw-runtime";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const workspace = (formData.get("workspace") as string) || "workspace";
    const dirPath = (formData.get("path") as string) || "";
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const base = resolveWorkspaceId(workspace);
    if (!base) {
      return NextResponse.json({ error: "Unknown workspace" }, { status: 400 });
    }

    const targetDir = path.resolve(base, dirPath);
    if (!isPathInsideBase(targetDir, base)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const results: Array<{ name: string; size: number; path: string }> = [];
    await fs.mkdir(targetDir, { recursive: true });

    for (const file of files) {
      const sanitizedName = path.basename(file.name);
      const targetPath = path.join(targetDir, sanitizedName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(targetPath, buffer);
      results.push({
        name: sanitizedName,
        size: buffer.length,
        path: dirPath ? `${dirPath}/${sanitizedName}` : sanitizedName,
      });
    }

    logActivity("file_write", `Uploaded ${results.length} file(s) to ${workspace}/${dirPath || "/"}`, "success", {
      metadata: { files: results.map((result) => result.name), workspace, dirPath },
    });

    return NextResponse.json({ success: true, files: results });
  } catch (error) {
    console.error("[upload] Error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
