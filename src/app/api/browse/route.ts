import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isPathInsideBase, resolveWorkspaceId } from "@/lib/openclaw-runtime";

interface FileEntry {
  name: string;
  type: "file" | "folder";
  size: number;
  modified: string;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const workspace = searchParams.get("workspace") || "workspace";
    const relativePath = searchParams.get("path") || "";
    const fileContent = searchParams.get("content") === "true";
    const rawMode = searchParams.get("raw") === "true";
    const basePath = resolveWorkspaceId(workspace);

    if (!basePath) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    try {
      await fs.access(basePath);
    } catch {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const normalizedPath = path.normalize(relativePath).replace(/^(\.\.[/\\])+/, "");
    const fullPath = path.resolve(basePath, normalizedPath);

    if (!isPathInsideBase(fullPath, basePath)) {
      return NextResponse.json({ error: "Access denied: Path outside workspace" }, { status: 403 });
    }

    const stats = await fs.stat(fullPath);

    if (rawMode && stats.isFile()) {
      const ext = path.extname(fullPath).toLowerCase().slice(1);
      const mimeTypes: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
        ico: "image/x-icon",
      };
      const contentType = mimeTypes[ext];
      if (!contentType) {
        return NextResponse.json({ error: "Raw mode only supports image files" }, { status: 400 });
      }
      const buffer = await fs.readFile(fullPath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Length": buffer.length.toString(),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    if (fileContent && stats.isFile()) {
      const content = await fs.readFile(fullPath, "utf-8");
      return NextResponse.json({
        name: path.basename(fullPath),
        path: normalizedPath,
        content,
        size: stats.size,
        modified: stats.mtime.toISOString(),
      });
    }

    if (stats.isDirectory()) {
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      const items: FileEntry[] = await Promise.all(
        entries
          .filter((entry) => !entry.name.startsWith("."))
          .map(async (entry) => {
            const entryPath = path.join(fullPath, entry.name);
            const entryStats = await fs.stat(entryPath).catch(() => null);
            return {
              name: entry.name,
              type: entry.isDirectory() ? "folder" : "file",
              size: entryStats?.size || 0,
              modified: entryStats?.mtime.toISOString() || new Date().toISOString(),
            };
          })
      );

      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return NextResponse.json({ path: normalizedPath, items });
    }

    return NextResponse.json({
      name: path.basename(fullPath),
      path: normalizedPath,
      type: "file",
      size: stats.size,
      modified: stats.mtime.toISOString(),
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "Path not found" }, { status: 404 });
    }
    console.error("Browse API error:", error);
    return NextResponse.json({ error: "Failed to browse path" }, { status: 500 });
  }
}
