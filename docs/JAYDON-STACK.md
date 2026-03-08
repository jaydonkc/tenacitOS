# Jaydon OpenClaw Stack Setup

## Required env vars

- None. TenacitOS uses sensible defaults when env overrides are unset.

## Recommended env vars

- `OPENCLAW_DIR=/home/node/.openclaw`
- `OPENCLAW_WORKSPACE=/home/node/.openclaw/workspace`
- `OPENCLAW_GATEWAY_TOKEN=` (if auth enabled)
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `AGENT_COMMS_HEALTH_URL=`

## Run

```bash
cd /home/node/.openclaw/workspace/tenacitOS
npm install
npm run dev
```

Open `http://localhost:3000`, then check:

- Settings → OpenClaw Setup Checklist
- Actions → Gateway Status / Restart Gateway / Gateway Logs
- Sessions page (should show live OpenClaw session keys)

## Data source strategy

TenacitOS now uses:

1. **Gateway RPC first** (`/rpc`, methods like `sessions.list`, `cron.list`, `skills.list`)
2. Gateway REST fallback (`/api/...` / legacy endpoints)
3. OpenClaw CLI/filesystem fallback (safe mode)

This keeps core pages functional even when gateway routes vary by version.
