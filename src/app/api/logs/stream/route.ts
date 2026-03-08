/**
 * Real-time log streaming via SSE
 * GET /api/logs/stream?service=<name>&backend=<pm2|systemd-user|docker>
 */
import { NextRequest } from "next/server";

import {
  LOG_STREAM_SERVICES,
  type DashboardServiceBackend,
} from "@/lib/dashboard-services";
import { createLogStreamProcess } from "@/lib/service-runtime";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const service = searchParams.get("service") || "mission-control";
  const backend = (searchParams.get("backend") ||
    "systemd-user") as DashboardServiceBackend;

  const allowed = LOG_STREAM_SERVICES.find(
    (entry) => entry.name === service && entry.backend === backend
  );
  if (!allowed) {
    return new Response("Service not allowed", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (line: string) => {
        try {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                line,
                ts: new Date().toISOString(),
              })}\n\n`
            )
          );
        } catch {
          // client disconnected
        }
      };

      send(`[stream] Connected to ${service} (${backend})`);

      let proc;
      try {
        proc = createLogStreamProcess(service, backend);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send(`[error] ${message}`);
        controller.close();
        return;
      }

      proc.stdout.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n").filter(Boolean)) {
          send(line);
        }
      });

      proc.stderr.on("data", (data: Buffer) => {
        for (const line of data.toString().split("\n").filter(Boolean)) {
          send(line);
        }
      });

      proc.on("error", (error) => {
        send(`[error] ${error.message}`);
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      });

      proc.on("close", () => {
        send("[stream] Process ended");
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      });

      request.signal?.addEventListener("abort", () => {
        proc.kill();
        try {
          controller.close();
        } catch {
          // stream already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
