import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { getGatewayConfig, gatewayGet } from "@/lib/openclaw-gateway";

const required = ["ADMIN_PASSWORD", "AUTH_SECRET", "OPENCLAW_GATEWAY_URL"];
const recommended = ["OPENCLAW_DIR", "OPENCLAW_WORKSPACE", "OPENCLAW_GATEWAY_TOKEN", "OLLAMA_BASE_URL", "AGENT_COMMS_HEALTH_URL"];

function envSnapshot() {
  const all = [...required, ...recommended];
  return all.map((key) => ({ key, configured: Boolean(process.env[key]), required: required.includes(key) }));
}

function checkOpenclawFiles() {
  const openclawDir = process.env.OPENCLAW_DIR || "/home/node/.openclaw";
  const configPath = `${openclawDir}/openclaw.json`;
  const hasConfig = existsSync(configPath);
  let agents = 0;
  if (hasConfig) {
    try {
      const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
      agents = parsed?.agents?.list?.length || 0;
    } catch {}
  }
  return { openclawDir, hasConfig, agents };
}

export async function GET() {
  const env = envSnapshot();
  const files = checkOpenclawFiles();
  const gateway = getGatewayConfig();

  let gatewayOk = false;
  try {
    const health = await gatewayGet(['/health', '/api/health']);
    gatewayOk = Boolean(health);
  } catch {}

  let gatewayService = "unknown";
  try {
    gatewayService = execSync("openclaw gateway status 2>/dev/null || echo unknown", { encoding: "utf-8" }).trim();
  } catch {}

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    checklist: {
      env,
      files,
      connectivity: {
        gatewayUrl: gateway.url,
        gatewayAuth: Boolean(gateway.token),
        gatewayOk,
        gatewayService,
      },
    },
    ready: env.filter((e) => e.required && !e.configured).length === 0 && files.hasConfig,
  });
}
