import { v4 as uuidv4 } from "uuid";
import { StandaloneTask, CreateTaskInput, TaskServiceType, TopicTrackerTaskParams, SpendingLimit } from "../../shared/types/task.js";
import { Schedule, ScheduleConfig, ScheduleSlot } from "../../shared/types/scheduler.js";
import { TaskStore } from "../../shared/task-store/index.js";
import { ServiceRegistry } from "../registry/index.js";
import { SchedulingEngine } from "../engine/index.js";
import { BudgetManager } from "../../cost-control/budget/index.js";
import { CostTracker } from "../../cost-control/tracker/index.js";
import { BaseService, ProgressCallback } from "../../services/base-service.js";
import { createLogger } from "../../shared/logger/index.js";

const logger = createLogger("task-executor");

const SERVICE_TYPE_TO_ID: Record<TaskServiceType, string> = {
  report: "report",
  research: "research",
  "code-task": "code-task",
  "topic-tracker": "topic-tracker",
  "self-improve": "self-improve",
};

export class TaskExecutor {
  private progressCallbacks = new Map<string, ProgressCallback>();

  constructor(
    private taskStore: TaskStore,
    private registry: ServiceRegistry,
    private budgetManager: BudgetManager,
    private costTracker: CostTracker,
    private engine: SchedulingEngine,
  ) {}

  setProgressCallback(taskId: string, cb: ProgressCallback): void {
    this.progressCallbacks.set(taskId, cb);
  }

  removeProgressCallback(taskId: string): void {
    this.progressCallbacks.delete(taskId);
  }

  async createAndRun(input: CreateTaskInput, onCreated?: (taskId: string) => void): Promise<StandaloneTask> {
    const taskId = uuidv4();
    const budgetKey = `task:${taskId}`;

    const task: StandaloneTask = {
      taskId,
      serviceType: input.serviceType,
      params: input.params,
      model: input.model,
      budget: input.budget,
      schedule: input.schedule,
      status: "pending",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      costSpent: 0,
      error: null,
      output: null,
    };

    // Allocate budget for this task
    await this.budgetManager.allocate(budgetKey, input.budget);
    await this.taskStore.create(task);

    // Register progress callback before execution starts
    if (onCreated) onCreated(taskId);

    // Fire-and-forget execution
    this.executeTask(taskId, budgetKey).catch((err) => {
      logger.error(`Task execution failed: ${taskId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // If a schedule is provided, set up recurring execution
    if (input.schedule) {
      if (input.schedule.type === "scheduled") {
        this.scheduleTaskSlots(taskId, input.schedule.slots);
      } else if (input.schedule.type === "interval") {
        this.scheduleTaskInterval(taskId, input.schedule.intervalHours, input.schedule.maxCycles);
      }
    }

    return { ...task, status: "running" };
  }

  async createAndSchedule(input: CreateTaskInput, schedule: ScheduleConfig): Promise<StandaloneTask> {
    const taskId = uuidv4();
    const budgetKey = `task:${taskId}`;

    const task: StandaloneTask = {
      taskId,
      serviceType: input.serviceType,
      params: input.params,
      model: input.model,
      budget: input.budget,
      schedule,
      status: "scheduled",
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
      costSpent: 0,
      error: null,
      output: null,
    };

    await this.budgetManager.allocate(budgetKey, input.budget);
    await this.taskStore.create(task);

    if (schedule.type === "scheduled") {
      this.scheduleTaskSlots(taskId, schedule.slots);
    } else if (schedule.type === "interval") {
      this.scheduleTaskInterval(taskId, schedule.intervalHours, schedule.maxCycles);
    }

    return task;
  }

  async listTasks(serviceType?: string): Promise<StandaloneTask[]> {
    if (serviceType) {
      return this.taskStore.getByService(serviceType);
    }
    return this.taskStore.getAll();
  }

  async getTask(taskId: string): Promise<StandaloneTask | undefined> {
    return this.taskStore.getById(taskId);
  }

  async deleteTask(taskId: string): Promise<void> {
    // Unschedule all possible slot keys
    for (let i = 0; i < 10; i++) {
      this.engine.unscheduleCallback(`task:${taskId}:slot-${i}`);
    }
    // Unschedule interval key
    this.engine.unscheduleCallback(`task:${taskId}:interval`);
    await this.taskStore.delete(taskId);
  }

  async reloadScheduledTasks(): Promise<void> {
    const tasks = await this.taskStore.getAll();
    let reloaded = 0;
    for (const task of tasks) {
      if (!task.schedule || task.status === "completed" || task.status === "errored") continue;
      if (task.schedule.type === "scheduled") {
        this.scheduleTaskSlots(task.taskId, task.schedule.slots);
        reloaded++;
      } else if (task.schedule.type === "interval") {
        this.scheduleTaskInterval(task.taskId, task.schedule.intervalHours, task.schedule.maxCycles);
        reloaded++;
      }
    }
    logger.info("Reloaded scheduled tasks", { count: reloaded });
  }

  private scheduleTaskSlots(taskId: string, slots: ScheduleSlot[]): void {
    const budgetKey = `task:${taskId}`;
    slots.forEach((slot, i) => {
      const key = `task:${taskId}:slot-${i}`;
      const schedule: Schedule = {
        type: "weekly",
        timeOfDay: slot.timeOfDay,
        daysOfWeek: slot.daysOfWeek,
      };
      this.engine.scheduleCallback(key, schedule, async () => {
        await this.executeTask(taskId, budgetKey);
      });
    });
  }

  private scheduleTaskInterval(taskId: string, intervalHours: number, maxCycles?: number): void {
    const budgetKey = `task:${taskId}`;
    const key = `task:${taskId}:interval`;
    const schedule: Schedule = {
      type: "interval",
      intervalMs: intervalHours * 3_600_000,
    };
    this.engine.scheduleCallback(key, schedule, async () => {
      const task = await this.taskStore.getById(taskId);
      if (!task) return;

      const cyclesRun = task.cyclesCompleted ?? 0;
      if (maxCycles && cyclesRun >= maxCycles) {
        this.engine.unscheduleCallback(key);
        await this.taskStore.update(taskId, { status: "completed" });
        logger.info(`Task ${taskId} reached max cycles (${maxCycles}), completed`);
        return;
      }

      // Check spending limit if topic-tracker params have one
      const params = task.params as unknown as Record<string, unknown>;
      if (params.spendingLimit) {
        const allowed = await this.checkSpendingLimit(taskId, params.spendingLimit as SpendingLimit);
        if (!allowed) {
          logger.info(`Task ${taskId} skipped: spending limit exceeded for current window`);
          return;
        }
      }

      await this.executeTask(taskId, budgetKey);
      await this.taskStore.update(taskId, { cyclesCompleted: cyclesRun + 1 });
    });
  }

  private async checkSpendingLimit(taskId: string, limit: SpendingLimit): Promise<boolean> {
    const task = await this.taskStore.getById(taskId);
    if (!task) return true;

    const budgetKey = `task:${taskId}`;
    const budget = await this.budgetManager.getBudget(budgetKey);
    if (!budget) return true;

    const hoursElapsed = (Date.now() - new Date(task.createdAt).getTime()) / 3_600_000;
    const allowedWindows = Math.max(1, Math.ceil(hoursElapsed / limit.windowHours));
    const maxAllowed = allowedWindows * limit.maxPerWindow;
    return budget.spent < maxAllowed;
  }

  private async executeTask(taskId: string, budgetKey: string): Promise<void> {
    const task = await this.taskStore.getById(taskId);
    if (!task) {
      logger.error(`Task not found: ${taskId}`);
      return;
    }

    const serviceId = SERVICE_TYPE_TO_ID[task.serviceType];
    const service = this.registry.get(serviceId);
    if (!service || !(service instanceof BaseService)) {
      await this.taskStore.update(taskId, {
        status: "errored",
        error: `Service not found: ${serviceId}`,
      });
      return;
    }

    await this.taskStore.update(taskId, {
      status: "running",
      startedAt: new Date().toISOString(),
    });

    try {
      const onProgress = this.progressCallbacks.get(taskId);
      const runRecord = await (service as BaseService).runStandalone(
        task.params,
        task.model,
        budgetKey,
        onProgress,
      );

      // Get budget to determine cost spent
      const budget = await this.budgetManager.getBudget(budgetKey);
      const costSpent = budget?.spent ?? 0;

      // Capture output from the run record's tasks
      const taskOutput = runRecord.tasks
        .map((t) => t.output)
        .filter(Boolean)
        .join("\n\n");

      await this.taskStore.update(taskId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        costSpent,
        output: taskOutput || null,
      });

      // Broadcast done event to SSE clients
      const onProgressDone = this.progressCallbacks.get(taskId);
      if (onProgressDone) {
        onProgressDone({ type: "done", output: taskOutput || undefined, cost: costSpent });
      }

      logger.info(`Task completed: ${taskId}`, {
        serviceType: task.serviceType,
        costSpent,
        totalTokens: runRecord.totalTokens,
      });
    } catch (err) {
      const onProgressErr = this.progressCallbacks.get(taskId);
      if (onProgressErr) {
        onProgressErr({ type: "error", error: err instanceof Error ? err.message : String(err) });
      }
      const errorMsg = err instanceof Error ? err.message : String(err);
      const budget = await this.budgetManager.getBudget(budgetKey);

      await this.taskStore.update(taskId, {
        status: "errored",
        completedAt: new Date().toISOString(),
        costSpent: budget?.spent ?? 0,
        error: errorMsg,
      });

      logger.error(`Task errored: ${taskId}`, { error: errorMsg });
    } finally {
      this.progressCallbacks.delete(taskId);
    }
  }
}
