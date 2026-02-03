import { Budget } from "../../shared/types/cost.js";
import { JsonStore } from "../../shared/persistence/index.js";
import { MessageBus } from "../../shared/messaging/index.js";
import path from "path";

export class BudgetManager {
  private store: JsonStore<Record<string, Budget>>;
  private bus: MessageBus;

  constructor(dataDir: string, bus: MessageBus) {
    this.store = new JsonStore(
      path.resolve(dataDir, "budgets.json"),
      {},
    );
    this.bus = bus;
  }

  async allocate(
    serviceId: string,
    amount: number,
    alertThreshold = 0.8,
  ): Promise<Budget> {
    const budgets = await this.store.load();
    const existing = budgets[serviceId];

    const budget: Budget = {
      serviceId,
      allocated: amount,
      spent: existing?.spent ?? 0,
      remaining: amount - (existing?.spent ?? 0),
      alertThreshold,
      isExhausted: false,
    };

    budget.isExhausted = budget.remaining <= 0;
    budgets[serviceId] = budget;
    await this.store.save(budgets);
    return budget;
  }

  async addBudget(serviceId: string, amount: number): Promise<Budget> {
    const budgets = await this.store.load();
    const existing = budgets[serviceId];

    if (!existing) {
      return this.allocate(serviceId, amount);
    }

    existing.allocated += amount;
    existing.remaining += amount;
    existing.isExhausted = existing.remaining <= 0;

    budgets[serviceId] = existing;
    await this.store.save(budgets);

    await this.bus.publish({
      type: "budget.added",
      serviceId,
      payload: { amount, budget: existing },
      timestamp: new Date(),
    });

    return existing;
  }

  async check(serviceId: string): Promise<{ allowed: boolean; budget: Budget }> {
    const budgets = await this.store.load();
    const budget = budgets[serviceId];

    if (!budget) {
      const defaultBudget: Budget = {
        serviceId,
        allocated: 0,
        spent: 0,
        remaining: 0,
        alertThreshold: 0.8,
        isExhausted: true,
      };
      return { allowed: false, budget: defaultBudget };
    }

    return { allowed: !budget.isExhausted && budget.remaining > 0, budget };
  }

  async deduct(serviceId: string, amount: number): Promise<Budget> {
    const budgets = await this.store.load();
    const budget = budgets[serviceId];

    if (!budget) {
      throw new Error(`No budget allocated for service: ${serviceId}`);
    }

    budget.spent += amount;
    budget.remaining = budget.allocated - budget.spent;
    budget.isExhausted = budget.remaining <= 0;

    budgets[serviceId] = budget;
    await this.store.save(budgets);

    if (budget.remaining <= budget.allocated * (1 - budget.alertThreshold)) {
      await this.bus.publish({
        type: "budget.exhausted",
        serviceId,
        payload: { budget },
        timestamp: new Date(),
      });
    }

    return budget;
  }

  async getBudget(serviceId: string): Promise<Budget | null> {
    const budgets = await this.store.load();
    return budgets[serviceId] ?? null;
  }

  async getAllBudgets(): Promise<Budget[]> {
    const budgets = await this.store.load();
    return Object.values(budgets);
  }
}
