export interface Budget {
  serviceId: string;
  allocated: number;
  spent: number;
  remaining: number;
  alertThreshold: number;
  isExhausted: boolean;
}

export interface CostEntry {
  serviceId: string;
  taskId: string;
  taskLabel: string;
  sessionId: string;
  iteration: number;
  tokensInput: number;
  tokensOutput: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  estimatedCost: number;
  timestamp: string;
}

export interface TaskCostSummary {
  taskId: string;
  taskLabel: string;
  serviceId: string;
  totalCost: number;
  iterationCount: number;
  entries: CostEntry[];
}

export interface CostReport {
  serviceId: string;
  totalSpent: number;
  budgetAllocated: number;
  budgetRemaining: number;
  entries: CostEntry[];
  periodStart: string;
  periodEnd: string;
}
