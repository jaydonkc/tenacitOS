# TenacitOS — Mission Control

A real-time dashboard and control center for [OpenClaw](https://openclaw.ai) AI agent instances. Built with Next.js, React 19, and Tailwind CSS v4.

> **TenacitOS** lives inside your OpenClaw workspace and reads its configuration, agents, sessions, memory, and logs directly from the host. No extra database or backend required — OpenClaw is the backend.

---

## Features

- **📊 System Monitor** — Real-time VPS metrics (CPU, RAM, Disk, Network) + PM2/Docker status
- **🤖 Agent Dashboard** — All agents, their sessions, token usage, model, and activity status
- **💰 Cost Tracking** — Real cost analytics from OpenClaw sessions (SQLite)
- **⏰ Cron Manager** — Visual cron manager with weekly timeline, run history, and manual triggers
- **📋 Activity Feed** — Real-time log of agent actions with heatmap and charts
- **🧠 Memory Browser** — Explore, search, and edit agent memory files
- **📁 File Browser** — Navigate workspace files with preview and in-browser editing
- **🔎 Global Search** — Full-text search across memory and workspace files
- **🔔 Notifications** — Real-time notification center with unread badge
- **🏢 Office 3D** — Interactive 3D office with one desk per agent (React Three Fiber)
- **📺 Terminal** — Read-only terminal for safe status commands
- **⚙️ Setup Checklist** — Built-in checks for environment, gateway reachability, and OpenClaw config

---

## Screenshots

**Dashboard** — activity overview, agent status, and weather widget

![Dashboard](./docs/screenshots/dashboard.jpg)

**Session History** — all OpenClaw sessions with token usage and context tracking

![Sessions](./docs/screenshots/sessions.jpg)

**Costs & Analytics** — daily cost trends and breakdown per agent

![Costs](./docs/screenshots/costs.jpg)

**System Monitor** — real-time CPU, RAM, Disk, and Network metrics

![System Monitor](./docs/screenshots/system.jpg)

**Office 3D** — interactive 3D office with one voxel avatar per agent (React Three Fiber)

![Office 3D](./docs/screenshots/office3d.jpg)

---

## Requirements

- **Node.js** 18+ (tested with v22)
- **[OpenClaw](https://openclaw.ai)** installed and running on the same host
- **PM2** or **systemd** (recommended for production)
- **Caddy** or another reverse proxy (for HTTPS in production)

---

## How it works

TenacitOS reads directly from your OpenClaw installation:

```
/home/node/.openclaw/         ← OPENCLAW_DIR (configurable)
├── openclaw.json             ← agents list, channels, models config
├── workspace/                ← main agent workspace (MEMORY.md, SOUL.md, etc.)
├── workspace-studio/         ← sub-agent workspaces
├── workspace-infra/
├── ...
└── workspace/mission-control/ ← TenacitOS lives here
```

The app uses `OPENCLAW_DIR` to locate `openclaw.json` and all workspaces. **No manual agent configuration needed** — agents are auto-discovered from `openclaw.json`.

---

## Installation

### 1. Clone into your OpenClaw workspace

```bash
cd /home/node/.openclaw/workspace   # or your OPENCLAW_DIR/workspace
git clone https://github.com/carlosazaustre/tenacitOS.git mission-control
cd mission-control
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```env
# --- OpenClaw paths (optional — defaults work for standard installs) ---
# OPENCLAW_DIR=/home/node/.openclaw

# --- Gateway / integrations (optional — defaults work for standard installs) ---
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=
OLLAMA_BASE_URL=http://127.0.0.1:11434
AGENT_COMMS_HEALTH_URL=

# --- Notion pipeline sync + live board status (optional) ---
# Paste either the raw UUID or the full Notion URL for each board.
NOTION_TOKEN=
NOTION_INTERNSHIPS_DATABASE_ID=
NOTION_HOUSING_DATABASE_ID=

# --- Branding (customize for your instance) ---
NEXT_PUBLIC_AGENT_NAME=Mission Control
NEXT_PUBLIC_AGENT_EMOJI=🤖
NEXT_PUBLIC_AGENT_DESCRIPTION=Your AI co-pilot, powered by OpenClaw
NEXT_PUBLIC_AGENT_LOCATION=             # e.g. "Madrid, Spain"
NEXT_PUBLIC_BIRTH_DATE=                 # ISO date, e.g. "2026-01-01"
NEXT_PUBLIC_AGENT_AVATAR=               # path to image in /public, e.g. "/avatar.jpg"

NEXT_PUBLIC_OWNER_USERNAME=your-username
NEXT_PUBLIC_OWNER_EMAIL=your-email@example.com
NEXT_PUBLIC_TWITTER_HANDLE=@username
NEXT_PUBLIC_COMPANY_NAME=MISSION CONTROL, INC.
NEXT_PUBLIC_APP_TITLE=Mission Control
```

> **Tip:** `OPENCLAW_DIR` defaults to `/home/node/.openclaw`. If your OpenClaw is installed elsewhere, set this variable.

### Jaydon stack integration (OpenClaw + Docker + Ollama + agent-comms)

Set these in `.env.local` when running on Jaydon's stack:

```env
OPENCLAW_DIR=/home/node/.openclaw
OPENCLAW_WORKSPACE=/home/node/.openclaw/workspace
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
# Optional if gateway auth enabled
OPENCLAW_GATEWAY_TOKEN=

OLLAMA_BASE_URL=http://127.0.0.1:11434
# Optional external or local health URL for your agent communication service
AGENT_COMMS_HEALTH_URL=http://127.0.0.1:8787/health
```

Health hooks are available at:

- `GET /api/integrations/health` (gateway + Docker + Ollama + optional agent-comms)
- `GET /api/setup/status` (env checklist + openclaw.json detection + gateway connectivity)
- `POST /api/actions` with actions: `gateway-status`, `restart-gateway`, `gateway-health`, `gateway-logs`, `session-ping`, `check-docker`, `check-ollama`, `check-agent-comms`

### Jaydon run flow (exact order)

```bash
cd /home/node/.openclaw/workspace/tenacitOS
cp .env.example .env.local
# edit .env.local if you need non-default OpenClaw, gateway, or branding values
npm install
npm run dev
```

Then in the UI:

1. Go to **Settings → OpenClaw Control Plane**
2. Complete the **OpenClaw Setup Checklist**
3. Confirm gateway status from quick actions
4. Visit **Agents / Sessions / Cron / Skills** and verify data is live

If gateway-backed data is unavailable, TenacitOS falls back to CLI/filesystem reads automatically.

### Notion-backed pipelines

The Pipelines page can read live Notion board state when these are set:

```env
NOTION_TOKEN=secret_...
NOTION_INTERNSHIPS_DATABASE_ID=https://www.notion.so/...
NOTION_HOUSING_DATABASE_ID=https://www.notion.so/...
```

TenacitOS will resolve the configured database or data source, detect the Notion `Status` property, and show:

- live item counts per status
- whether the Notion stages match the pipeline stages in the dashboard
- the last edited time of the board

### 3. Initialize data files

```bash
cp data/cron-jobs.example.json data/cron-jobs.json
cp data/activities.example.json data/activities.json
cp data/notifications.example.json data/notifications.json
cp data/configured-skills.example.json data/configured-skills.json
cp data/tasks.example.json data/tasks.json
```

### 4. Run

```bash
# Development
npm run dev
# → http://localhost:3000

# Production build
npm run build
npm start
```

Open `http://localhost:3000`.

### 5. Run with Docker (optional)

```bash
# Build + run TenacitOS container
docker compose up -d --build

# With bundled Ollama service profile
docker compose --profile ollama up -d --build

# Logs
docker compose logs -f tenacitos
```

The compose file mounts `/home/node/.openclaw` read-only so TenacitOS can inspect OpenClaw safely.

---

## Production Deployment

### PM2 (recommended)

```bash
npm run build

pm2 start npm --name "mission-control" -- start
pm2 save
pm2 startup   # enable auto-restart on reboot
```

### systemd

Create `/etc/systemd/system/mission-control.service`:

```ini
[Unit]
Description=TenacitOS — OpenClaw Mission Control
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/node/.openclaw/workspace/mission-control
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable mission-control
sudo systemctl start mission-control
```

### Reverse proxy — Caddy (HTTPS)

```caddy
mission-control.yourdomain.com {
    reverse_proxy localhost:3000
}
```

> If you expose TenacitOS beyond localhost, put it behind HTTPS and a network boundary you control.

---

## Configuration

### Agent branding

All personal data stays in `.env.local` (gitignored). The `src/config/branding.ts` file reads from env vars — **never edit it directly** with your personal data.

### Agent discovery

Agents are auto-discovered from `openclaw.json` at startup. The `/api/agents` endpoint reads:

```json
{
  "agents": {
    "list": [
      { "id": "main", "name": "...", "workspace": "...", "model": {...} },
      { "id": "studio", "name": "...", "workspace": "..." }
    ]
  }
}
```

Each agent can define its own visual appearance in `openclaw.json`:

```json
{
  "id": "studio",
  "name": "My Studio Agent",
  "ui": {
    "emoji": "🎬",
    "color": "#E91E63"
  }
}
```

### Office 3D — agent positions

The 3D office has default positions for up to 6 agents. To customize positions, names, and colors for your own agents, edit `src/components/Office3D/agentsConfig.ts`:

```ts
export const AGENTS: AgentConfig[] = [
  {
    id: "main",       // must match workspace ID
    name: "...",      // display name (can also come from API)
    emoji: "🤖",
    position: [0, 0, 0],
    color: "#FFCC00",
    role: "Main Agent",
  },
  // add your sub-agents here
];
```

### 3D Avatar models

To add custom 3D avatars (Ready Player Me GLB format), place them in `public/models/`:

```
public/models/
├── main.glb        ← main agent avatar
├── studio.glb      ← workspace-studio agent
└── infra.glb       ← workspace-infra agent
```

Filename must match the agent `id`. If no file is found, a colored sphere is shown as fallback.  
See `public/models/README.md` for full instructions.

### Cost tracking

Usage is collected from OpenClaw's SQLite databases via a script:

```bash
# Collect once
npx tsx scripts/collect-usage.ts

# Auto-collect every hour (adds a cron job)
./scripts/setup-cron.sh
```

See [docs/COST-TRACKING.md](./docs/COST-TRACKING.md) for details.

---

## Project Structure

```
mission-control/
├── src/
│   ├── app/
│   │   ├── (dashboard)/      # Dashboard pages
│   │   ├── api/              # API routes
│   │   ├── login/            # Legacy redirect to the dashboard root
│   │   └── office/           # 3D office route
│   ├── components/
│   │   ├── TenacitOS/        # OS-style UI shell (topbar, dock, status bar)
│   │   └── Office3D/         # React Three Fiber 3D office
│   ├── config/
│   │   └── branding.ts       # Branding constants (reads from env vars)
│   └── lib/                  # Utilities (pricing, queries, activity logger...)
├── data/                     # JSON data files (gitignored — use .example versions)
├── docs/                     # Extended documentation
├── public/
│   └── models/               # GLB avatar models (add your own)
├── scripts/                  # Setup and data collection scripts
├── .env.example              # Environment variable template
└── README.md                 # Project overview and setup
```

---

## Security

- TenacitOS does not include built-in dashboard authentication. Restrict access with your reverse proxy, VPN, firewall, or private network.
- Keep OpenClaw Gateway on loopback or protect it with `OPENCLAW_GATEWAY_TOKEN` when exposed outside localhost.
- Terminal API uses a strict command allowlist — `env`, `curl`, `wget`, `node`, and `python` are blocked.
- **Never commit `.env.local`** — it contains your local paths, tokens, and branding values.

---

## Troubleshooting

**"Gateway not reachable" / agent data missing**

```bash
openclaw status
openclaw gateway start   # if not running
```

**"Database not found" (cost tracking)**

```bash
npx tsx scripts/collect-usage.ts
```

**Build errors after pulling updates**

```bash
rm -rf .next node_modules
npm install
npm run build
```

**Scripts not executable**

```bash
chmod +x scripts/*.sh
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 15 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| 3D | React Three Fiber + Drei |
| Charts | Recharts |
| Icons | Lucide React |
| Database | SQLite (better-sqlite3) |
| Runtime | Node.js 22 |

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. **Keep personal data out of commits** — use `.env.local` and `data/` (both gitignored)
4. Write clear commit messages
5. Open a PR

See [CONTRIBUTING.md](./CONTRIBUTING.md) for more details.

---

## License

MIT — see [LICENSE](./LICENSE)

---

## Links

- [OpenClaw](https://openclaw.ai) — the AI agent runtime this dashboard is built for
- [OpenClaw Docs](https://docs.openclaw.ai)
- [Discord Community](https://discord.com/invite/clawd)
- [GitHub Issues](../../issues) — bug reports and feature requests
