/**
 * Health check endpoint
 * GET /api/health - Check health of all services and integrations
 */
import { NextResponse } from "next/server";

import { PM2_SERVICE_NAMES } from "@/lib/dashboard-services";
import { getGatewayConfig } from "@/lib/openclaw-gateway";
import {
  checkDockerContainer,
  checkPm2Service,
  checkSystemdService,
} from "@/lib/service-runtime";

interface ServiceCheck {
  name: string;
  status: "up" | "down" | "degraded" | "unknown";
  latency?: number;
  details?: string;
  url?: string;
}

async function checkUrl(
  url: string,
  timeoutMs = 5000
): Promise<{ status: "up" | "down"; latency: number; httpCode?: number }> {
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    return {
      status: res.ok || res.status < 500 ? "up" : "down",
      latency: Date.now() - start,
      httpCode: res.status,
    };
  } catch {
    return { status: "down", latency: Date.now() - start };
  }
}

export async function GET() {
  const checks: ServiceCheck[] = [];
  const gateway = getGatewayConfig();

  const [missionControl, gatewayContainer, gatewayHttp, ...pm2Checks] =
    await Promise.all([
      checkSystemdService("mission-control", "user"),
      checkDockerContainer("openclaw-gateway"),
      checkUrl(`${gateway.url}/health`, 2500),
      ...PM2_SERVICE_NAMES.map((service) => checkPm2Service(service)),
    ]);

  checks.push({ ...missionControl, name: "Mission Control" });

  const gatewayStatus: ServiceCheck = {
    name: "OpenClaw Gateway",
    status: gatewayContainer.status,
    details: gatewayContainer.details,
    url: gateway.url,
  };

  if (gatewayContainer.status === "up" && gatewayHttp.status === "up") {
    gatewayStatus.status = "up";
    gatewayStatus.latency = gatewayHttp.latency;
    gatewayStatus.details = gatewayContainer.details
      ? `${gatewayContainer.details} · HTTP reachable`
      : "HTTP reachable";
  } else if (gatewayContainer.status === "up" && gatewayHttp.status === "down") {
    gatewayStatus.status = "degraded";
    gatewayStatus.latency = gatewayHttp.latency;
    gatewayStatus.details = gatewayContainer.details
      ? `${gatewayContainer.details} · HTTP unreachable`
      : "HTTP unreachable";
  }

  checks.push(gatewayStatus);
  checks.push(...pm2Checks);

  const urlChecks = await Promise.all([
    checkUrl("https://tenacitas.cazaustre.dev"),
    checkUrl("https://api.anthropic.com", 3000),
  ]);

  checks.push({
    name: "tenacitas.cazaustre.dev",
    status: urlChecks[0].status,
    latency: urlChecks[0].latency,
    url: "https://tenacitas.cazaustre.dev",
  });

  checks.push({
    name: "Anthropic API",
    status:
      urlChecks[1].status === "up" || urlChecks[1].httpCode === 401
        ? "up"
        : urlChecks[1].status,
    latency: urlChecks[1].latency,
    url: "https://api.anthropic.com",
    details:
      urlChecks[1].status === "up" || urlChecks[1].httpCode === 401
        ? "reachable"
        : "unreachable",
  });

  const downCount = checks.filter((check) => check.status === "down").length;
  const overallStatus =
    downCount === 0
      ? "healthy"
      : downCount < checks.length / 2
        ? "degraded"
        : "critical";

  return NextResponse.json({
    status: overallStatus,
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
