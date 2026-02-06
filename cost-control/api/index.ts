import { Budget, CostReport, TaskCostSummary } from "../../shared/types/cost.js";
import { UsageReportData } from "../../shared/types/usage-report.js";
import { BudgetManager } from "../budget/index.js";
import { CostTracker } from "../tracker/index.js";
import { UsageReportReader } from "../usage-report/index.js";

export class CostControlAPI {
  private usageReportReader: UsageReportReader;

  constructor(
    private budgetManager: BudgetManager,
    private costTracker: CostTracker,
  ) {
    this.usageReportReader = new UsageReportReader();
  }

  async getUsageReport(): Promise<UsageReportData | null> {
    return this.usageReportReader.getReport();
  }

  async getBudget(serviceId: string): Promise<Budget | null> {
    return this.budgetManager.getBudget(serviceId);
  }

  async getAllBudgets(): Promise<Budget[]> {
    return this.budgetManager.getAllBudgets();
  }

  async addBudget(serviceId: string, amount: number): Promise<Budget> {
    return this.budgetManager.addBudget(serviceId, amount);
  }

  async allocateBudget(
    serviceId: string,
    amount: number,
    alertThreshold?: number,
  ): Promise<Budget> {
    return this.budgetManager.allocate(serviceId, amount, alertThreshold);
  }

  async checkBudget(serviceId: string): Promise<{ allowed: boolean; budget: Budget }> {
    return this.budgetManager.check(serviceId);
  }

  async getServiceReport(serviceId: string): Promise<CostReport> {
    return this.costTracker.getServiceReport(serviceId);
  }

  async getTaskDetails(serviceId: string): Promise<TaskCostSummary[]> {
    return this.costTracker.getTaskSummaries(serviceId);
  }

  async getAllTaskSummaries(): Promise<TaskCostSummary[]> {
    return this.costTracker.getTaskSummaries();
  }

  async getServiceCostSummaries(): Promise<{
    serviceId: string;
    serviceName: string;
    totalCost: number;
    totalTokens: number;
    taskCount: number;
    iterationCount: number;
  }[]> {
    const entries = await this.costTracker.getEntries();
    const byService = new Map<string, typeof entries>();

    for (const entry of entries) {
      const existing = byService.get(entry.serviceId) ?? [];
      existing.push(entry);
      byService.set(entry.serviceId, existing);
    }

    const summaries = [];
    for (const [serviceId, serviceEntries] of byService) {
      const taskIds = new Set(serviceEntries.map((e) => e.taskId));
      summaries.push({
        serviceId,
        serviceName: serviceId,
        totalCost: serviceEntries.reduce((sum, e) => sum + e.estimatedCost, 0),
        totalTokens: serviceEntries.reduce(
          (sum, e) => sum + e.tokensInput + e.tokensOutput, 0,
        ),
        taskCount: taskIds.size,
        iterationCount: serviceEntries.length,
      });
    }

    return summaries;
  }
}
