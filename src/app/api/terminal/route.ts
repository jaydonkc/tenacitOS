/**
 * Browser terminal API
 * POST /api/terminal
 * Body: { command }
 *
 * This endpoint intentionally supports a narrow set of read-only inspector
 * commands. It does not execute arbitrary shell input.
 */
import os from "os";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { runBinary } from "@/lib/openclaw-cli";
import {
  detectComposeFile,
  isPathInsideBase,
  OPENCLAW_DIR,
} from "@/lib/openclaw-runtime";

const REPO_ROOT = process.cwd();
const NEWDASH_ROOT = path.resolve(REPO_ROOT, "..");
const OPENCLAW_STACK_ROOT = path.join(os.homedir(), "openclaw");
const DETECTED_COMPOSE_FILE = detectComposeFile();
const ALLOWED_LS_FLAGS = new Set([
  "-a",
  "-l",
  "-la",
  "-al",
  "-lh",
  "-hl",
  "-lah",
  "-lha",
  "-ahl",
  "-hal",
]);
const ALLOWED_CAT_FILES = new Set(["/proc/loadavg", "/etc/os-release"]);
const ALLOWED_LS_ROOTS = [
  OPENCLAW_DIR,
  OPENCLAW_STACK_ROOT,
  NEWDASH_ROOT,
  REPO_ROOT,
];
const ALLOWED_GIT_ROOTS = [NEWDASH_ROOT, REPO_ROOT];

const SUPPORTED_COMMANDS = [
  "df -h /",
  "free -h",
  "uptime",
  "date",
  "hostname",
  "whoami",
  "id",
  "ps aux",
  "ps aux | grep <term>",
  "docker ps",
  "docker ps -a",
  "docker compose -f ~/openclaw/docker-compose.yml ps --all",
  "ls ~/.openclaw/workspace",
  "ls ~/.openclaw/workspace-coding",
  "openclaw sessions --json --all-agents",
  "git -C ~/newdash/tenacitOS status",
  "netstat -tlnp",
  "ss -tlnp",
  "cat /proc/loadavg",
];

function expandHomePath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

function tokenizeCommand(command: string): string[] | null {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (quote) {
      if (char === quote) {
        quote = null;
        continue;
      }

      if (char === "\\" && index + 1 < command.length) {
        current += command[index + 1];
        index += 1;
        continue;
      }

      current += char;
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (char === ";" || char === "&" || char === "<" || char === ">" || char === "`") {
      return null;
    }

    if (char === "|") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      tokens.push("|");
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    return null;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens.filter(Boolean);
}

function resolveSafePath(input: string): string {
  return path.resolve(expandHomePath(input));
}

function ensureInsideAllowedRoots(targetPath: string, roots: string[]): void {
  if (!roots.some((root) => isPathInsideBase(targetPath, root))) {
    throw new Error(`Path is outside the allowed terminal roots: ${targetPath}`);
  }
}

function executeTerminalCommand(tokens: string[]): string {
  if (tokens.length === 1 && tokens[0] === "uptime") {
    return runBinary("uptime", []);
  }

  if (tokens.length === 1 && tokens[0] === "date") {
    return runBinary("date", []);
  }

  if (tokens.length === 1 && tokens[0] === "hostname") {
    return runBinary("hostname", []);
  }

  if (tokens.length === 1 && tokens[0] === "whoami") {
    return runBinary("whoami", []);
  }

  if (tokens.length === 1 && tokens[0] === "id") {
    return runBinary("id", []);
  }

  if (tokens.length === 2 && tokens[0] === "free" && tokens[1] === "-h") {
    return runBinary("free", ["-h"]);
  }

  if (
    tokens.length >= 2 &&
    tokens[0] === "df" &&
    tokens[1] === "-h" &&
    (tokens.length === 2 || (tokens.length === 3 && tokens[2] === "/"))
  ) {
    return runBinary("df", tokens.length === 3 ? ["-h", "/"] : ["-h"]);
  }

  if (tokens.length === 2 && tokens[0] === "cat" && ALLOWED_CAT_FILES.has(tokens[1])) {
    return runBinary("cat", [tokens[1]]);
  }

  if (tokens.length === 2 && tokens[0] === "ps" && tokens[1] === "aux") {
    return runBinary("ps", ["aux"]);
  }

  if (
    tokens.length === 5 &&
    tokens[0] === "ps" &&
    tokens[1] === "aux" &&
    tokens[2] === "|" &&
    tokens[3] === "grep" &&
    tokens[4]
  ) {
    const output = runBinary("ps", ["aux"]);
    const lines = output.split("\n");
    const header = lines.shift() || "";
    const matches = lines.filter((line) => line.includes(tokens[4]));
    return matches.length > 0 ? [header, ...matches].join("\n") : "No matching processes";
  }

  if (tokens.length >= 1 && tokens[0] === "ls") {
    const maybeFlag = tokens[1] && tokens[1].startsWith("-") ? tokens[1] : null;
    const rawPath = tokens[maybeFlag ? 2 : 1] || REPO_ROOT;

    if (tokens.length > (maybeFlag ? 3 : 2)) {
      throw new Error("ls only supports a single target path");
    }

    if (maybeFlag && !ALLOWED_LS_FLAGS.has(maybeFlag)) {
      throw new Error(`Unsupported ls flag "${maybeFlag}"`);
    }

    const resolvedPath = resolveSafePath(rawPath);
    ensureInsideAllowedRoots(resolvedPath, ALLOWED_LS_ROOTS);

    return runBinary("ls", maybeFlag ? [maybeFlag, resolvedPath] : [resolvedPath]);
  }

  if (tokens.length === 4 && tokens[0] === "git" && tokens[1] === "-C" && tokens[3] === "status") {
    const repoPath = resolveSafePath(tokens[2]);
    ensureInsideAllowedRoots(repoPath, ALLOWED_GIT_ROOTS);

    return runBinary("git", ["-C", repoPath, "status", "--short", "--branch"], 15000);
  }

  if (
    tokens.length === 4 &&
    tokens[0] === "openclaw" &&
    tokens[1] === "sessions" &&
    tokens.includes("--json") &&
    tokens.includes("--all-agents")
  ) {
    return runBinary("openclaw", ["sessions", "--json", "--all-agents"], 20000);
  }

  if (tokens.length === 2 && tokens[0] === "docker" && tokens[1] === "ps") {
    return runBinary("docker", ["ps"], 15000);
  }

  if (
    tokens.length === 3 &&
    tokens[0] === "docker" &&
    tokens[1] === "ps" &&
    tokens[2] === "-a"
  ) {
    return runBinary("docker", ["ps", "-a"], 15000);
  }

  if (
    tokens[0] === "docker" &&
    tokens[1] === "compose" &&
    DETECTED_COMPOSE_FILE &&
    ((tokens.length === 6 &&
      tokens[2] === "-f" &&
      tokens[4] === "ps" &&
      tokens[5] === "--all") ||
      (tokens.length === 4 && tokens[2] === "ps" && tokens[3] === "--all"))
  ) {
    const composePath =
      tokens.length === 6 ? resolveSafePath(tokens[3]) : DETECTED_COMPOSE_FILE;

    if (path.resolve(composePath) !== path.resolve(DETECTED_COMPOSE_FILE)) {
      throw new Error("Only the configured OpenClaw compose file is allowed");
    }

    return runBinary(
      "docker",
      ["compose", "-f", DETECTED_COMPOSE_FILE, "ps", "--all"],
      20000
    );
  }

  if (tokens.length === 2 && tokens[0] === "netstat" && tokens[1] === "-tlnp") {
    return runBinary("netstat", ["-tlnp"], 10000);
  }

  if (tokens.length === 2 && tokens[0] === "ss" && tokens[1] === "-tlnp") {
    return runBinary("ss", ["-tlnp"], 10000);
  }

  throw new Error(
    `Unsupported command. Allowed patterns: ${SUPPORTED_COMMANDS.join(", ")}`
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const command = String(body.command || "").trim();

    if (!command) {
      return NextResponse.json({ error: "No command provided" }, { status: 400 });
    }

    const tokens = tokenizeCommand(command);
    if (!tokens || tokens.length === 0) {
      return NextResponse.json(
        {
          error:
            "Command syntax is not allowed. This terminal only supports a small set of safe inspector commands.",
        },
        { status: 403 }
      );
    }

    const start = Date.now();
    const output = executeTerminalCommand(tokens);
    const duration = Date.now() - start;

    return NextResponse.json({
      command,
      duration,
      output,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.startsWith("Unsupported command") ? 403 : 500;
    return NextResponse.json({ error: message, output: message }, { status });
  }
}
