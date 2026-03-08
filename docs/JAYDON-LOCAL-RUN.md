# TenacitOS on Jaydon's OpenClaw Stack

## 1) Clone + install

```bash
cd /home/node/.openclaw/workspace
git clone https://github.com/carlosazaustre/tenacitOS.git
cd tenacitOS
npm install --include=dev
```

## 2) Configure env safely

```bash
cp .env.example .env.local
```

Set at minimum:

```env
ADMIN_PASSWORD=replace-with-strong-password
AUTH_SECRET=$(openssl rand -base64 32)
OPENCLAW_DIR=/home/node/.openclaw
OPENCLAW_WORKSPACE=/home/node/.openclaw/workspace
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OLLAMA_BASE_URL=http://127.0.0.1:11434
# optional
OPENCLAW_GATEWAY_TOKEN=
AGENT_COMMS_HEALTH_URL=http://127.0.0.1:8787/health
```

## 3) Initialize data files

```bash
cp data/cron-jobs.example.json data/cron-jobs.json
cp data/activities.example.json data/activities.json
cp data/notifications.example.json data/notifications.json
cp data/configured-skills.example.json data/configured-skills.json
cp data/tasks.example.json data/tasks.json
```

## 4) Run (Node)

```bash
npm run dev
# or
npm run build && npm start
```

## 5) Run (Docker)

```bash
docker compose up -d --build
# optional bundled Ollama
docker compose --profile ollama up -d --build
```

## 6) Verify hooks

```bash
curl -s http://localhost:3000/api/integrations/health | jq
```

Quick action API hooks now include:
- `gateway-health`
- `gateway-logs`
- `check-docker`
- `check-ollama`
- `check-agent-comms`
