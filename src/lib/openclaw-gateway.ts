import { readFileSync } from "fs";

export interface GatewayConfig {
  url: string;
  token: string;
}

export function getGatewayConfig(): GatewayConfig {
  const envUrl = process.env.OPENCLAW_GATEWAY_URL;
  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN;

  let fileToken = "";
  let filePort = 18789;
  try {
    const configPath = `${process.env.OPENCLAW_DIR || "/home/node/.openclaw"}/openclaw.json`;
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    fileToken = config?.gateway?.auth?.token || "";
    filePort = config?.gateway?.port || 18789;
  } catch {
    // noop
  }

  return {
    url: envUrl || `http://127.0.0.1:${filePort}`,
    token: envToken || fileToken,
  };
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(2500) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function gatewayRpc<T = unknown>(
  method: string,
  params: Record<string, unknown> = {}
): Promise<T | null> {
  const { url, token } = getGatewayConfig();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const rpcBodies = [
    { jsonrpc: "2.0", id: `tenacitos-${Date.now()}`, method, params },
    { method, params },
  ];

  for (const body of rpcBodies) {
    try {
      const data = (await fetchJson(`${url}/rpc`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })) as { result?: T } & T;

      if ((data as { result?: T }).result !== undefined) return (data as { result: T }).result;
      return data as T;
    } catch {
      // try next shape
    }
  }

  return null;
}

export async function gatewayGet<T = unknown>(paths: string[]): Promise<T | null> {
  const { url, token } = getGatewayConfig();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  for (const p of paths) {
    try {
      return (await fetchJson(`${url}${p}`, { headers })) as T;
    } catch {
      // try next endpoint
    }
  }

  return null;
}
