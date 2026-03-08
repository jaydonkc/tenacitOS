import { execFileSync } from "child_process";

function normalizeOutput(output: string | Buffer | null | undefined): string {
  return String(output || "").trim();
}

export function runBinary(binary: string, args: string[], timeout = 10000): string {
  return normalizeOutput(
    execFileSync(binary, args, {
      encoding: "utf-8",
      timeout,
      stdio: ["ignore", "pipe", "pipe"],
    })
  );
}

export function tryRunBinary(binary: string, args: string[], timeout = 10000): string | null {
  try {
    return runBinary(binary, args, timeout);
  } catch {
    return null;
  }
}

export function runBinaryJson<T>(binary: string, args: string[], timeout = 10000): T {
  return JSON.parse(runBinary(binary, args, timeout)) as T;
}

export function tryRunBinaryJson<T>(binary: string, args: string[], timeout = 10000): T | null {
  try {
    return runBinaryJson<T>(binary, args, timeout);
  } catch {
    return null;
  }
}

export function runOpenClaw(args: string[], timeout = 10000): string {
  return runBinary("openclaw", args, timeout);
}

export function tryRunOpenClaw(args: string[], timeout = 10000): string | null {
  return tryRunBinary("openclaw", args, timeout);
}

export function runOpenClawJson<T>(args: string[], timeout = 10000): T {
  return runBinaryJson<T>("openclaw", args, timeout);
}

export function tryRunOpenClawJson<T>(args: string[], timeout = 10000): T | null {
  return tryRunBinaryJson<T>("openclaw", args, timeout);
}

export function runDockerCompose(composeFile: string, args: string[], timeout = 15000): string {
  return runBinary("docker", ["compose", "-f", composeFile, ...args], timeout);
}

export function tryRunDockerCompose(composeFile: string, args: string[], timeout = 15000): string | null {
  return tryRunBinary("docker", ["compose", "-f", composeFile, ...args], timeout);
}
