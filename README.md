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

---

## Architecture

### System Overview

```
                        ┌──────────────────────────────┐
                        │         User / Admin          │
                        └──────────┬───────────────────┘
                                   │
                        ┌──────────▼───────────────────┐
                        │   https://e-autobot.pongsthorn│
                        │        Cloudflare Tunnel       │
                        └──────────┬───────────────────┘
                                   │
                        ┌──────────▼───────────────────┐
                        │     nginx (port 80)           │
                        │  /api/* → backend:3000        │
                        │  /*     → webui:3001          │
                        └──────┬───────────┬───────────┘
                               │           │
                ┌──────────────▼──┐  ┌─────▼──────────────┐
                │  API Server     │  │  Next.js Web UI     │
                │  (Node.js:3000) │  │  (Standalone:3001)  │
                │                 │  │                     │
                │  Routes:        │  │  Pages:             │
                │  /api/services  │  │  / (Dashboard)      │
                │  /api/budgets   │  │  /costs             │
                │  /api/costs     │  │  /costs/[serviceId] │
                │  /api/logs      │  │  /services/[id]     │
                │  /api/state     │  │  /logs              │
                └──────┬──────────┘  └─────────────────────┘
                       │
         ┌─────────────┼─────────────────┐
         │             │                 │
   ┌─────▼─────┐ ┌────▼──────┐ ┌────────▼────────┐
   │ Scheduler │ │   Cost    │ │   Service       │
   │  Engine   │ │  Control  │ │   Registry      │
   │           │ │           │ │                  │
   │ cron      │ │ Budget    │ │ research         │
   │ interval  │ │ Manager   │ │ topic-tracker    │
   │ daily     │ │           │ │ report           │
   │ weekly    │ │ Cost      │ │ code-task        │
   │ once      │ │ Tracker   │ │ self-improve     │
   └─────┬─────┘ │           │ └────────┬─────────┘
         │       │ ccusage   │          │
         │       │ Client    │          │
         │       └─────┬─────┘          │
         │             │                │
   ┌─────▼─────────────▼────────────────▼──────────┐
   │            Shared Infrastructure               │
   │  Logger · MessageBus · Persistence · Config    │
   └────────────────────┬──────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │    Claude CLI     │
              │  (spawned per     │
              │   task iteration) │
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │   ccusage CLI     │
              │  (cost query      │
              │   per session)    │
              └───────────────────┘
```

### Process Flow: From Input to Output

This is the complete lifecycle of a task, from schedule trigger to final output with cost tracking.

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                    1. TRIGGER                                   │
 │                                                                 │
 │  Schedule fires (cron/interval/daily/weekly/once)               │
 │  OR user clicks "Start" in Web UI                               │
 │  OR CLI: ./scripts/scheduler.sh start <service>                 │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    2. BUDGET GATE                                │
 │                                                                 │
 │  SchedulingEngine.executeService(serviceId)                     │
 │    → CostControlAPI.checkBudget(serviceId)                      │
 │      → BudgetManager.check(serviceId)                           │
 │        → Load data/budgets.json                                 │
 │        → Return { allowed: true/false, budget }                 │
 │                                                                 │
 │  If budget exhausted:                                           │
 │    → Publish "budget.exhausted" event on MessageBus             │
 │    → Service is auto-paused                                     │
 │    → STOP (admin must add budget via UI or CLI)                 │
 └──────────────────────┬──────────────────────────────────────────┘
                        │ allowed = true
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    3. SERVICE START                              │
 │                                                                 │
 │  Publish "service.started" on MessageBus                        │
 │  Set service status → "running"                                 │
 │  Call service.start()                                           │
 │                                                                 │
 │  Each service loads its task queue:                              │
 │    Research   → data/research-topics.json (list of topics)      │
 │    SelfImprove → generates taskId, runs N iterations            │
 │    CodeTask   → data/code-tasks.json (list of code tasks)       │
 │    Report     → data/report-topics.json                         │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    4. TASK EXECUTION (per task in queue)         │
 │                                                                 │
 │  BaseService.runTask({ label, prompt, maxTurns, iteration })    │
 │                                                                 │
 │  a. Generate taskId:                                            │
 │     "research-ai-trends-2026-20260203T143022"                   │
 │                                                                 │
 │  b. Create working directory:                                   │
 │     tasks/<serviceId>/<taskId>/                                 │
 │                                                                 │
 │  c. Log: "Starting task: <label>"                               │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    5. CLAUDE CLI SPAWN                           │
 │                                                                 │
 │  spawnClaudeTask({ prompt, workingDir, maxTurns })              │
 │                                                                 │
 │  a. Snapshot JSONL files in:                                    │
 │     ~/.claude/projects/<project-key>/                           │
 │     (project-key = workingDir with / replaced by -)             │
 │                                                                 │
 │  b. Spawn child process:                                        │
 │     claude --print --dangerously-skip-permissions               │
 │            -p "<prompt>" --max-turns <N>                         │
 │     (cwd = task working directory)                              │
 │                                                                 │
 │  c. Collect stdout (AI output) + stderr                         │
 │                                                                 │
 │  d. Wait for process exit                                       │
 │                                                                 │
 │  e. Wait 1.5s for session file flush                            │
 │                                                                 │
 │  f. Diff JSONL files → find new session UUID                    │
 │                                                                 │
 │  g. Return { exitCode, stdout, stderr, sessionId }              │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    6. COST CAPTURE                               │
 │                                                                 │
 │  CostTracker.captureAndRecordCost({                             │
 │    serviceId, taskId, taskLabel, iteration, sessionId           │
 │  })                                                             │
 │                                                                 │
 │  a. Query ccusage CLI:                                          │
 │     ccusage session --json --id <sessionId>                     │
 │     → { inputTokens, outputTokens, cacheCreation,              │
 │         cacheRead, totalCost }                                  │
 │                                                                 │
 │  b. Create CostEntry:                                           │
 │     {                                                           │
 │       serviceId: "research",                                    │
 │       taskId: "research-ai-trends-2026-20260203T143022",        │
 │       taskLabel: "research: AI trends 2026",                    │
 │       iteration: 1,                                             │
 │       tokensInput: 5000,                                        │
 │       tokensOutput: 2000,                                       │
 │       estimatedCost: 0.45,                                      │
 │       timestamp: "2026-02-03T14:30:45.000Z"                     │
 │     }                                                           │
 │                                                                 │
 │  c. Persist → append to data/cost-entries.json                  │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    7. BUDGET DEDUCTION                           │
 │                                                                 │
 │  BudgetManager.deduct(serviceId, cost)                          │
 │    → budget.spent += 0.45                                       │
 │    → budget.remaining = allocated - spent                       │
 │    → Persist to data/budgets.json                               │
 │                                                                 │
 │  If remaining < threshold:                                      │
 │    → Publish "budget.exhausted" on MessageBus                   │
 │    → SchedulingEngine auto-pauses service                       │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    8. LOGGING & EVENTS                           │
 │                                                                 │
 │  a. Publish "cost.recorded" on MessageBus                       │
 │                                                                 │
 │  b. Create TaskLog entry:                                       │
 │     { taskId, serviceId, iteration, tokensUsed,                 │
 │       costEstimate, message, timestamp }                        │
 │                                                                 │
 │  c. Write to logs/<serviceId>.jsonl                             │
 │     Write to console (structured JSON)                          │
 │                                                                 │
 │  d. Save output → tasks/<serviceId>/<taskId>/output.md          │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    9. NEXT TASK OR COMPLETE                      │
 │                                                                 │
 │  If more tasks in queue AND status == "running":                │
 │    → Loop back to step 4 (next task)                            │
 │                                                                 │
 │  If no more tasks:                                              │
 │    → Set service status → "idle"                                │
 │    → Persist scheduler state to data/scheduler-state.json       │
 │    → Log "Service completed: <serviceId>"                       │
 └─────────────────────────────────────────────────────────────────┘
```

### Iteration Flow (Multi-Iteration Services)

Some services run the same task multiple times, each iteration building on the previous one.
The **Self-Improve** service is the primary example:

```
  SelfImproveService.start()
  │
  │  Generate shared taskId: "self-improve-system-optimization-20260203T143022"
  │
  ├── Iteration 1 ──────────────────────────────────────────────┐
  │   runTask({                                                 │
  │     label: "system optimization (iteration 1/3)",           │
  │     prompt: "Iteration 1 of 3: Analyze the autobot system   │
  │              logs, performance metrics...",                  │
  │     iteration: 1,                                           │
  │     existingTaskId: taskId   ← same taskId across all iters │
  │   })                                                        │
  │   → Spawn Claude CLI → capture output → record cost         │
  │   Result: CostEntry { iteration: 1, cost: $0.90 }          │
  │                                                             │
  ├── Iteration 2 ──────────────────────────────────────────────┤
  │   runTask({                                                 │
  │     label: "system optimization (iteration 2/3)",           │
  │     iteration: 2,                                           │
  │     existingTaskId: taskId                                  │
  │   })                                                        │
  │   → Spawn Claude CLI → capture output → record cost         │
  │   Result: CostEntry { iteration: 2, cost: $0.75 }          │
  │                                                             │
  ├── Iteration 3 ──────────────────────────────────────────────┤
  │   runTask({                                                 │
  │     label: "system optimization (iteration 3/3)",           │
  │     iteration: 3,                                           │
  │     existingTaskId: taskId                                  │
  │   })                                                        │
  │   → Spawn Claude CLI → capture output → record cost         │
  │   Result: CostEntry { iteration: 3, cost: $0.60 }          │
  │                                                             │
  └─────────────────────────────────────────────────────────────┘

  TaskCostSummary for this task:
  ┌─────────────────────────────────────────────────────────┐
  │ taskId: "self-improve-system-optimization-2026..."       │
  │ taskLabel: "self-improve: system optimization"           │
  │ iterationCount: 3                                       │
  │ totalCost: $2.25  ($0.90 + $0.75 + $0.60)              │
  │ entries: [CostEntry×1, CostEntry×2, CostEntry×3]        │
  └─────────────────────────────────────────────────────────┘
```

Each iteration:
1. Gets its own Claude CLI session (separate process spawn)
2. Gets its own session JSONL file in `~/.claude/projects/`
3. Gets its own `CostEntry` with individual token counts and cost
4. Shares the same `taskId` so they're grouped in the cost dashboard
5. Can be interrupted mid-loop if the service is paused/stopped or budget runs out

### Event Flow (MessageBus)

All modules communicate through the EventEmitter-based MessageBus. Events flow like this:

```
 Schedule fires
    │
    ▼
 ┌──────────────────────────────────────────────────────┐
 │ "service.started"  → logged by system logger         │
 │                                                      │
 │ "cost.recorded"    → logged by system logger         │
 │                      (fires after each iteration)    │
 │                                                      │
 │ "budget.added"     → fires when admin adds budget    │
 │                                                      │
 │ "budget.exhausted" → auto-pauses the service         │
 │                      via SchedulingEngine             │
 │                                                      │
 │ "service.paused"   → logged, scheduler suspends      │
 │ "service.stopped"  → logged, timer cleared           │
 │ "service.errored"  → logged if service throws        │
 └──────────────────────────────────────────────────────┘
```

### Data Flow: Where Things Are Stored

```
 data/
 ├── budgets.json           ← BudgetManager (per-service allocations)
 ├── cost-entries.json      ← CostTracker (every iteration's cost)
 ├── scheduler-state.json   ← SchedulingEngine (schedules, last run)
 ├── research-topics.json   ← ResearchService (topic queue)
 ├── code-tasks.json        ← CodeTaskService (task queue)
 └── report-topics.json     ← ReportService (report queue)

 tasks/
 └── <serviceId>/
     └── <taskId>/
         └── output.md      ← Claude CLI output saved per task

 logs/
 ├── system.jsonl           ← System-level logs
 ├── scheduler.jsonl        ← Scheduler events
 ├── research.jsonl         ← Research service logs
 ├── topic-tracker.jsonl    ← Topic tracker logs
 └── ...                    ← One per service

 ~/.claude/projects/
 └── <project-key>/
     └── <uuid>.jsonl       ← Claude CLI session files (read by ccusage)
```

### Project Structure

```
├── src/main.ts              # Entry point — boots everything, HTTP API routes
├── scheduler/
│   ├── engine/              # SchedulingEngine: cron/interval/time scheduling
│   ├── registry/            # ServiceRegistry: Map of registered services
│   └── api/                 # SchedulerAPI: facade for HTTP routes
├── cost-control/
│   ├── tracker/             # CostTracker: records per-task costs
│   ├── budget/              # BudgetManager: allocate/check/deduct budgets
│   ├── ccusage/             # CcusageClient: shells out to ccusage CLI
│   └── api/                 # CostControlAPI: facade for HTTP routes
├── services/
│   ├── base-service.ts      # BaseService: shared runTask() logic
│   ├── research/            # ResearchService: topic queue → Claude research
│   ├── topic-tracker/       # TopicTrackerService: monitors topics
│   ├── report/              # ReportService: generates reports
│   ├── code-task/           # CodeTaskService: code generation tasks
│   └── self-improve/        # SelfImproveService: multi-iteration optimization
├── shared/
│   ├── types/               # TypeScript types (Service, Budget, CostEntry, etc.)
│   ├── logger/              # createLogger() → structured JSON to console + file
│   ├── messaging/           # EventEmitterBus: pub/sub between modules
│   ├── persistence/         # JsonStore<T>: read/write JSON files in data/
│   ├── claude-runner/       # spawnClaudeTask(): spawn Claude CLI, capture session
│   ├── config/              # loadConfig(): env vars + .env file
│   └── utils/               # generateTaskId(): slug + timestamp
├── web-ui/                  # Next.js 14 dashboard (standalone build)
│   ├── app/
│   │   ├── page.tsx         # Dashboard: service grid + budgets + activity
│   │   ├── costs/           # Cost overview + per-service drilldown per task
│   │   ├── services/[id]/   # Service controls + schedule + budget management
│   │   ├── logs/            # Filterable log viewer (service, level, search)
│   │   └── lib/api.ts       # apiFetch/apiPost/apiPut helpers
│   ├── next.config.js       # standalone output mode
│   └── package.json         # separate deps (next, react, react-dom, typescript)
├── scripts/                 # CLI admin scripts (curl to API)
├── Dockerfile               # Multi-stage: backend build → webui build → production
├── docker-compose.yml       # autobot + nginx containers with named volumes
├── docker-entrypoint.sh     # Starts API server + Next.js standalone
└── nginx.conf               # Reverse proxy: /api/* → 3000, /* → 3001
```

---

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

---

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

Total spending across all services with per-service breakdown. Click "Details" to drill into per-task costs with iteration-level granularity.

### Log Viewer (`/logs`)

Filter logs by service, level (debug/info/warn/error), and free-text search. Auto-refreshes every 5 seconds.

---

## Adding a New Service

Services are registered in code. To add a new service:

1. Create a new directory under `services/`:

```
services/my-service/index.ts
```

2. Extend `BaseService` and implement `start()`:

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

    // Single task example:
    await this.runTask({
      label: "analyze something",
      prompt: "Your prompt to Claude here...",
      maxTurns: 5,
    });

    // Multi-iteration example:
    const taskId = generateTaskId("my-service", "optimization");
    for (let i = 1; i <= 3; i++) {
      if (this._status !== "running") break;
      await this.runTask({
        label: `optimization (iteration ${i}/3)`,
        prompt: `Iteration ${i}: improve the thing...`,
        iteration: i,
        existingTaskId: taskId,
      });
    }

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

---

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
