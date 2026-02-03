import { CostEntry, CostReport, TaskCostSummary } from "../../shared/types/cost.js";
import { JsonStore } from "../../shared/persistence/index.js";
import { MessageBus } from "../../shared/messaging/index.js";
import { CcusageClient } from "../ccusage/index.js";
import { BudgetManager } from "../budget/index.js";
import path from "path";

export class CostTracker {
  private store: JsonStore<CostEntry[]>;
  private ccusage: CcusageClient;
  private budgetManager: BudgetManager;
  private bus: MessageBus;

  constructor(
    ccusage: CcusageClient,
    budgetManager: BudgetManager,
    bus: MessageBus,
    dataDir = "data",
  ) {
    this.ccusage = ccusage;
    this.budgetManager = budgetManager;
    this.bus = bus;
    this.store = new JsonStore<CostEntry[]>(
      path.resolve(dataDir, "cost-entries.json"),
      [],
    );
  }

  async recordTaskCost(entry: CostEntry): Promise<void> {
    const entries = await this.store.load();
    entries.push(entry);
    await this.store.save(entries);

    await this.budgetManager.deduct(entry.serviceId, entry.estimatedCost);

    await this.bus.publish({
      type: "cost.recorded",
      serviceId: entry.serviceId,
      payload: entry,
      timestamp: new Date(),
    });
  }

  async captureAndRecordCost(params: {
    serviceId: string;
    taskId: string;
    taskLabel: string;
    iteration: number;
    sessionId: string;
  }): Promise<CostEntry> {
    const sessionData = await this.ccusage.getSessionCost(params.sessionId);

    const entry: CostEntry = {
      serviceId: params.serviceId,
      taskId: params.taskId,
      taskLabel: params.taskLabel,
      sessionId: params.sessionId,
      iteration: params.iteration,
      tokensInput: sessionData?.inputTokens ?? 0,
      tokensOutput: sessionData?.outputTokens ?? 0,
      cacheCreationTokens: sessionData?.cacheCreationTokens ?? 0,
      cacheReadTokens: sessionData?.cacheReadTokens ?? 0,
      estimatedCost: sessionData?.totalCost ?? 0,
      timestamp: new Date().toISOString(),
    };

    await this.recordTaskCost(entry);
    return entry;
  }

  async getEntries(serviceId?: string): Promise<CostEntry[]> {
    const entries = await this.store.load();
    if (!serviceId) return entries;
    return entries.filter((e) => e.serviceId === serviceId);
  }

  async getTaskSummaries(serviceId?: string): Promise<TaskCostSummary[]> {
    const entries = await this.getEntries(serviceId);
    const grouped = new Map<string, CostEntry[]>();

    for (const entry of entries) {
      const existing = grouped.get(entry.taskId) ?? [];
      existing.push(entry);
      grouped.set(entry.taskId, existing);
    }

    const summaries: TaskCostSummary[] = [];
    for (const [taskId, taskEntries] of grouped) {
      summaries.push({
        taskId,
        taskLabel: taskEntries[0].taskLabel,
        serviceId: taskEntries[0].serviceId,
        totalCost: taskEntries.reduce((sum, e) => sum + e.estimatedCost, 0),
        iterationCount: taskEntries.length,
        entries: taskEntries,
      });
    }

    return summaries;
  }

  async getServiceReport(serviceId: string): Promise<CostReport> {
    const entries = await this.getEntries(serviceId);
    const budget = await this.budgetManager.getBudget(serviceId);

    const totalSpent = entries.reduce((sum, e) => sum + e.estimatedCost, 0);
    const timestamps = entries.map((e) => e.timestamp);

    return {
      serviceId,
      totalSpent,
      budgetAllocated: budget?.allocated ?? 0,
      budgetRemaining: budget?.remaining ?? 0,
      entries,
      periodStart: timestamps.length > 0 ? timestamps[0] : new Date().toISOString(),
      periodEnd: timestamps.length > 0 ? timestamps[timestamps.length - 1] : new Date().toISOString(),
    };
  }
}
