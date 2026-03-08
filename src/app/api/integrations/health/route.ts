import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789';
const OPENCLAW_GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || '';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const AGENT_COMMS_HEALTH_URL = process.env.AGENT_COMMS_HEALTH_URL || '';

async function probe(name: string, cmd: string) {
  try {
    const { stdout, stderr } = await execAsync(cmd);
    return { name, ok: true, output: (stdout || stderr || '').trim().slice(0, 5000) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { name, ok: false, output: message.slice(0, 5000) };
  }
}

export async function GET() {
  const authHeader = OPENCLAW_GATEWAY_TOKEN ? `-H \"Authorization: Bearer ${OPENCLAW_GATEWAY_TOKEN}\"` : '';

  const checks = await Promise.all([
    probe('openclaw-gateway', `curl -sS --max-time 4 ${authHeader} \"${OPENCLAW_GATEWAY_URL}/health\"`),
    probe('docker', 'docker ps --format "{{.Names}} {{.Status}}" | head -15'),
    probe('ollama', `curl -sS --max-time 4 \"${OLLAMA_BASE_URL}/api/tags\"`),
    AGENT_COMMS_HEALTH_URL
      ? probe('agent-comms', `curl -sS --max-time 4 \"${AGENT_COMMS_HEALTH_URL}\"`)
      : Promise.resolve({ name: 'agent-comms', ok: false, output: 'AGENT_COMMS_HEALTH_URL not configured' }),
  ]);

  const ok = checks.every((c) => c.ok || c.name === 'agent-comms');

  return NextResponse.json({
    ok,
    timestamp: new Date().toISOString(),
    checks,
  });
}
