import {
  Service,
  ServiceConfig,
  ServiceStatus,
  TaskLog,
  ServiceReport,
} from "../shared/types/service.js";
import { spawnClaudeTask } from "../shared/claude-runner/index.js";
import { CostTracker } from "../cost-control/tracker/index.js";
import { createLogger, Logger } from "../shared/logger/index.js";
import { generateTaskId } from "../shared/utils/index.js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const TASKS_BASE = path.resolve(process.cwd(), "tasks");

export abstract class BaseService implements Service {
  abstract readonly config: ServiceConfig;
  protected _status: ServiceStatus = "idle";
  protected taskLogs: TaskLog[] = [];
  protected logger: Logger;
  protected costTracker: CostTracker;
  private lastRun: string | null = null;
  private tasksCompleted = 0;

  constructor(costTracker: CostTracker) {
    this.costTracker = costTracker;
    this.logger = createLogger(this.getServiceId());
  }

  protected abstract getServiceId(): string;
  abstract start(): Promise<void>;

  protected async runTask(params: {
    label: string;
    prompt: string;
    maxTurns?: number;
    iteration?: number;
    existingTaskId?: string;
  }): Promise<{ taskId: string; output: string; costEntry: import("../shared/types/cost.js").CostEntry }> {
    const taskId = params.existingTaskId ?? generateTaskId(this.getServiceId(), params.label);
    const taskLabel = `${this.getServiceId()}: ${params.label}`;
    const taskDir = path.join(TASKS_BASE, this.getServiceId(), taskId);
    const iteration = params.iteration ?? 1;

    await mkdir(taskDir, { recursive: true });

    this.logger.info(`Starting task: ${params.label}`, { taskId, iteration });

    const result = await spawnClaudeTask({
      prompt: params.prompt,
      workingDir: taskDir,
      maxTurns: params.maxTurns ?? 5,
    });

    const costEntry = await this.costTracker.captureAndRecordCost({
      serviceId: this.getServiceId(),
      taskId,
      taskLabel,
      iteration,
      sessionId: result.sessionId,
    });

    const logEntry: TaskLog = {
      taskId,
      serviceId: this.getServiceId(),
      iteration,
      tokensUsed: costEntry.tokensInput + costEntry.tokensOutput,
      costEstimate: costEntry.estimatedCost,
      message: `Completed: ${params.label}`,
      timestamp: new Date().toISOString(),
    };

    this.taskLogs.push(logEntry);
    this.logger.taskLog(logEntry);
    this.tasksCompleted++;
    this.lastRun = new Date().toISOString();

    if (result.stdout) {
      await writeFile(
        path.join(taskDir, "output.md"),
        result.stdout,
      );
    }

    return { taskId, output: result.stdout, costEntry };
  }

  async stop(): Promise<void> {
    this._status = "stopped";
  }

  async pause(): Promise<void> {
    this._status = "paused";
  }

  async resume(): Promise<void> {
    this._status = "idle";
  }

  async status(): Promise<ServiceStatus> {
    return this._status;
  }

  async logs(limit?: number): Promise<TaskLog[]> {
    return limit ? this.taskLogs.slice(-limit) : [...this.taskLogs];
  }

  async report(): Promise<ServiceReport> {
    const costReport = await this.costTracker.getServiceReport(this.getServiceId());
    return {
      serviceId: this.getServiceId(),
      status: this._status,
      totalTokensUsed: this.taskLogs.reduce((sum, l) => sum + l.tokensUsed, 0),
      totalCost: costReport.totalSpent,
      budgetRemaining: costReport.budgetRemaining,
      tasksCompleted: this.tasksCompleted,
      lastRun: this.lastRun,
      logs: this.taskLogs.slice(-50),
    };
  }
}
