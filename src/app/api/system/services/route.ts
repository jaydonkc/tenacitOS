/**
 * Service action API
 * POST /api/system/services
 * Body: { name, backend, action }  action: restart | stop | start | logs
 */
import { NextRequest, NextResponse } from "next/server";

import type { DashboardServiceBackend } from "@/lib/dashboard-services";
import {
  runDockerContainerAction,
  runManagedServiceAction,
} from "@/lib/service-runtime";

const ACTIONS = new Set(["restart", "stop", "start", "logs"]);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body?.name || "").trim();
    const backend = String(body?.backend || "").trim() as DashboardServiceBackend;
    const action = String(body?.action || "").trim() as
      | "restart"
      | "stop"
      | "start"
      | "logs";

    if (!name || !backend || !action) {
      return NextResponse.json(
        { error: "Missing name, backend or action" },
        { status: 400 }
      );
    }

    if (!ACTIONS.has(action)) {
      return NextResponse.json(
        { error: `Invalid action "${action}"` },
        { status: 400 }
      );
    }

    const output =
      backend === "docker"
        ? await runDockerContainerAction(name, action)
        : await runManagedServiceAction(name, backend, action);

    return NextResponse.json({ success: true, output, action, name, backend });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[services API] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
