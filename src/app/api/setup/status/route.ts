import { NextResponse } from "next/server";
import { existsSync } from "fs";
import { detectComposeFile, OPENCLAW_CONFIG, OPENCLAW_DIR, OPENCLAW_WORKSPACE, readOpenClawConfig } from "@/lib/openclaw-runtime";
import { getGatewayConfig, gatewayGet } from "@/lib/openclaw-gateway";

const required: string[] = [];
const recommended = ["OPENCLAW_DIR", "OPENCLAW_WORKSPACE", "OPENCLAW_COMPOSE_FILE", "OLLAMA_BASE_URL", "AGENT_COMMS_HEALTH_URL"];

function envSnapshot() {
  const all = [...required, ...recommended];
  return all.map((key) => ({ key, configured: Boolean(process.env[key]), required: required.includes(key) }));
}

function checkOpenclawFiles() {
  const hasConfig = existsSync(OPENCLAW_CONFIG);
  let agents = 0;
  if (hasConfig) {
    try {
      agents = readOpenClawConfig().agents?.list?.length || 0;
    } catch {
      agents = 0;
    }
  }

  return {
    openclawDir: OPENCLAW_DIR,
    workspace: OPENCLAW_WORKSPACE,
    hasConfig,
    agents,
    composeFile: detectComposeFile(),
  };
}

export async function GET() {
  const env = envSnapshot();
  const files = checkOpenclawFiles();
  const gateway = getGatewayConfig();

  let gatewayOk = false;
  try {
    const health = await gatewayGet(["/health", "/healthz", "/api/health"]);
    gatewayOk = Boolean(health);
  } catch {
    gatewayOk = false;
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    checklist: {
      env,
      files,
      connectivity: {
        gatewayUrl: gateway.url,
        gatewayAuth: Boolean(gateway.token),
        gatewayOk,
        gatewayService: gatewayOk ? "healthy" : "unreachable",
      },
    },
    ready: env.filter((entry) => entry.required && !entry.configured).length === 0 && files.hasConfig,
  });
}
