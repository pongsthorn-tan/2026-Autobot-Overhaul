import { Budget, CostReport, TaskCostSummary } from "../../shared/types/cost.js";
import { BudgetManager } from "../budget/index.js";
import { CostTracker } from "../tracker/index.js";

export class CostControlAPI {
  constructor(
    private budgetManager: BudgetManager,
    private costTracker: CostTracker,
  ) {}

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
}
