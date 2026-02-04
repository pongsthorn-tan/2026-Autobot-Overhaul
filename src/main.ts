import "dotenv/config";
import { EventEmitterBus } from "../shared/messaging/index.js";
import { createLogger } from "../shared/logger/index.js";
import { loadConfig } from "../shared/config/index.js";
import { BudgetManager } from "../cost-control/budget/index.js";
import { CostTracker } from "../cost-control/tracker/index.js";
import { CcusageClient } from "../cost-control/ccusage/index.js";
import { CostControlAPI } from "../cost-control/api/index.js";
import { ServiceRegistry } from "../scheduler/registry/index.js";
import { SchedulingEngine } from "../scheduler/engine/index.js";
import { SchedulerAPI } from "../scheduler/api/index.js";
import { TaskExecutor } from "../scheduler/task-executor/index.js";
import { TaskStore } from "../shared/task-store/index.js";
import { ResearchIntelService } from "../services/intel/research.js";
import { TopicTrackerIntelService } from "../services/intel/topic-tracker.js";
import { ReportIntelService } from "../services/intel/report.js";
import { CodeTaskService } from "../services/code-task/index.js";
import { SelfImproveService } from "../services/self-improve/index.js";
import { BaseService } from "../services/base-service.js";
import { ClaudeModel } from "../shared/types/service.js";
import { CreateTaskInput } from "../shared/types/task.js";
import { Schedule, ScheduleConfig, ScheduleSlot } from "../shared/types/scheduler.js";
import { spawnClaudeTask } from "../shared/claude-runner/index.js";
import { TaskProgressEvent, ProgressCallback } from "../services/base-service.js";
import { v4 as uuidv4 } from "uuid";
import { createServer, ServerResponse } from "http";


const logger = createLogger("system");

// In-memory job store for async refinement jobs
interface RefineJob {
  status: "running" | "completed" | "errored";
  refinedPrompt?: string;
  cost?: number;
  sessionId?: string;
  error?: string;
  createdAt: number;
  fullPrompt?: string;
  model?: string;
}

const refineJobs = new Map<string, RefineJob>();

// Clean up jobs older than 30 minutes every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of refineJobs) {
    if (job.createdAt < cutoff) refineJobs.delete(id);
  }
}, 5 * 60 * 1000);

// SSE streaming infrastructure
const sseClients = new Map<string, ServerResponse[]>();

function sseWrite(res: ServerResponse, event: object): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sseBroadcast(key: string, event: object): void {
  const clients = sseClients.get(key);
  if (!clients) return;
  for (const res of clients) {
    sseWrite(res, event);
  }
}

function sseRegister(key: string, res: ServerResponse): void {
  if (!sseClients.has(key)) {
    sseClients.set(key, []);
  }
  sseClients.get(key)!.push(res);
  res.on("close", () => {
    const clients = sseClients.get(key);
    if (clients) {
      const idx = clients.indexOf(res);
      if (idx !== -1) clients.splice(idx, 1);
      if (clients.length === 0) sseClients.delete(key);
    }
  });
}

function createTaskProgressCallback(taskId: string): ProgressCallback {
  return (event: TaskProgressEvent) => {
    sseBroadcast(`task:${taskId}`, event);
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  logger.info("Starting Autobot system", { config });

  const bus = new EventEmitterBus();

  // Cost Control
  const ccusage = new CcusageClient();
  const budgetManager = new BudgetManager("data", bus);
  const costTracker = new CostTracker(ccusage, budgetManager, bus);
  const costControlAPI = new CostControlAPI(budgetManager, costTracker);

  // Scheduler
  const registry = new ServiceRegistry();
  const engine = new SchedulingEngine(registry, bus, costControlAPI);
  const schedulerAPI = new SchedulerAPI(engine, registry);

  // Register services
  const research = new ResearchIntelService(costTracker);
  const topicTracker = new TopicTrackerIntelService(costTracker);
  const report = new ReportIntelService(costTracker);
  const codeTask = new CodeTaskService(costTracker);
  const selfImprove = new SelfImproveService(costTracker);

  registry.register(research);
  registry.register(topicTracker);
  registry.register(report);
  registry.register(codeTask);
  registry.register(selfImprove);

  // Load service configs on startup
  for (const service of registry.list()) {
    if (service instanceof BaseService) {
      await (service as BaseService).loadServiceConfig();
    }
  }

  // Wire message bus subscriptions
  bus.subscribe("budget.exhausted", async (msg) => {
    logger.warn(`Budget exhausted for ${msg.serviceId}`, msg.payload as Record<string, unknown>);
    await engine.pauseService(msg.serviceId);
  });

  bus.subscribe("cost.recorded", async (msg) => {
    logger.info(`Cost recorded for ${msg.serviceId}`, msg.payload as Record<string, unknown>);
  });

  // Load persisted scheduler state
  await engine.loadState();

  // Task Executor
  const taskStore = new TaskStore();
  const taskExecutor = new TaskExecutor(taskStore, registry, budgetManager, costTracker, engine);
  await taskExecutor.reloadScheduledTasks();

  // Expose globals for the web UI API routes
  const autobot = {
    schedulerAPI,
    costControlAPI,
    registry,
    engine,
    bus,
    config,
    taskExecutor,
    costTracker,
    budgetManager,
  };

  (globalThis as Record<string, unknown>).__autobot = autobot;

  // Start HTTP API server
  const port = config.webUi.port;
  const host = config.webUi.host;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    const method = req.method ?? "GET";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // SSE endpoint: /api/tasks/:taskId/stream
    const taskStreamMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/stream$/);
    if (taskStreamMatch && method === "GET") {
      const taskId = taskStreamMatch[1];
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "connected", taskId })}\n\n`);
      sseRegister(`task:${taskId}`, res);
      return;
    }

    // SSE endpoint: /api/tasks/refine-prompt/:jobId/stream
    const refineStreamMatch = url.pathname.match(/^\/api\/tasks\/refine-prompt\/([^/]+)\/stream$/);
    if (refineStreamMatch && method === "GET") {
      const jobId = refineStreamMatch[1];
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "connected", jobId })}\n\n`);

      // Replay result if job already completed before client connected
      const job = refineJobs.get(jobId);
      if (job?.status === "completed") {
        sseWrite(res, { type: "done", refinedPrompt: job.refinedPrompt, cost: job.cost });
      } else if (job?.status === "errored") {
        sseWrite(res, { type: "error", error: job.error });
      } else {
        sseRegister(`refine:${jobId}`, res);
      }
      return;
    }

    res.setHeader("Content-Type", "application/json");

    try {
      const body = await parseBody(req);
      const result = await handleRoute(url, method, body, autobot);
      res.writeHead(200);
      res.end(JSON.stringify(result));
    } catch (err) {
      const status = err instanceof NotFoundError ? 404 : 500;
      const message = err instanceof Error ? err.message : "Internal server error";
      res.writeHead(status);
      res.end(JSON.stringify({ error: message }));
    }
  });

  server.listen(port, host, () => {
    logger.info(`API server listening on http://${host}:${port}`);
    logger.info("Registered services", {
      services: registry.list().map((s) => s.config.id),
    });
  });

  // Keep process alive
  process.on("SIGINT", async () => {
    logger.info("Shutting down...");
    server.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("Shutting down...");
    server.close();
    process.exit(0);
  });
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

function parseBody(req: import("http").IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

interface AutobotContext {
  schedulerAPI: SchedulerAPI;
  costControlAPI: CostControlAPI;
  registry: ServiceRegistry;
  engine: SchedulingEngine;
  bus: EventEmitterBus;
  config: ReturnType<typeof loadConfig>;
  taskExecutor: TaskExecutor;
  costTracker: CostTracker;
  budgetManager: BudgetManager;
}

async function handleRoute(
  url: URL,
  method: string,
  body: Record<string, unknown>,
  ctx: AutobotContext,
): Promise<unknown> {
  const pathname = url.pathname;

  // Task routes: /api/tasks
  // Refine prompt: start async Claude CLI job
  if (pathname === "/api/tasks/refine-prompt" && method === "POST") {
    const prompt = String(body.prompt || "").trim();
    const model = String(body.model || "sonnet");
    if (!prompt) throw new Error("Missing 'prompt' field");

    const systemPrompt =
      "Refine this rough description into a clear, detailed report prompt. Output ONLY the refined prompt, nothing else.";

    const fullPrompt = `${systemPrompt}\n\n${prompt}`;
    const jobId = uuidv4();
    refineJobs.set(jobId, {
      status: "running",
      createdAt: Date.now(),
      fullPrompt,
      model,
    });

    const budgetKey = `refine:${jobId}`;
    const workingDir = `tasks/refinements/${jobId}`;

    ctx.budgetManager.allocate(budgetKey, 0.5).then(() =>
      spawnClaudeTask({
        prompt: fullPrompt,
        workingDir,
        maxTurns: 1,
        model: model as ClaudeModel,
        onStdoutChunk: (text) => sseBroadcast(`refine:${jobId}`, { type: "chunk", text }),
      })
    ).then(async (result) => {
      await ctx.costTracker.captureAndRecordCost({
        serviceId: budgetKey,
        taskId: jobId,
        taskLabel: "prompt-refinement",
        iteration: 1,
        sessionId: result.sessionId,
      });
      const budget = await ctx.budgetManager.getBudget(budgetKey);
      const cost = budget?.spent ?? 0;
      refineJobs.set(jobId, {
        status: "completed",
        refinedPrompt: result.stdout.trim(),
        cost,
        sessionId: result.sessionId,
        createdAt: Date.now(),
        fullPrompt,
        model,
      });
      sseBroadcast(`refine:${jobId}`, { type: "done", refinedPrompt: result.stdout.trim(), cost });
    }).catch((err) => {
      const errorMsg = err instanceof Error ? err.message : String(err);
      refineJobs.set(jobId, {
        status: "errored",
        error: errorMsg,
        createdAt: Date.now(),
        fullPrompt,
        model,
      });
      sseBroadcast(`refine:${jobId}`, { type: "error", error: errorMsg });
    });

    return { jobId, fullPrompt, model };
  }

  // Refine prompt: poll job status
  const refineJobMatch = pathname.match(/^\/api\/tasks\/refine-prompt\/([^/]+)$/);
  if (refineJobMatch && method === "GET") {
    const jobId = refineJobMatch[1];
    const job = refineJobs.get(jobId);
    if (!job) throw new Error("Job not found");
    return {
      jobId,
      status: job.status,
      refinedPrompt: job.refinedPrompt,
      cost: job.cost,
      sessionId: job.sessionId,
      error: job.error,
      fullPrompt: job.fullPrompt,
      model: job.model,
    };
  }

  const taskDetailMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (pathname === "/api/tasks" && method === "POST") {
    const input = body as unknown as CreateTaskInput;
    if (!input.serviceType || !input.params) {
      throw new Error("Missing required fields: serviceType, params");
    }
    const model = input.model || "sonnet";
    const budget = input.budget ?? 1.0;
    const runNow = input.runNow !== false;

    const taskInput: CreateTaskInput = {
      serviceType: input.serviceType,
      params: input.params,
      model,
      budget,
      runNow,
      schedule: input.schedule,
    };

    if (runNow) {
      const task = await ctx.taskExecutor.createAndRun(taskInput, (taskId) => {
        ctx.taskExecutor.setProgressCallback(taskId, createTaskProgressCallback(taskId));
      });
      return task;
    } else if (input.schedule && (input.schedule.type === "scheduled" || input.schedule.type === "interval")) {
      const task = await ctx.taskExecutor.createAndSchedule(taskInput, input.schedule as ScheduleConfig);
      return task;
    } else {
      throw new Error("Must either runNow or provide a schedule");
    }
  }

  if (pathname === "/api/tasks" && method === "GET") {
    const serviceType = url.searchParams.get("serviceType") ?? undefined;
    return ctx.taskExecutor.listTasks(serviceType);
  }

  if (taskDetailMatch && method === "GET") {
    const taskId = taskDetailMatch[1];
    const task = await ctx.taskExecutor.getTask(taskId);
    if (!task) throw new NotFoundError(`Task not found: ${taskId}`);
    return task;
  }

  if (taskDetailMatch && method === "DELETE") {
    const taskId = taskDetailMatch[1];
    await ctx.taskExecutor.deleteTask(taskId);
    return { ok: true, taskId, action: "deleted" };
  }

  // GET /api/tasks/:taskId/output — get task output
  const taskOutputMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/output$/);
  if (taskOutputMatch && method === "GET") {
    const taskId = taskOutputMatch[1];
    const task = await ctx.taskExecutor.getTask(taskId);
    if (!task) throw new NotFoundError(`Task not found: ${taskId}`);

    return {
      taskId,
      serviceType: task.serviceType,
      status: task.status,
      output: task.output,
    };
  }

  // GET /api/services
  if (pathname === "/api/services" && method === "GET") {
    return ctx.schedulerAPI.listServices();
  }

  // Service input routes: /api/services/research/topics
  if (pathname === "/api/services/research/topics") {
    const service = ctx.registry.get("research") as ResearchIntelService | undefined;
    if (!service) throw new NotFoundError("Service not found: research");
    if (method === "GET") return service.getTopics();
    if (method === "POST") {
      const topic = String(body.topic || "").trim();
      if (!topic) throw new Error("Missing 'topic' field");
      await service.addTopic(topic);
      return { ok: true, topic };
    }
    if (method === "DELETE") {
      await service.clearTopics();
      return { ok: true, action: "cleared" };
    }
  }

  // Service input routes: /api/services/topic-tracker/topics (backward compat)
  if (pathname === "/api/services/topic-tracker/topics") {
    const service = ctx.registry.get("topic-tracker") as TopicTrackerIntelService | undefined;
    if (!service) throw new NotFoundError("Service not found: topic-tracker");
    if (method === "GET") return service.getTopics();
    if (method === "POST") {
      const topic = String(body.topic || "").trim();
      if (!topic) throw new Error("Missing 'topic' field");
      await service.addTopic(topic);
      return { ok: true, topic };
    }
    if (method === "DELETE") {
      await service.clearTopics();
      return { ok: true, action: "cleared" };
    }
  }

  // Topic tracker tree routes: /api/services/topic-tracker/trees
  if (pathname === "/api/services/topic-tracker/trees") {
    const service = ctx.registry.get("topic-tracker") as TopicTrackerIntelService | undefined;
    if (!service) throw new NotFoundError("Service not found: topic-tracker");
    if (method === "GET") return service.getTrees();
    if (method === "POST") {
      const topic = String(body.topic || "").trim();
      const preset = String(body.preset || "custom");
      if (!topic) throw new Error("Missing 'topic' field");
      return service.createTree(topic, preset as import("../shared/types/task.js").TopicPreset);
    }
  }

  // Single tree: /api/services/topic-tracker/trees/:treeId
  const treeMatch = pathname.match(/^\/api\/services\/topic-tracker\/trees\/([^/]+)$/);
  if (treeMatch) {
    const service = ctx.registry.get("topic-tracker") as TopicTrackerIntelService | undefined;
    if (!service) throw new NotFoundError("Service not found: topic-tracker");
    const treeId = treeMatch[1];
    if (method === "GET") {
      const tree = await service.getTree(treeId);
      if (!tree) throw new NotFoundError(`Tree not found: ${treeId}`);
      return tree;
    }
    if (method === "DELETE") {
      await service.deleteTree(treeId);
      return { ok: true, treeId, action: "deleted" };
    }
  }

  // Tree branches: /api/services/topic-tracker/trees/:treeId/branches
  const branchesMatch = pathname.match(/^\/api\/services\/topic-tracker\/trees\/([^/]+)\/branches$/);
  if (branchesMatch && method === "POST") {
    const service = ctx.registry.get("topic-tracker") as TopicTrackerIntelService | undefined;
    if (!service) throw new NotFoundError("Service not found: topic-tracker");
    const treeId = branchesMatch[1];
    const label = String(body.label || "").trim();
    const description = String(body.description || "").trim();
    const parentBranchId = body.parentBranchId ? String(body.parentBranchId) : undefined;
    if (!label) throw new Error("Missing 'label' field");
    if (!description) throw new Error("Missing 'description' field");
    const branch = await service.addBranch(treeId, label, description, parentBranchId);
    if (!branch) throw new NotFoundError(`Tree or parent branch not found`);
    return branch;
  }

  // Single branch: /api/services/topic-tracker/trees/:treeId/branches/:branchId
  const branchMatch = pathname.match(/^\/api\/services\/topic-tracker\/trees\/([^/]+)\/branches\/([^/]+)$/);
  if (branchMatch) {
    const service = ctx.registry.get("topic-tracker") as TopicTrackerIntelService | undefined;
    if (!service) throw new NotFoundError("Service not found: topic-tracker");
    const treeId = branchMatch[1];
    const branchId = branchMatch[2];
    if (method === "DELETE") {
      const removed = await service.removeBranch(treeId, branchId);
      if (!removed) throw new NotFoundError(`Branch not found: ${branchId}`);
      return { ok: true, treeId, branchId, action: "removed" };
    }
    if (method === "PUT") {
      const status = String(body.status || "").trim();
      if (!status || !["active", "paused", "stopped"].includes(status)) {
        throw new Error("Missing or invalid 'status' field (active|paused|stopped)");
      }
      const updated = await service.updateBranchStatus(treeId, branchId, status as "active" | "paused" | "stopped");
      if (!updated) throw new NotFoundError(`Branch not found: ${branchId}`);
      return { ok: true, treeId, branchId, status };
    }
  }

  // Service input routes: /api/services/code-task/tasks
  if (pathname === "/api/services/code-task/tasks") {
    const service = ctx.registry.get("code-task") as CodeTaskService | undefined;
    if (!service) throw new NotFoundError("Service not found: code-task");
    if (method === "GET") return service.getTasks();
    if (method === "POST") {
      const description = String(body.description || "").trim();
      const targetPath = String(body.targetPath || "").trim();
      const maxIterations = Number(body.maxIterations) || 3;
      if (!description) throw new Error("Missing 'description' field");
      if (!targetPath) throw new Error("Missing 'targetPath' field");
      await service.addTask({ description, targetPath, maxIterations });
      return { ok: true, task: { description, targetPath, maxIterations } };
    }
    if (method === "DELETE") {
      await service.clearTasks();
      return { ok: true, action: "cleared" };
    }
  }

  // Service config routes: /api/services/:id/config
  const configMatch = pathname.match(/^\/api\/services\/([^/]+)\/config$/);
  if (configMatch) {
    const serviceId = configMatch[1];
    const service = ctx.registry.get(serviceId);
    if (!service) throw new NotFoundError(`Service not found: ${serviceId}`);
    if (!(service instanceof BaseService)) throw new Error("Service does not support config");

    if (method === "GET") {
      return (service as BaseService).getServiceConfig();
    }
    if (method === "PUT") {
      const model = body.model as string;
      if (model && ["haiku", "sonnet", "opus"].includes(model)) {
        await (service as BaseService).setModel(model as ClaudeModel);
      }
      return (service as BaseService).getServiceConfig();
    }
  }

  // Service runs routes: /api/services/:id/runs/:runId or /api/services/:id/runs
  const runsDetailMatch = pathname.match(/^\/api\/services\/([^/]+)\/runs\/([^/]+)$/);
  if (runsDetailMatch && method === "GET") {
    const serviceId = runsDetailMatch[1];
    const runId = runsDetailMatch[2];
    const service = ctx.registry.get(serviceId);
    if (!service) throw new NotFoundError(`Service not found: ${serviceId}`);
    if (!(service instanceof BaseService)) throw new Error("Service does not support runs");
    const run = await (service as BaseService).getRun(runId);
    if (!run) throw new NotFoundError(`Run not found: ${runId}`);
    return run;
  }

  const runsMatch = pathname.match(/^\/api\/services\/([^/]+)\/runs$/);
  if (runsMatch && method === "GET") {
    const serviceId = runsMatch[1];
    const service = ctx.registry.get(serviceId);
    if (!service) throw new NotFoundError(`Service not found: ${serviceId}`);
    if (!(service instanceof BaseService)) throw new Error("Service does not support runs");
    const runs = await (service as BaseService).getRuns();
    return runs.reverse(); // reverse chronological
  }

  // Next execution times: /api/services/:id/next-runs?count=10
  const nextRunsMatch = pathname.match(/^\/api\/services\/([^/]+)\/next-runs$/);
  if (nextRunsMatch && method === "GET") {
    const serviceId = nextRunsMatch[1];
    const count = parseInt(url.searchParams.get("count") ?? "10", 10);
    const times = ctx.engine.getNextExecutionTimes(serviceId, Math.min(count, 50));
    return { serviceId, nextRuns: times };
  }

  // Service-specific routes: /api/services/:id/*
  const serviceMatch = pathname.match(/^\/api\/services\/([^/]+)(?:\/(.+))?$/);
  if (serviceMatch) {
    const serviceId = serviceMatch[1];
    const action = serviceMatch[2];

    if (!action && method === "GET") {
      const status = await ctx.schedulerAPI.getServiceStatus(serviceId);
      return { serviceId, status };
    }
    if (action === "start" && method === "POST") {
      await ctx.schedulerAPI.startService(serviceId);
      return { ok: true, serviceId, action: "started" };
    }
    if (action === "stop" && method === "POST") {
      await ctx.schedulerAPI.stopService(serviceId);
      return { ok: true, serviceId, action: "stopped" };
    }
    if (action === "pause" && method === "POST") {
      await ctx.schedulerAPI.pauseService(serviceId);
      return { ok: true, serviceId, action: "paused" };
    }
    if (action === "resume" && method === "POST") {
      await ctx.schedulerAPI.resumeService(serviceId);
      return { ok: true, serviceId, action: "resumed" };
    }
    if (action === "schedule" && method === "PUT") {
      const maxCycles = body.maxCycles ? Number(body.maxCycles) : undefined;

      // New ScheduleConfig format with slots
      if (body.type === "scheduled" && Array.isArray(body.slots)) {
        const slots = body.slots as ScheduleSlot[];
        // Unschedule existing slot keys
        for (let i = 0; i < 10; i++) {
          ctx.engine.unscheduleCallback(`${serviceId}-slot-${i}`);
        }

        if (slots.length > 0) {
          // First slot uses the primary service schedule
          const firstSlotSchedule: Schedule = {
            type: "weekly",
            timeOfDay: slots[0].timeOfDay,
            daysOfWeek: slots[0].daysOfWeek,
          };
          await ctx.schedulerAPI.updateSchedule(serviceId, firstSlotSchedule, maxCycles);

          // Additional slots as separate callbacks
          for (let i = 1; i < slots.length; i++) {
            const slotSchedule: Schedule = {
              type: "weekly",
              timeOfDay: slots[i].timeOfDay,
              daysOfWeek: slots[i].daysOfWeek,
            };
            ctx.engine.scheduleCallback(`${serviceId}-slot-${i}`, slotSchedule, async () => {
              await ctx.schedulerAPI.startService(serviceId);
            });
          }
        }
        return { ok: true, serviceId, action: "scheduled" };
      }

      // Legacy format fallback
      const schedule = { ...body } as Record<string, unknown>;
      delete schedule.maxCycles;
      await ctx.schedulerAPI.updateSchedule(
        serviceId,
        schedule as unknown as Schedule,
        maxCycles,
      );
      return { ok: true, serviceId, action: "scheduled" };
    }
  }

  // GET /api/budgets
  if (pathname === "/api/budgets" && method === "GET") {
    return ctx.costControlAPI.getAllBudgets();
  }

  // Budget-specific routes: /api/budgets/:serviceId/*
  const budgetMatch = pathname.match(/^\/api\/budgets\/([^/]+)(?:\/(.+))?$/);
  if (budgetMatch) {
    const serviceId = budgetMatch[1];
    const action = budgetMatch[2];

    if (!action && method === "GET") {
      return ctx.costControlAPI.getBudget(serviceId);
    }
    if (action === "add" && method === "POST") {
      const amount = Number(body.amount) || 0;
      return ctx.costControlAPI.addBudget(serviceId, amount);
    }
    if (action === "allocate" && method === "POST") {
      const amount = Number(body.amount) || 0;
      const threshold = body.alertThreshold ? Number(body.alertThreshold) : undefined;
      return ctx.costControlAPI.allocateBudget(serviceId, amount, threshold);
    }
  }

  // GET /api/costs
  if (pathname === "/api/costs" && method === "GET") {
    return ctx.costControlAPI.getServiceCostSummaries();
  }

  // Cost-specific routes: /api/costs/:serviceId/*
  const costMatch = pathname.match(/^\/api\/costs\/([^/]+)(?:\/(.+))?$/);
  if (costMatch) {
    const serviceId = costMatch[1];
    const action = costMatch[2];

    // GET /api/costs/:serviceId → CostSummary shape for frontend
    if (!action && method === "GET") {
      const report = await ctx.costControlAPI.getServiceReport(serviceId);
      const entries = report.entries;
      const taskIds = new Set(entries.map((e) => e.taskId));
      const totalTokens = entries.reduce(
        (sum, e) => sum + e.tokensInput + e.tokensOutput, 0,
      );
      return {
        serviceId: report.serviceId,
        serviceName: report.serviceId,
        totalCost: report.totalSpent,
        totalTokens,
        taskCount: taskIds.size,
        iterationCount: entries.length,
      };
    }

    // GET /api/costs/:serviceId/tasks → TaskCost[] shape for frontend
    if (action === "tasks" && method === "GET") {
      const summaries = await ctx.costControlAPI.getTaskDetails(serviceId);
      return summaries.map((s) => ({
        taskId: s.taskId,
        taskName: s.taskLabel,
        cost: s.totalCost,
        tokens: s.entries.reduce(
          (sum, e) => sum + e.tokensInput + e.tokensOutput, 0,
        ),
        iterations: s.iterationCount,
        lastRun: s.entries.length > 0
          ? s.entries[s.entries.length - 1].timestamp
          : undefined,
      }));
    }
  }

  // GET /api/logs
  if (pathname === "/api/logs" && method === "GET") {
    const allLogs = [];
    for (const service of ctx.registry.list()) {
      const logs = await service.logs(50);
      allLogs.push(...logs);
    }
    allLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return allLogs.slice(0, 100);
  }

  // Log-specific routes: /api/logs/:serviceId
  const logMatch = pathname.match(/^\/api\/logs\/([^/]+)$/);
  if (logMatch) {
    const serviceId = logMatch[1];
    const service = ctx.registry.get(serviceId);
    if (!service) throw new NotFoundError(`Service not found: ${serviceId}`);
    return service.logs(100);
  }

  // GET /api/state
  if (pathname === "/api/state" && method === "GET") {
    return ctx.schedulerAPI.getState();
  }

  throw new NotFoundError(`Not found: ${method} ${pathname}`);
}

main().catch((err) => {
  logger.error("Fatal error", { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
