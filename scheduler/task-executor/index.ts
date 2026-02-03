import { v4 as uuidv4 } from "uuid";
import { StandaloneTask, CreateTaskInput, TaskServiceType } from "../../shared/types/task.js";
import { Schedule } from "../../shared/types/scheduler.js";
import { TaskStore } from "../../shared/task-store/index.js";
import { ServiceRegistry } from "../registry/index.js";
import { SchedulingEngine } from "../engine/index.js";
import { BudgetManager } from "../../cost-control/budget/index.js";
import { CostTracker } from "../../cost-control/tracker/index.js";
import { BaseService } from "../../services/base-service.js";
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
  constructor(
    private taskStore: TaskStore,
    private registry: ServiceRegistry,
    private budgetManager: BudgetManager,
    private costTracker: CostTracker,
    private engine: SchedulingEngine,
  ) {}

  async createAndRun(input: CreateTaskInput): Promise<StandaloneTask> {
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
    };

    // Allocate budget for this task
    await this.budgetManager.allocate(budgetKey, input.budget);
    await this.taskStore.create(task);

    // Fire-and-forget execution
    this.executeTask(taskId, budgetKey).catch((err) => {
      logger.error(`Task execution failed: ${taskId}`, {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    // If a schedule is provided, also set up recurring execution
    if (input.schedule) {
      this.scheduleTask(taskId, input.schedule);
    }

    return { ...task, status: "running" };
  }

  async createAndSchedule(input: CreateTaskInput, schedule: Schedule): Promise<StandaloneTask> {
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
    };

    await this.budgetManager.allocate(budgetKey, input.budget);
    await this.taskStore.create(task);
    this.scheduleTask(taskId, schedule);

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
    const key = `task:${taskId}`;
    this.engine.unscheduleCallback(key);
    await this.taskStore.delete(taskId);
  }

  async reloadScheduledTasks(): Promise<void> {
    const tasks = await this.taskStore.getAll();
    for (const task of tasks) {
      if (task.schedule && task.status === "scheduled") {
        this.scheduleTask(task.taskId, task.schedule);
      }
    }
    logger.info("Reloaded scheduled tasks", {
      count: tasks.filter((t) => t.schedule && t.status === "scheduled").length,
    });
  }

  private scheduleTask(taskId: string, schedule: Schedule): void {
    const key = `task:${taskId}`;
    this.engine.scheduleCallback(key, schedule, async () => {
      await this.executeTask(taskId, key);
    });
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
      const runRecord = await (service as BaseService).runStandalone(
        task.params,
        task.model,
        budgetKey,
      );

      // Get budget to determine cost spent
      const budget = await this.budgetManager.getBudget(budgetKey);
      const costSpent = budget?.spent ?? 0;

      await this.taskStore.update(taskId, {
        status: "completed",
        completedAt: new Date().toISOString(),
        costSpent,
      });

      logger.info(`Task completed: ${taskId}`, {
        serviceType: task.serviceType,
        costSpent,
        totalTokens: runRecord.totalTokens,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const budget = await this.budgetManager.getBudget(budgetKey);

      await this.taskStore.update(taskId, {
        status: "errored",
        completedAt: new Date().toISOString(),
        costSpent: budget?.spent ?? 0,
        error: errorMsg,
      });

      logger.error(`Task errored: ${taskId}`, { error: errorMsg });
    }
  }
}
