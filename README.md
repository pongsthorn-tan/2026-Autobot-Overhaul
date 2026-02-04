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
- **3 Service Modules** — Intel (Report + Research + Topic Tracker), Code Task, Self-Improve
- **Human-Readable Task IDs** — Slugs like `report-ai-breakthroughs-2026-02-04T1312` instead of UUIDs

---

## Architecture

### System Overview

```
                        ┌──────────────────────────────┐
                        │         User / Admin          │
                        └──────────┬───────────────────┘
                                   │
                        ┌──────────▼───────────────────┐
                        │  https://e-autobot.pongsthorn │
                        │       Cloudflare Tunnel       │
                        └──────┬───────────┬───────────┘
                               │           │
                ┌──────────────▼──┐  ┌─────▼──────────────┐
                │  API Server     │  │  Next.js Web UI     │
                │  (Node.js:7600) │  │  (Dev:7601)         │
                │                 │  │                     │
                │  Routes:        │  │  Pages:             │
                │  /api/services  │  │  / (Dashboard)      │
                │  /api/budgets   │  │  /tasks (Intel,     │
                │  /api/costs     │  │   Code Task,        │
                │  /api/tasks     │  │   Self-Improve)     │
                │  /api/logs      │  │  /costs             │
                │  /api/state     │  │  /services/[id]     │
                │                 │  │  /logs              │
                └──────┬──────────┘  └─────────────────────┘
                       │
         ┌─────────────┼─────────────────┐
         │             │                 │
   ┌─────▼─────┐ ┌────▼──────┐ ┌────────▼────────┐
   │ Scheduler │ │   Cost    │ │   Service       │
   │  Engine   │ │  Control  │ │   Registry      │
   │           │ │           │ │                  │
   │ cron      │ │ Budget    │ │ intel            │
   │ interval  │ │ Manager   │ │  ├ report        │
   │ daily     │ │           │ │  ├ research      │
   │ weekly    │ │ Cost      │ │  └ topic-tracker │
   │ once      │ │ Tracker   │ │ code-task        │
   │           │ │           │ │ self-improve     │
   └─────┬─────┘ │ ccusage   │ └────────┬─────────┘
         │       │ Client    │          │
         │       └─────┬─────┘          │
         │             │                │
   ┌─────▼─────────────▼────────────────▼──────────┐
   │            Shared Infrastructure               │
   │  Logger · MessageBus · Persistence · Config    │
   │  TaskStore · ClaudeRunner · Utils              │
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

Complete lifecycle of a task, from schedule trigger to final output with cost tracking.

```
 ┌─────────────────────────────────────────────────────────────────┐
 │                    1. TRIGGER                                   │
 │                                                                 │
 │  Schedule fires (cron/interval/daily/weekly/once)               │
 │  OR user clicks "Run Now" in Web UI                             │
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
 │                    3. TASK CREATION                              │
 │                                                                 │
 │  TaskExecutor.createAndRun(input)                               │
 │    → Generate taskId via generateTaskId():                      │
 │      "report-ai-breakthroughs-2026-02-04T1312"                  │
 │    → Allocate budget for task                                   │
 │    → Persist task to TaskStore                                  │
 │    → Fire-and-forget executeTask()                              │
 │    → If schedule provided, register recurring execution         │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │                    4. TASK EXECUTION                             │
 │                                                                 │
 │  BaseService.runStandalone(params, model, budgetKey, onProgress)│
 │                                                                 │
 │  a. Create working directory:                                   │
 │     tasks/<serviceId>/<taskId>/                                 │
 │                                                                 │
 │  b. Build prompt (service-specific):                            │
 │     Intel/Report  → refined prompt from SSE flow                │
 │     Intel/Research → planner + executor multi-step              │
 │     Intel/Tracker → preset-based topic tracking                 │
 │     Code Task    → description + target path                    │
 │     Self-Improve → iterative self-optimization                  │
 │                                                                 │
 │  c. Progress callbacks → SSE to Web UI (LiveLog component)     │
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
 │  c. Stream stdout chunks → SSE → LiveLog in browser             │
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
 │       serviceId: "report",                                      │
 │       taskId: "report-ai-breakthroughs-2026-02-04T1312",        │
 │       taskLabel: "report: AI breakthroughs",                    │
 │       iteration: 1,                                             │
 │       tokensInput: 5000,                                        │
 │       tokensOutput: 2000,                                       │
 │       estimatedCost: 0.45,                                      │
 │       timestamp: "2026-02-04T14:30:45.000Z"                     │
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
 │                    9. COMPLETION                                 │
 │                                                                 │
 │  TaskExecutor updates task record:                              │
 │    → status: "completed"                                        │
 │    → costSpent: total                                           │
 │    → output: concatenated Claude output                         │
 │                                                                 │
 │  Broadcast SSE "done" event → Web UI shows result               │
 │  If scheduled: wait for next trigger                            │
 └─────────────────────────────────────────────────────────────────┘
```

### Iteration Flow (Multi-Iteration Services)

Some services run the same task multiple times, each iteration building on the previous one.
The **Self-Improve** service is the primary example:

```
  SelfImproveService.start()
  │
  │  Generate shared taskId: "self-improve-system-optimization-20260204T1430"
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

All modules communicate through the EventEmitter-based MessageBus:

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
 └── tasks.json             ← TaskStore (standalone task records)

 tasks/
 └── <serviceId>/
     └── <taskId>/
         └── output.md      ← Claude CLI output saved per task

 logs/
 ├── system.jsonl           ← System-level logs
 ├── scheduler.jsonl        ← Scheduler events
 ├── task-executor.jsonl    ← Task execution logs
 └── ...                    ← One per service

 ~/.claude/projects/
 └── <project-key>/
     └── <uuid>.jsonl       ← Claude CLI session files (read by ccusage)
```

### Project Structure

```
2026-Autobot-Overhaul/
├── src/
│   └── main.ts                 # Entry point — boots everything, HTTP API + SSE routes
├── scheduler/
│   ├── engine/                 # SchedulingEngine: cron/interval/time scheduling
│   ├── registry/               # ServiceRegistry: Map of registered services
│   ├── task-executor/          # TaskExecutor: create, run, schedule standalone tasks
│   └── api/                    # SchedulerAPI: facade for HTTP routes
├── cost-control/
│   ├── tracker/                # CostTracker: records per-task costs
│   ├── budget/                 # BudgetManager: allocate/check/deduct budgets
│   ├── ccusage/                # CcusageClient: shells out to ccusage CLI
│   └── api/                    # CostControlAPI: facade for HTTP routes
├── services/
│   ├── base-service.ts         # BaseService: shared runTask()/runStandalone() logic
│   ├── intel/                  # Intel service (consolidated)
│   │   ├── index.ts            # IntelService: router for report/research/topic-tracker
│   │   ├── report.ts           # Report generation with prompt refinement
│   │   ├── research.ts         # Multi-step research with planner + executor models
│   │   ├── topic-tracker.ts    # Recurring topic monitoring with presets
│   │   ├── prompt-builder.ts   # Prompt construction for each intel style
│   │   ├── digest-store.ts     # Historical digest storage for topic tracking
│   │   └── types.ts            # Intel-specific type definitions
│   ├── code-task/              # CodeTaskService: code generation/modification tasks
│   └── self-improve/           # SelfImproveService: multi-iteration self-optimization
├── shared/
│   ├── types/                  # TypeScript types (Service, Budget, CostEntry, Task, etc.)
│   ├── logger/                 # createLogger() → structured JSON to console + file
│   ├── messaging/              # EventEmitterBus: pub/sub between modules
│   ├── persistence/            # JsonStore<T>: read/write JSON files in data/
│   ├── task-store/             # TaskStore: CRUD for standalone task records
│   ├── claude-runner/          # spawnClaudeTask(): spawn Claude CLI, capture session
│   ├── config/                 # loadConfig(): env vars + .env file
│   └── utils/                  # generateTaskId(): slug + timestamp
├── web-ui/                     # Next.js 14 dashboard (separate package.json)
│   ├── app/
│   │   ├── layout.tsx          # Root layout with nav sidebar
│   │   ├── page.tsx            # Dashboard: service grid + budgets + activity
│   │   ├── tasks/
│   │   │   ├── page.tsx        # Task page: 3 tabs (Intel, Code Task, Self-Improve)
│   │   │   ├── [taskId]/       # Task detail: live log + report viewer
│   │   │   └── components/
│   │   │       ├── task-form-intel.tsx      # Unified Intel form (Report/Research/Tracker)
│   │   │       ├── task-form-code-task.tsx  # Code Task form
│   │   │       ├── task-form-self-improve.tsx # Self-Improve form
│   │   │       ├── task-list.tsx            # Task list with style badges
│   │   │       └── common-fields.tsx        # Shared model/budget/schedule fields
│   │   ├── costs/              # Cost overview + per-service drilldown
│   │   ├── services/[id]/      # Service controls + schedule + budget management
│   │   ├── logs/               # Filterable log viewer (service, level, search)
│   │   ├── components/
│   │   │   ├── live-log.tsx    # SSE-powered real-time task/refine log
│   │   │   └── report-renderer.tsx # Rich report output renderer
│   │   └── lib/
│   │       ├── api.ts          # apiFetch/apiPost/apiPut + SSE stream helpers
│   │       └── format-date.ts  # Date formatting utility
│   ├── next.config.js          # standalone output mode
│   └── package.json            # Separate deps (next, react, react-dom, typescript)
├── scripts/                    # CLI admin scripts (curl to API)
├── CHANGELOG.md
├── CLAUDE.md                   # AI assistant project context
├── package.json
└── tsconfig.json
```

---

## Web UI

### Tasks Page (`/tasks`)

The tasks page has 3 tabs:

| Tab | Services | Description |
|-----|----------|-------------|
| **Intel** | Report, Research, Topic Tracker | Unified form with style selector pills. Task list shows all 3 types with color-coded style badges. |
| **Code Task** | Code Task | Description + target path + max iterations |
| **Self-Improve** | Self-Improve | Multi-iteration self-optimization |

#### Intel Tab Styles

- **Report** — Multi-step flow: Describe → (optional AI refinement via SSE) → Review → Configure → Run. Supports prompt versioning and refine-again.
- **Research** — Dual model pickers (planner + executor), configurable max steps and revisions per step.
- **Topic Tracker** — Preset system (Company News, Market & Crypto, Election, Tech Launch, Custom) with interval/weekly scheduling and spending limits.

### Dashboard (`/`)

Overview of all services with status badges, budget bars, and recent activity feed. Click any service card to manage it.

### Service Detail (`/services/{id}`)

- **Controls** — Start, Stop, Pause, Resume buttons
- **Budget** — View allocated/spent/remaining, add more budget
- **Schedule** — Configure when the service runs (cron, interval, time-of-day, day-of-week)

### Cost Overview (`/costs`)

Total spending across all services with per-service breakdown. Click "Details" to drill into per-task costs with iteration-level granularity.

### Log Viewer (`/logs`)

Filter logs by service, level (debug/info/warn/error), and free-text search. Auto-refreshes every 5 seconds.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Claude CLI (`claude`) installed and authenticated
- `ccusage` installed (for cost tracking)

### Local Development

```bash
# Install dependencies
npm install
cd web-ui && npm install && cd ..

# Build TypeScript
npm run build

# Run the system (API + scheduler) — port 7600
npm start

# Run web UI in dev mode (separate terminal) — port 7601
cd web-ui && npm run dev
```

### Production (Cloudflare Tunnel)

The system runs behind a Cloudflare Tunnel (`cloudflared`) that routes `e-autobot.pongsthorn.xyz` to the local ports.

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
npm run build && npm start
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
- **Deployment** — Cloudflare Tunnel
- **AI Runtime** — Claude CLI (spawned per task)
- **Cost Tracking** — ccusage CLI
- **Logging** — Structured JSON logs
- **Inter-module Communication** — EventEmitterBus (in-process pub/sub)
