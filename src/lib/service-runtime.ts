import { execFile, spawn } from "child_process";
import { promises as fs } from "fs";
import type { ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { promisify } from "util";

import {
  MANAGED_SERVICES,
  PM2_SERVICE_NAMES,
  SYSTEMD_SERVICE_NAMES,
  USER_SYSTEMD_SERVICE_NAMES,
  type DashboardServiceBackend,
} from "@/lib/dashboard-services";

const execFileAsync = promisify(execFile);
const MAX_COMMAND_BUFFER = 1024 * 1024;
const LOG_TAIL_BYTES = 256 * 1024;

interface ExecResult {
  stdout: string;
  stderr: string;
}

interface Pm2Process {
  name: string;
  pid: number | null;
  pm2_env?: {
    status?: string;
    pm_uptime?: number;
    restart_time?: number;
    pm_out_log_path?: string;
    pm_err_log_path?: string;
    monit?: {
      cpu?: number;
      memory?: number;
    };
  };
}

export interface ManagedServiceEntry {
  name: string;
  status: string;
  description: string;
  backend: DashboardServiceBackend;
  uptime?: number | null;
  restarts?: number;
  pid?: number | null;
  mem?: number | null;
  cpu?: number | null;
}

export interface ServiceCheck {
  name: string;
  status: "up" | "down" | "degraded" | "unknown";
  details?: string;
}

function normalizeOutput(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getExecErrorOutput(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }

  const stdout = "stdout" in error ? normalizeOutput(error.stdout) : "";
  const stderr = "stderr" in error ? normalizeOutput(error.stderr) : "";
  return [stdout, stderr].filter(Boolean).join("\n").trim();
}

async function runCommand(
  command: string,
  args: string[],
  timeout = 10000
): Promise<ExecResult> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    encoding: "utf-8",
    timeout,
    maxBuffer: MAX_COMMAND_BUFFER,
  });

  return {
    stdout: normalizeOutput(stdout),
    stderr: normalizeOutput(stderr),
  };
}

function normalizeSystemdUnit(name: string): string {
  return name.endsWith(".service") ? name : `${name}.service`;
}

function resolveUserSystemdUnit(name: string): string {
  if (name === "mission-control") {
    return process.env.MISSION_CONTROL_SYSTEMD_UNIT?.trim() || "mission-control.service";
  }

  return normalizeSystemdUnit(name);
}

function resolveSystemdUnit(name: string): string {
  if (name === "nginx") {
    return process.env.NGINX_SYSTEMD_UNIT?.trim() || "nginx.service";
  }

  return normalizeSystemdUnit(name);
}

function normalizeSystemdStatus(rawStatus: string): string {
  switch (rawStatus) {
    case "active":
      return "active";
    case "activating":
    case "reloading":
      return "activating";
    case "failed":
      return "failed";
    case "inactive":
    case "deactivating":
      return "inactive";
    default:
      return rawStatus || "unknown";
  }
}

function normalizePm2Status(status: string): string {
  switch (status) {
    case "online":
      return "active";
    case "stopped":
    case "stopping":
      return "inactive";
    case "errored":
    case "error":
      return "failed";
    case "launching":
    case "waiting restart":
      return "activating";
    default:
      return status || "unknown";
  }
}

async function readTail(filePath: string, maxLines: number): Promise<string> {
  const handle = await fs.open(filePath, "r");

  try {
    const stats = await handle.stat();
    const start = Math.max(0, stats.size - LOG_TAIL_BYTES);
    const length = stats.size - start;
    const buffer = Buffer.alloc(length);

    await handle.read(buffer, 0, length, start);

    return buffer
      .toString("utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-maxLines)
      .join("\n");
  } finally {
    await handle.close();
  }
}

export async function getPm2Processes(): Promise<Pm2Process[]> {
  try {
    const { stdout } = await runCommand("pm2", ["jlist"], 15000);
    const parsed = JSON.parse(stdout) as unknown;
    return Array.isArray(parsed) ? (parsed as Pm2Process[]) : [];
  } catch {
    return [];
  }
}

async function getSystemdStatus(
  name: string,
  scope: "system" | "user"
): Promise<string> {
  const unit =
    scope === "user" ? resolveUserSystemdUnit(name) : resolveSystemdUnit(name);
  const args =
    scope === "user"
      ? ["--user", "is-active", unit]
      : ["is-active", unit];

  try {
    const { stdout } = await runCommand("systemctl", args, 5000);
    return normalizeSystemdStatus(stdout);
  } catch (error) {
    const output = getExecErrorOutput(error);
    if (output.includes("failed")) {
      return "failed";
    }
    if (output.includes("activating")) {
      return "activating";
    }
    if (output.includes("inactive")) {
      return "inactive";
    }
    return "unknown";
  }
}

export async function getManagedServiceEntries(): Promise<ManagedServiceEntry[]> {
  const pm2Map = new Map(
    (await getPm2Processes()).map((process) => [process.name, process] as const)
  );

  return Promise.all(
    MANAGED_SERVICES.map(async (service) => {
      if (service.backend === "systemd-user") {
        return {
          name: service.name,
          status: await getSystemdStatus(service.name, "user"),
          description: service.description,
          backend: service.backend,
        };
      }

      if (service.backend === "systemd") {
        return {
          name: service.name,
          status: await getSystemdStatus(service.name, "system"),
          description: service.description,
          backend: service.backend,
        };
      }

      if (service.backend === "pm2") {
        const process = pm2Map.get(service.name);
        if (!process) {
          return {
            name: service.name,
            status: "unknown",
            description: service.description,
            backend: service.backend,
          };
        }

        const rawStatus = process.pm2_env?.status || "unknown";
        const uptime =
          rawStatus === "online" && process.pm2_env?.pm_uptime
            ? Date.now() - process.pm2_env.pm_uptime
            : null;

        return {
          name: service.name,
          status: normalizePm2Status(rawStatus),
          description: service.description,
          backend: service.backend,
          uptime,
          restarts: process.pm2_env?.restart_time ?? 0,
          pid: process.pid,
          cpu: process.pm2_env?.monit?.cpu ?? null,
          mem: process.pm2_env?.monit?.memory ?? null,
        };
      }

      return {
        name: service.name,
        status: "not_deployed",
        description: service.description,
        backend: service.backend,
      };
    })
  );
}

export async function checkSystemdService(
  name: string,
  scope: "system" | "user"
): Promise<ServiceCheck> {
  const unit =
    scope === "user" ? resolveUserSystemdUnit(name) : resolveSystemdUnit(name);
  const status = await getSystemdStatus(name, scope);

  if (status === "active") {
    return { name, status: "up", details: unit };
  }

  if (status === "activating") {
    return { name, status: "degraded", details: unit };
  }

  if (status === "inactive" || status === "failed") {
    return { name, status: "down", details: `${unit} (${status})` };
  }

  return { name, status: "unknown", details: `${unit} (${status})` };
}

export async function checkPm2Service(name: string): Promise<ServiceCheck> {
  const process = (await getPm2Processes()).find((entry) => entry.name === name);

  if (!process) {
    return { name, status: "unknown", details: "not found in pm2" };
  }

  const rawStatus = process.pm2_env?.status || "unknown";
  if (rawStatus === "online") {
    return {
      name,
      status: "up",
      details: `${rawStatus} · restarts: ${process.pm2_env?.restart_time ?? 0}`,
    };
  }

  return {
    name,
    status: rawStatus === "launching" ? "degraded" : "down",
    details: `${rawStatus} · restarts: ${process.pm2_env?.restart_time ?? 0}`,
  };
}

export async function checkDockerContainer(name: string): Promise<ServiceCheck> {
  try {
    const { stdout } = await runCommand(
      "docker",
      ["inspect", "--format", "{{json .State}}", name],
      10000
    );
    const state = JSON.parse(stdout) as {
      Status?: string;
      Running?: boolean;
      Health?: { Status?: string };
    };

    const status = state.Status || (state.Running ? "running" : "unknown");
    const health = state.Health?.Status;
    const details = health ? `${status} · health: ${health}` : status;

    if (status === "running" && (!health || health === "healthy")) {
      return { name, status: "up", details };
    }

    if (status === "running") {
      return { name, status: "degraded", details };
    }

    return { name, status: "down", details };
  } catch {
    return { name, status: "down", details: "container not found" };
  }
}

function ensureAllowedService(
  allowedNames: string[],
  name: string,
  backend: DashboardServiceBackend
): void {
  if (!allowedNames.includes(name)) {
    throw new Error(`Service "${name}" is not allowed for backend "${backend}"`);
  }
}

async function getPm2LogOutput(name: string): Promise<string> {
  const process = (await getPm2Processes()).find((entry) => entry.name === name);
  if (!process) {
    return "PM2 process not found";
  }

  const sections: string[] = [];
  const stdoutPath = process.pm2_env?.pm_out_log_path;
  const stderrPath = process.pm2_env?.pm_err_log_path;

  if (stdoutPath) {
    try {
      const content = await readTail(stdoutPath, 100);
      if (content) {
        sections.push(`=== STDOUT (last 100 lines) ===\n${content}`);
      }
    } catch {
      // ignore missing stdout logs
    }
  }

  if (stderrPath) {
    try {
      const content = await readTail(stderrPath, 50);
      if (content) {
        sections.push(`=== STDERR (last 50 lines) ===\n${content}`);
      }
    } catch {
      // ignore missing stderr logs
    }
  }

  return sections.join("\n\n") || "No logs available";
}

export async function runManagedServiceAction(
  name: string,
  backend: DashboardServiceBackend,
  action: "restart" | "stop" | "start" | "logs"
): Promise<string> {
  if (backend === "pm2") {
    ensureAllowedService(PM2_SERVICE_NAMES, name, backend);
    if (action === "logs") {
      return getPm2LogOutput(name);
    }

    const { stdout, stderr } = await runCommand("pm2", [action, name], 20000);
    return [stdout, stderr].filter(Boolean).join("\n") || `${action} executed successfully`;
  }

  if (backend === "systemd-user") {
    ensureAllowedService(USER_SYSTEMD_SERVICE_NAMES, name, backend);
    const unit = resolveUserSystemdUnit(name);

    if (action === "logs") {
      const { stdout, stderr } = await runCommand(
        "journalctl",
        ["--user", "-u", unit, "-n", "100", "--no-pager"],
        15000
      );
      return [stdout, stderr].filter(Boolean).join("\n") || "No logs available";
    }

    const { stdout, stderr } = await runCommand(
      "systemctl",
      ["--user", action, unit],
      20000
    );
    return [stdout, stderr].filter(Boolean).join("\n") || `${action} executed successfully`;
  }

  if (backend === "systemd") {
    ensureAllowedService(SYSTEMD_SERVICE_NAMES, name, backend);
    const unit = resolveSystemdUnit(name);

    if (action === "logs") {
      const { stdout, stderr } = await runCommand(
        "journalctl",
        ["-u", unit, "-n", "100", "--no-pager"],
        15000
      );
      return [stdout, stderr].filter(Boolean).join("\n") || "No logs available";
    }

    const { stdout, stderr } = await runCommand("systemctl", [action, unit], 20000);
    return [stdout, stderr].filter(Boolean).join("\n") || `${action} executed successfully`;
  }

  throw new Error(`Unsupported backend "${backend}"`);
}

export async function resolveDockerContainerTarget(
  nameOrId: string
): Promise<{ id: string; name: string }> {
  const { stdout } = await runCommand(
    "docker",
    ["ps", "-a", "--format", "{{.ID}}\t{{.Names}}"],
    15000
  );

  const entries = stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, name] = line.split("\t");
      return {
        id: normalizeOutput(id),
        name: normalizeOutput(name),
      };
    })
    .filter((entry) => entry.id && entry.name);

  const match = entries.find(
    (entry) =>
      entry.name === nameOrId ||
      entry.id === nameOrId ||
      entry.id.startsWith(nameOrId)
  );

  if (!match) {
    throw new Error(`Docker container "${nameOrId}" not found`);
  }

  return match;
}

export async function runDockerContainerAction(
  nameOrId: string,
  action: "restart" | "stop" | "start" | "logs"
): Promise<string> {
  const target = await resolveDockerContainerTarget(nameOrId);

  if (action === "logs") {
    const { stdout, stderr } = await runCommand(
      "docker",
      ["logs", "--tail", "100", target.name],
      20000
    );
    return [stdout, stderr].filter(Boolean).join("\n") || "No logs available";
  }

  const { stdout, stderr } = await runCommand(
    "docker",
    [action, target.name],
    20000
  );
  return [stdout, stderr].filter(Boolean).join("\n") || `${action} executed successfully`;
}

export function createLogStreamProcess(
  name: string,
  backend: DashboardServiceBackend
): ChildProcessByStdio<null, Readable, Readable> {
  if (backend === "pm2") {
    ensureAllowedService(PM2_SERVICE_NAMES, name, backend);
    return spawn("pm2", ["logs", name, "--lines", "50", "--nocolor"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  if (backend === "systemd-user") {
    ensureAllowedService(USER_SYSTEMD_SERVICE_NAMES, name, backend);
    return spawn(
      "journalctl",
      ["--user", "-u", resolveUserSystemdUnit(name), "-n", "50", "--no-pager", "-f"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
  }

  if (backend === "systemd") {
    ensureAllowedService(SYSTEMD_SERVICE_NAMES, name, backend);
    return spawn(
      "journalctl",
      ["-u", resolveSystemdUnit(name), "-n", "50", "--no-pager", "-f"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );
  }

  if (backend === "docker") {
    return spawn("docker", ["logs", "--tail", "50", "-f", name], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  }

  throw new Error(`Unsupported log backend "${backend}"`);
}
