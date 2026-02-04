# 2026-Autobot-Overhaul

AI-powered autonomous task scheduling system that runs, monitors, and self-improves AI services.

## Architecture Overview

```
2026-Autobot-Overhaul/
├── src/main.ts              # Entry point — boots everything, HTTP API routes
├── scheduler/               # Core scheduler module
│   ├── engine/              # Scheduling engine (cron, cycle, time-of-day, day-of-week)
│   ├── registry/            # Service registry and lifecycle management
│   └── api/                 # Scheduler control API
├── cost-control/            # Budget and cost tracking module
│   ├── tracker/             # Token usage and cost tracking per service/task/iteration
│   ├── budget/              # Budget allocation and enforcement
│   ├── ccusage/             # Integration with ccusage for cost estimation
│   └── api/                 # Cost control API
├── services/                # AI services (each independently built)
│   ├── base-service.ts      # BaseService: shared runTask() logic
│   ├── research/            # Research service
│   ├── topic-tracker/       # Topic tracking service
│   ├── report/              # Report generation and scheduled reporting
│   ├── code-task/           # Code task execution service
│   └── self-improve/        # Self-iterative improvement service
├── web-ui/                  # Next.js 14 dashboard (standalone build, separate package.json)
│   └── app/                 # App Router pages
│       ├── page.tsx         # Dashboard: service grid + budgets + activity
│       ├── costs/           # Cost overview + per-service drilldown
│       ├── services/[id]/   # Service controls + schedule + budget management
│       ├── logs/            # Filterable log viewer
│       └── lib/api.ts       # API fetch helpers
├── shared/                  # Shared libraries and types
│   ├── types/               # Common type definitions (Service, Budget, CostEntry, etc.)
│   ├── logger/              # Structured logging (token usage, task details, iterations)
│   ├── messaging/           # EventEmitterBus: pub/sub between modules
│   ├── persistence/         # JsonStore<T>: read/write JSON files in data/
│   ├── claude-runner/       # spawnClaudeTask(): spawn Claude CLI, capture session
│   ├── config/              # loadConfig(): env vars + .env file
│   └── utils/               # generateTaskId(): slug + timestamp
└── scripts/                 # Admin CLI scripts
```

## Module Responsibilities

### Scheduler
- Register, start, stop, pause services
- Schedule by: specific time, recurring cycle, time-of-day, days-of-week
- Communicate with cost-control before running a service to check budget
- Expose service status: active, running, paused, stopped, errored

### Cost Control
- Track token spend per service, per task, per iteration
- Allocate budgets per service
- Block execution when budget is exhausted (require admin intervention)
- Use ccusage for cost estimation
- Expose cost reports and alerts

### Services (Plugin Architecture)
- Each service is an independent module with a standard interface
- Services must implement: `start()`, `stop()`, `pause()`, `resume()`, `status()`, `logs()`
- Services report token usage and task progress back to shared logger
- New services can be added without modifying scheduler or cost-control

### Web UI
- Admin dashboard showing all services, their status, and budgets
- Controls to start/stop/pause services and add budget
- Log viewer with filtering by service, time range, cost
- Overview of total spend vs total budget

## Admin CLI Commands

```bash
# Scheduler
./scripts/scheduler.sh start <service-name>
./scripts/scheduler.sh stop <service-name>
./scripts/scheduler.sh pause <service-name>
./scripts/scheduler.sh resume <service-name>
./scripts/scheduler.sh status                    # all services
./scripts/scheduler.sh status <service-name>     # single service
./scripts/scheduler.sh logs <service-name>       # view logs
./scripts/scheduler.sh logs <service-name> -f    # follow logs

# Cost Control
./scripts/cost.sh budget <service-name>           # check remaining budget
./scripts/cost.sh add-budget <service-name> <amount>
./scripts/cost.sh report                          # cost report for all services
./scripts/cost.sh report <service-name>           # cost report for one service

# Web UI
./scripts/web-ui.sh start                         # start the dashboard
./scripts/web-ui.sh stop                          # stop the dashboard
```

## Tech Stack

- **Backend** — TypeScript, Node.js, node-cron
- **Frontend** — Next.js 14, React 18 (separate package in `web-ui/`)
- **Deployment** — Cloudflare Tunnel
- **AI Runtime** — Claude CLI (spawned per task)
- **Cost Tracking** — ccusage CLI
- **Logging** — Structured JSON logs
- **Inter-module communication** — EventEmitterBus (in-process pub/sub)

## Build & Run

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

## Development Conventions

- Each service must conform to the service interface defined in `shared/types/`
- All token usage must be logged through the shared logger
- Services must not communicate directly — use the messaging layer
- Budget checks happen before every scheduled run
- Logs must include: service name, task ID, iteration number, token count, cost estimate
- New services are added by creating a new directory under `services/` and registering in the scheduler
