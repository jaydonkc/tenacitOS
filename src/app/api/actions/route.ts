/**
 * Quick Actions API
 * POST /api/actions  body: { action }
 */
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { logActivity } from "@/lib/activities-db";
import { tryRunOpenClawJson, tryRunDockerCompose } from "@/lib/openclaw-cli";
import { detectComposeFile, OPENCLAW_WORKSPACE } from "@/lib/openclaw-runtime";
import { getGatewayConfig, gatewayGet } from "@/lib/openclaw-gateway";

const execAsync = promisify(exec);
const composeFile = detectComposeFile();
const gateway = getGatewayConfig();
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const AGENT_COMMS_HEALTH_URL = process.env.AGENT_COMMS_HEALTH_URL || "";

interface ActionResult {
  action: string;
  status: "success" | "error";
  output: string;
  duration_ms: number;
  timestamp: string;
}

async function fetchHealth(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const body = await res.text();
  return `${res.status} ${res.statusText}\n${body}`.trim();
}

async function runAction(action: string): Promise<ActionResult> {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  try {
    let output = "";

    switch (action) {
      case "git-status": {
        const { stdout: dirs } = await execAsync(`find "${OPENCLAW_WORKSPACE}" -maxdepth 2 -name ".git" -type d 2>/dev/null | head -10`);
        const repoPaths = dirs.trim().split("\n").filter(Boolean).map((dir) => dir.replace("/.git", ""));
        const results: string[] = [];

        for (const repoPath of repoPaths) {
          const name = repoPath.split("/").pop() || repoPath;
          try {
            const { stdout: status } = await execAsync(`cd "${repoPath}" && git status --short && git log --oneline -3 2>&1`);
            results.push(`📁 ${name}\n${status || "(clean)"}`);
          } catch {
            results.push(`📁 ${name}\n(error reading git status)`);
          }
        }

        output = results.length ? results.join("\n\n") : "No git repos found in workspace";
        break;
      }

      case "restart-gateway": {
        if (!composeFile) {
          throw new Error("No OpenClaw compose file detected");
        }

        const restartOutput = tryRunDockerCompose(composeFile, ["restart", "openclaw-gateway"], 20000);
        const psOutput = tryRunDockerCompose(composeFile, ["ps", "--all", "openclaw-gateway"], 10000);
        output = [restartOutput, psOutput].filter(Boolean).join("\n\n") || "Gateway restart requested";
        break;
      }

      case "gateway-status": {
        const sections: string[] = [];
        try {
          sections.push(`Gateway health\n${await fetchHealth(`${gateway.url}/health`)}`);
        } catch {
          sections.push(`Gateway health\nunreachable at ${gateway.url}`);
        }
        if (composeFile) {
          const psOutput = tryRunDockerCompose(composeFile, ["ps", "--all", "openclaw-gateway"], 10000);
          if (psOutput) {
            sections.push(`Compose status\n${psOutput}`);
          }
        }
        output = sections.join("\n\n");
        break;
      }

      case "check-docker": {
        const { stdout, stderr } = await execAsync('docker ps --format "table {{.Names}}\t{{.Status}}" 2>&1 || echo "Docker not available"');
        output = stdout || stderr || "Docker check completed";
        break;
      }

      case "check-ollama": {
        output = await fetchHealth(`${OLLAMA_BASE_URL}/api/tags`).catch(
          () => `Ollama not reachable at ${OLLAMA_BASE_URL}`
        );
        break;
      }

      case "check-agent-comms": {
        if (!AGENT_COMMS_HEALTH_URL) {
          output = "AGENT_COMMS_HEALTH_URL is not configured";
          break;
        }
        output = await fetchHealth(AGENT_COMMS_HEALTH_URL).catch(
          () => `Agent comms endpoint unreachable at ${AGENT_COMMS_HEALTH_URL}`
        );
        break;
      }

      case "gateway-health": {
        const health = await gatewayGet(["/health", "/healthz", "/api/health"]);
        output = health ? JSON.stringify(health, null, 2) : `OpenClaw gateway unreachable at ${gateway.url}`;
        break;
      }

      case "gateway-logs": {
        if (!composeFile) {
          throw new Error("No OpenClaw compose file detected");
        }
        output = tryRunDockerCompose(composeFile, ["logs", "--tail=120", "openclaw-gateway"], 15000) || "No gateway logs available";
        break;
      }

      case "clear-temp": {
        const { stdout } = await execAsync(`find "${OPENCLAW_WORKSPACE}" \\( -name "*.tmp" -o -name "*.bak" \\) -type f -delete 2>/dev/null && echo "Removed temp files from ${OPENCLAW_WORKSPACE}"`);
        output = stdout.trim() || "No temp files removed";
        break;
      }

      case "usage-stats": {
        const { stdout: du } = await execAsync(`du -sh "${OPENCLAW_WORKSPACE}" 2>/dev/null || echo "N/A"`);
        const { stdout: df } = await execAsync("df -h / | tail -1");
        const { stdout: mem } = await execAsync("free -h | head -2");
        const { stdout: cpu } = await execAsync("top -bn1 | grep 'Cpu(s)' | head -1");
        const { stdout: uptime } = await execAsync("uptime -p");
        output = `Workspace: ${du.trim()}\n\nDisk: ${df.trim()}\n\nMemory:\n${mem.trim()}\n\nCPU: ${cpu.trim()}\n\nUptime: ${uptime.trim()}`;
        break;
      }

      case "session-ping": {
        const sessions = tryRunOpenClawJson<{
          sessions?: Array<{ key: string; sessionId?: string; updatedAt?: number; model?: string; agentId?: string }>;
        }>(["sessions", "--json", "--all-agents"]);
        const mainSession = (sessions?.sessions || []).find((session) => (session.agentId || session.key.split(":")[1]) === "main");
        output = mainSession
          ? `Main session: ${mainSession.key}\nsessionId: ${mainSession.sessionId || "n/a"}\nupdatedAt: ${mainSession.updatedAt || "n/a"}\nmodel: ${mainSession.model || "unknown"}`
          : "No main session found";
        break;
      }

      case "heartbeat": {
        const results: string[] = [];
        try {
          results.push(`Gateway\n${await fetchHealth(`${gateway.url}/health`)}`);
        } catch {
          results.push(`Gateway\nunreachable at ${gateway.url}`);
        }

        if (composeFile) {
          const psOutput = tryRunDockerCompose(composeFile, ["ps", "--all"], 10000);
          if (psOutput) {
            results.push(`Compose\n${psOutput}`);
          }
        }

        const sessions = tryRunOpenClawJson<{ count?: number; sessions?: unknown[] }>(["sessions", "--json", "--all-agents"]);
        results.push(`Sessions\n${sessions?.count || sessions?.sessions?.length || 0} active session records`);

        output = results.join("\n\n");
        break;
      }

      case "npm-audit": {
        const { stdout, stderr } = await execAsync(`cd "${process.cwd()}" && npm audit --json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf-8');const j=JSON.parse(d||'{}');console.log('Vulnerabilities: '+JSON.stringify(j.metadata?.vulnerabilities||{}))" 2>&1`).catch((error) => ({ stdout: "", stderr: error.message }));
        output = stdout || stderr || "Audit completed";
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    const duration_ms = Date.now() - start;
    logActivity("command", `Quick action: ${action}`, "success", { duration_ms, metadata: { action } });
    return { action, status: "success", output, duration_ms, timestamp };
  } catch (error) {
    const duration_ms = Date.now() - start;
    const errMsg = error instanceof Error ? error.message : String(error);
    logActivity("command", `Quick action failed: ${action}`, "error", {
      duration_ms,
      metadata: { action, error: errMsg },
    });
    return { action, status: "error", output: errMsg, duration_ms, timestamp };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const validActions = [
      "git-status",
      "restart-gateway",
      "gateway-status",
      "gateway-health",
      "gateway-logs",
      "check-docker",
      "check-ollama",
      "check-agent-comms",
      "clear-temp",
      "usage-stats",
      "session-ping",
      "heartbeat",
      "npm-audit",
    ];

    if (!validActions.includes(action)) {
      return NextResponse.json({ error: `Unknown action. Valid: ${validActions.join(", ")}` }, { status: 400 });
    }

    const result = await runAction(action);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[actions] Error:", error);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
