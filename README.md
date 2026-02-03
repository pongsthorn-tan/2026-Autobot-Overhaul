# 2026-Autobot-Overhaul

AI-powered autonomous task scheduling system that runs, monitors, and cost-tracks AI services using Claude CLI.

**Live:** [https://e-autobot.pongsthorn.xyz](https://e-autobot.pongsthorn.xyz)

## What It Does

Autobot is a self-contained system for scheduling and running AI-powered services. Each service spawns Claude CLI to perform tasks (research, code generation, reporting, etc.), and the system tracks per-task costs, enforces budgets, and provides a web dashboard for monitoring and control.

### Key Features

- **Service Scheduler** — Cron, interval, time-of-day, and day-of-week scheduling with budget gating
- **Per-Task Cost Tracking** — Every Claude CLI invocation is tracked with token counts and costs via `ccusage`
- **Budget Enforcement** — Allocate budgets per service; execution pauses automatically when exhausted
- **Web Dashboard** — Real-time service status, cost drilldowns, log viewer, and service controls
- **5 Built-in Services** — Research, Topic Tracker, Report, Code Task, Self-Improve

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Web Dashboard                   │
│         (Next.js @ e-autobot.pongsthorn.xyz)     │
├─────────────────────────────────────────────────┤
│                   API Server                     │
│               (Node.js + Express-style)          │
├──────────┬──────────────┬───────────────────────┤
│ Scheduler│ Cost Control  │      Services         │
│  Engine  │  + Budgets    │  (Claude CLI tasks)   │
├──────────┴──────────────┴───────────────────────┤
│              Shared Infrastructure               │
│     Logger · MessageBus · Persistence · Types    │
└─────────────────────────────────────────────────┘
```

### Project Structure

```
├── src/main.ts              # Entry point — boots everything
├── scheduler/
│   ├── engine/              # Cron/interval/time scheduling
│   ├── registry/            # Service registry
│   └── api/                 # Scheduler facade
├── cost-control/
│   ├── tracker/             # Per-task cost recording
│   ├── budget/              # Budget allocation and enforcement
│   ├── ccusage/             # ccusage CLI integration
│   └── api/                 # Cost control facade
├── services/
│   ├── research/            # AI research service
│   ├── topic-tracker/       # Topic monitoring service
│   ├── report/              # Report generation service
│   ├── code-task/           # Code execution service
│   └── self-improve/        # Self-iterative improvement
├── shared/
│   ├── types/               # TypeScript type definitions
│   ├── logger/              # Structured JSON logging
│   ├── messaging/           # EventEmitter-based message bus
│   ├── persistence/         # JSON file store
│   ├── claude-runner/       # Claude CLI spawner
│   └── config/              # Configuration loader
├── web-ui/                  # Next.js dashboard
│   ├── app/
│   │   ├── page.tsx         # Dashboard — service grid + budgets
│   │   ├── costs/           # Cost overview + per-service drilldown
│   │   ├── services/[id]/   # Service controls + schedule config
│   │   └── logs/            # Filterable log viewer
│   └── app/lib/api.ts       # API client helpers
├── scripts/                 # CLI admin scripts
├── Dockerfile               # Multi-stage Docker build
├── docker-compose.yml       # Autobot + nginx containers
└── nginx.conf               # Reverse proxy config
```

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Claude CLI (`claude`) installed and authenticated
- `ccusage` installed (for cost tracking)

### Local Development

```bash
# Install dependencies
npm install
cd web-ui && npm install && cd ..

# Build TypeScript
npm run build

# Run the system (API + scheduler)
npm start

# Run web UI in dev mode (separate terminal)
cd web-ui && npm run dev
```

### Docker Deployment

```bash
# Build and start containers
docker compose up -d --build

# View logs
docker logs autobot -f

# Stop
docker compose down
```

The Docker setup runs:
- **autobot** container — API server (port 3000) + Next.js standalone (port 3001)
- **nginx** container — Reverse proxy (port 80) routing `/api/*` to backend, `/*` to web UI

### Cloudflare Tunnel (Production)

The system is deployed behind a Cloudflare Tunnel (`cloudflared`) that routes `e-autobot.pongsthorn.xyz` to `localhost:80` (nginx).

## Using the Dashboard

### Dashboard (`/`)

Overview of all services with status badges, budget bars, and recent activity feed. Click any service card to manage it.

### Service Detail (`/services/{id}`)

- **Controls** — Start, Stop, Pause, Resume buttons
- **Budget** — View allocated/spent/remaining, add more budget
- **Schedule** — Configure when the service runs:
  - `cron` — Standard cron expression (e.g., `0 */6 * * *`)
  - `cycle` — Run every N milliseconds
  - `time-of-day` — Run daily at a specific time
  - `day-of-week` — Run on selected days at a specific time

### Cost Overview (`/costs`)

Total spending across all services with per-service breakdown. Click "Details" to drill into per-task costs.

### Log Viewer (`/logs`)

Filter logs by service, level (debug/info/warn/error), and free-text search.

## Adding a New Service

Services are registered in code. To add a new service:

1. Create a new directory under `services/`:

```
services/my-service/index.ts
```

2. Implement the `Service` interface (or extend `BaseService`):

```typescript
import { BaseService } from "../base-service.js";
import { ServiceConfig } from "../../shared/types/service.js";

export class MyService extends BaseService {
  readonly config: ServiceConfig = {
    id: "my-service",
    name: "My Service",
    description: "What this service does",
    budget: 0,
  };

  protected getServiceId(): string {
    return "my-service";
  }

  async start(): Promise<void> {
    this._status = "running";
    // Your task logic here — use this.runClaude() for AI tasks
    this._status = "idle";
  }
}
```

3. Register it in `src/main.ts`:

```typescript
import { MyService } from "../services/my-service/index.js";

// In the main() function:
const myService = new MyService(costTracker);
registry.register(myService);
```

4. Rebuild and restart:

```bash
npm run build
docker compose up -d --build
```

The new service will appear in the dashboard automatically.

## CLI Scripts

```bash
# Scheduler control
./scripts/scheduler.sh start <service>
./scripts/scheduler.sh stop <service>
./scripts/scheduler.sh pause <service>
./scripts/scheduler.sh resume <service>
./scripts/scheduler.sh status

# Budget management
./scripts/cost.sh budget <service>
./scripts/cost.sh add-budget <service> <amount>
./scripts/cost.sh report
```

## Tech Stack

- **Backend** — TypeScript, Node.js, node-cron
- **Frontend** — Next.js 14, React 18
- **Deployment** — Docker, nginx, Cloudflare Tunnel
- **AI Runtime** — Claude CLI
- **Cost Tracking** — ccusage

## Data Persistence

All state is stored as JSON files in the `data/` directory:
- `data/budgets.json` — Budget allocations per service
- `data/cost-entries.json` — Per-task cost records
- `data/scheduler-state.json` — Schedule configurations and last-run times

In Docker, these are persisted via named volumes (`autobot-data`, `autobot-logs`, `autobot-tasks`).
