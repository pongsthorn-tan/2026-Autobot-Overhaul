import {
  Service,
  ServiceConfig,
  ServiceStatus,
  TaskLog,
  ServiceReport,
  ClaudeModel,
  MODEL_IDS,
  ServiceModelConfig,
  RunRecord,
  RunTaskResult,
  RunStatus,
} from "../shared/types/service.js";
import { TaskParams } from "../shared/types/task.js";
import { spawnClaudeTask } from "../shared/claude-runner/index.js";
import { CostTracker } from "../cost-control/tracker/index.js";
import { createLogger, Logger } from "../shared/logger/index.js";
import { generateTaskId } from "../shared/utils/index.js";
import { JsonStore } from "../shared/persistence/index.js";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export interface TaskProgressEvent {
  type: "prompt" | "chunk" | "step" | "cost" | "done" | "error";
  prompt?: string;
  model?: string;
  text?: string;
  step?: { index: number; label: string; status: string };
  cost?: number;
  output?: string;
  error?: string;
}

export type ProgressCallback = (event: TaskProgressEvent) => void;

export interface StandaloneContext {
  model: ClaudeModel;
  budgetKey: string;
  runRecord: RunRecord;
  onProgress?: ProgressCallback;
}

const TASKS_BASE = path.resolve(process.cwd(), "tasks");

export abstract class BaseService implements Service {
  abstract readonly config: ServiceConfig;
  protected _status: ServiceStatus = "idle";
  protected taskLogs: TaskLog[] = [];
  protected logger: Logger;
  protected costTracker: CostTracker;
  private lastRun: string | null = null;
  private tasksCompleted = 0;

  // Model selection
  protected _model: ClaudeModel = "sonnet";
  private _configStore: JsonStore<ServiceModelConfig> | null = null;

  // Run tracking
  private _runsStore: JsonStore<RunRecord[]> | null = null;
  private _currentRun: RunRecord | null = null;
  private _cycleCount = 0;

  constructor(costTracker: CostTracker) {
    this.costTracker = costTracker;
    this.logger = createLogger(this.getServiceId());
  }

  protected abstract getServiceId(): string;
  abstract start(): Promise<void>;

  private getConfigStore(): JsonStore<ServiceModelConfig> {
    if (!this._configStore) {
      this._configStore = new JsonStore<ServiceModelConfig>(
        `data/service-config-${this.getServiceId()}.json`,
        { model: "sonnet" },
      );
    }
    return this._configStore;
  }

  private getRunsStore(): JsonStore<RunRecord[]> {
    if (!this._runsStore) {
      this._runsStore = new JsonStore<RunRecord[]>(
        `data/${this.getServiceId()}-runs.json`,
        [],
      );
    }
    return this._runsStore;
  }

  async loadServiceConfig(): Promise<void> {
    const config = await this.getConfigStore().load();
    this._model = config.model;
    // Load cycle count from persisted runs
    const runs = await this.getRunsStore().load();
    this._cycleCount = runs.length;
    this.logger.info(`Loaded config: model=${this._model}, cycles=${this._cycleCount}`);
  }

  async saveServiceConfig(): Promise<void> {
    await this.getConfigStore().save({ model: this._model });
  }

  getServiceConfig(): ServiceModelConfig {
    return { model: this._model };
  }

  async setModel(model: ClaudeModel): Promise<void> {
    this._model = model;
    await this.saveServiceConfig();
  }

  // Run tracking methods
  async beginRun(): Promise<void> {
    this._cycleCount++;
    this._currentRun = {
      runId: uuidv4(),
      cycleNumber: this._cycleCount,
      serviceId: this.getServiceId(),
      model: this._model,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "running",
      tasks: [],
      totalTokens: 0,
      totalCost: 0,
    };
  }

  recordTaskInRun(result: RunTaskResult): void {
    if (!this._currentRun) return;
    this._currentRun.tasks.push(result);
    this._currentRun.totalTokens += result.tokensUsed;
    this._currentRun.totalCost += result.costEstimate;
  }

  async completeRun(status: RunStatus = "completed"): Promise<void> {
    if (!this._currentRun) return;
    this._currentRun.status = status;
    this._currentRun.completedAt = new Date().toISOString();

    const runs = await this.getRunsStore().load();
    runs.push(this._currentRun);
    await this.getRunsStore().save(runs);

    this._currentRun = null;
  }

  async getRuns(): Promise<RunRecord[]> {
    return this.getRunsStore().load();
  }

  async getRun(runId: string): Promise<RunRecord | undefined> {
    const runs = await this.getRunsStore().load();
    return runs.find((r) => r.runId === runId);
  }

  protected async runTask(params: {
    label: string;
    prompt: string;
    maxTurns?: number;
    iteration?: number;
    existingTaskId?: string;
    modelOverride?: ClaudeModel;
    serviceIdOverride?: string;
    onProgress?: ProgressCallback;
  }): Promise<{ taskId: string; output: string; costEntry: import("../shared/types/cost.js").CostEntry }> {
    const taskId = params.existingTaskId ?? generateTaskId(this.getServiceId(), params.label);
    const taskLabel = `${this.getServiceId()}: ${params.label}`;
    const taskDir = path.join(TASKS_BASE, this.getServiceId(), taskId);
    const iteration = params.iteration ?? 1;
    const effectiveModel = params.modelOverride ?? this._model;
    const effectiveServiceId = params.serviceIdOverride ?? this.getServiceId();

    await mkdir(taskDir, { recursive: true });

    this.logger.info(`Starting task: ${params.label}`, { taskId, iteration });

    // Emit prompt event before spawning
    if (params.onProgress) {
      params.onProgress({
        type: "prompt",
        prompt: params.prompt,
        model: MODEL_IDS[effectiveModel],
      });
    }

    const result = await spawnClaudeTask({
      prompt: params.prompt,
      workingDir: taskDir,
      maxTurns: params.maxTurns ?? 5,
      model: MODEL_IDS[effectiveModel],
      onStdoutChunk: params.onProgress
        ? (text) => params.onProgress!({ type: "chunk", text })
        : undefined,
    });

    const costEntry = await this.costTracker.captureAndRecordCost({
      serviceId: effectiveServiceId,
      taskId,
      taskLabel,
      iteration,
      sessionId: result.sessionId,
    });

    // Emit cost event
    if (params.onProgress) {
      params.onProgress({ type: "cost", cost: costEntry.estimatedCost });
    }

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

    // Record task in current run
    this.recordTaskInRun({
      taskId,
      label: params.label,
      iteration,
      output: result.stdout,
      tokensUsed: costEntry.tokensInput + costEntry.tokensOutput,
      costEstimate: costEntry.estimatedCost,
      completedAt: new Date().toISOString(),
    });

    // Emit done event
    if (params.onProgress) {
      params.onProgress({ type: "done", output: result.stdout });
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

  async runStandalone(taskParams: TaskParams, model: ClaudeModel, budgetKey: string, onProgress?: ProgressCallback): Promise<RunRecord> {
    const runRecord: RunRecord = {
      runId: uuidv4(),
      cycleNumber: 0,
      serviceId: budgetKey,
      model,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "running",
      tasks: [],
      totalTokens: 0,
      totalCost: 0,
    };

    // Set as current run so recordTaskInRun() captures output
    this._currentRun = runRecord;

    try {
      await this.executeStandalone(taskParams, { model, budgetKey, runRecord, onProgress });
      runRecord.status = "completed";
    } catch (err) {
      runRecord.status = "errored";
      throw err;
    } finally {
      runRecord.completedAt = new Date().toISOString();
      this._currentRun = null;
    }

    return runRecord;
  }

  protected async executeStandalone(_params: TaskParams, _ctx: StandaloneContext): Promise<void> {
    throw new Error(`executeStandalone() not implemented for ${this.getServiceId()}`);
  }
}
