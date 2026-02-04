/**
 * Standard interface that all AI services must implement.
 * New services are added by implementing this interface and registering with the scheduler.
 */

export type ServiceStatus = "idle" | "running" | "paused" | "stopped" | "errored";

export type ClaudeModel = "haiku" | "sonnet" | "opus";

export const MODEL_IDS: Record<ClaudeModel, string> = {
  haiku: "haiku",
  sonnet: "sonnet",
  opus: "opus",
};

export interface ServiceModelConfig {
  model: ClaudeModel;
}

export interface RunTaskResult {
  taskId: string;
  label: string;
  iteration: number;
  output: string;
  tokensUsed: number;
  costEstimate: number;
  completedAt: string;
}

export type RunStatus = "running" | "completed" | "errored";

export interface RunRecord {
  runId: string;
  cycleNumber: number;
  serviceId: string;
  model: ClaudeModel;
  startedAt: string;
  completedAt: string | null;
  status: RunStatus;
  tasks: RunTaskResult[];
  totalTokens: number;
  totalCost: number;
}

export interface ServiceConfig {
  id: string;
  name: string;
  description: string;
  budget: number;
}

export interface TaskLog {
  taskId: string;
  serviceId: string;
  iteration: number;
  tokensUsed: number;
  costEstimate: number;
  message: string;
  timestamp: string;
}

export interface ServiceReport {
  serviceId: string;
  status: ServiceStatus;
  totalTokensUsed: number;
  totalCost: number;
  budgetRemaining: number;
  tasksCompleted: number;
  lastRun: string | null;
  logs: TaskLog[];
}

export interface Service {
  readonly config: ServiceConfig;
  start(): Promise<void>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  status(): Promise<ServiceStatus>;
  logs(limit?: number): Promise<TaskLog[]>;
  report(): Promise<ServiceReport>;
}
