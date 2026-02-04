import { ClaudeModel } from "./service.js";
import { Schedule, ScheduleConfig } from "./scheduler.js";

export type StandaloneTaskStatus = "pending" | "scheduled" | "running" | "completed" | "errored";
export type TaskServiceType = "report" | "research" | "code-task" | "topic-tracker" | "self-improve";

export interface ReportTaskParams {
  serviceType: "report";
  prompt: string;
}

export interface ResearchTaskParams {
  serviceType: "research";
  topic: string;
  plannerModel?: ClaudeModel;
  executorModel?: ClaudeModel;
  maxSteps?: number;
  maxRevisionsPerStep?: number;
}

export interface CodeTaskParams {
  serviceType: "code-task";
  description: string;
  targetPath: string;
  maxIterations: number;
}

export type TopicPreset = "company-news" | "market-crypto" | "election-politics" | "tech-launch" | "custom";

export interface SpendingLimit {
  maxPerWindow: number;   // max $ per rolling window
  windowHours: number;    // window size in hours (e.g., 3)
}

export interface TopicTrackerTaskParams {
  serviceType: "topic-tracker";
  topic: string;
  preset: TopicPreset;
  maxCycles?: number;
  spendingLimit?: SpendingLimit;
}

export interface SelfImproveTaskParams {
  serviceType: "self-improve";
  maxIterations: number;
}

export type TaskParams =
  | ReportTaskParams
  | ResearchTaskParams
  | CodeTaskParams
  | TopicTrackerTaskParams
  | SelfImproveTaskParams;

export interface StandaloneTask {
  taskId: string;
  serviceType: TaskServiceType;
  params: TaskParams;
  model: ClaudeModel;
  budget: number;
  schedule?: ScheduleConfig;
  status: StandaloneTaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  costSpent: number;
  cyclesCompleted?: number;
  error: string | null;
  output: string | null;
}

export interface CreateTaskInput {
  serviceType: TaskServiceType;
  params: TaskParams;
  model: ClaudeModel;
  budget: number;
  runNow: boolean;
  schedule?: ScheduleConfig;
}
