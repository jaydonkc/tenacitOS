import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { listWorkspaces } from "@/lib/openclaw-runtime";

interface SearchResult {
  type: "memory" | "activity" | "task";
  title: string;
  snippet: string;
  path?: string;
  timestamp?: string;
}

function searchInFile(filePath: string, query: string, displayPath: string): SearchResult[] {
  const results: SearchResult[] = [];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const lowerQuery = query.toLowerCase();

    lines.forEach((line, index) => {
      if (!line.toLowerCase().includes(lowerQuery)) {
        return;
      }
      const start = Math.max(0, index - 1);
      const end = Math.min(lines.length, index + 2);
      const snippet = lines.slice(start, end).join("\n");
      results.push({
        type: "memory",
        title: path.basename(filePath),
        snippet: snippet.substring(0, 200),
        path: displayPath,
      });
    });
  } catch {
    return [];
  }
  return results;
}

function getWorkspaceMemoryFiles() {
  const files: Array<{ path: string; displayPath: string }> = [];

  for (const workspace of listWorkspaces()) {
    const rootFiles = ["MEMORY.md"];
    for (const rootFile of rootFiles) {
      const fullPath = path.join(workspace.path, rootFile);
      if (fs.existsSync(fullPath)) {
        files.push({ path: fullPath, displayPath: `${workspace.id}/${rootFile}` });
      }
    }

    const memoryDir = path.join(workspace.path, "memory");
    try {
      for (const file of fs.readdirSync(memoryDir)) {
        if (file.endsWith(".md")) {
          files.push({
            path: path.join(memoryDir, file),
            displayPath: `${workspace.id}/memory/${file}`,
          });
        }
      }
    } catch {
      // Skip missing memory directories.
    }
  }

  return files;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") || "";

  if (!query || query.length < 2) {
    return NextResponse.json([]);
  }

  const results: SearchResult[] = [];
  for (const file of getWorkspaceMemoryFiles()) {
    results.push(...searchInFile(file.path, query, file.displayPath));
  }

  try {
    const activitiesPath = path.join(process.cwd(), "data", "activities.json");
    const activities = JSON.parse(fs.readFileSync(activitiesPath, "utf-8"));
    const lowerQuery = query.toLowerCase();

    for (const activity of activities) {
      if (
        activity.description?.toLowerCase().includes(lowerQuery) ||
        activity.type?.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          type: "activity",
          title: activity.type,
          snippet: activity.description,
          timestamp: activity.timestamp,
        });
      }
    }
  } catch {
    // Ignore missing activity log.
  }

  try {
    const tasksPath = path.join(process.cwd(), "data", "tasks.json");
    const tasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    const lowerQuery = query.toLowerCase();

    for (const task of tasks) {
      if (
        task.name?.toLowerCase().includes(lowerQuery) ||
        task.description?.toLowerCase().includes(lowerQuery)
      ) {
        results.push({
          type: "task",
          title: task.name,
          snippet: task.description,
          timestamp: task.nextRun,
        });
      }
    }
  } catch {
    // Ignore missing tasks file.
  }

  return NextResponse.json(results.slice(0, 20));
}
