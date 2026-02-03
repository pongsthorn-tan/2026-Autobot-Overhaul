const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => 'Unknown error');
    throw new Error(`API error ${res.status}: ${errorText}`);
  }

  return res.json();
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'DELETE' });
}

// Type definitions for API responses

export interface Service {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'running' | 'paused' | 'stopped' | 'errored' | 'idle';
  schedule?: {
    type: string;
    expression?: string;
    interval?: number;
    timeOfDay?: string;
    daysOfWeek?: string[] | number[];
  };
  lastRun?: string;
  nextRun?: string;
}

export interface Budget {
  serviceId: string;
  serviceName?: string;
  allocated: number;
  spent: number;
  remaining: number;
  alertThreshold?: number;
}

export interface CostSummary {
  serviceId: string;
  serviceName?: string;
  totalCost: number;
  totalTokens: number;
  taskCount: number;
  iterationCount: number;
}

export interface TaskCost {
  taskId: string;
  taskName?: string;
  cost: number;
  tokens: number;
  iterations: number;
  lastRun?: string;
}

export interface LogEntry {
  timestamp: string;
  service: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  taskId?: string;
  iteration?: number;
  tokens?: number;
  cost?: number;
}

export type ClaudeModel = 'haiku' | 'sonnet' | 'opus';

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

export type RunStatus = 'running' | 'completed' | 'errored';

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

export interface NextRunsResponse {
  serviceId: string;
  nextRuns: string[];
}

// Standalone Tasks

export type StandaloneTaskStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'errored';
export type TaskServiceType = 'report' | 'research' | 'code-task' | 'topic-tracker' | 'self-improve';

export interface StandaloneTask {
  taskId: string;
  serviceType: TaskServiceType;
  params: Record<string, unknown>;
  model: ClaudeModel;
  budget: number;
  schedule?: Record<string, unknown>;
  status: StandaloneTaskStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  costSpent: number;
  error: string | null;
}

export interface CreateTaskInput {
  serviceType: TaskServiceType;
  params: Record<string, unknown>;
  model: ClaudeModel;
  budget: number;
  runNow: boolean;
  schedule?: Record<string, unknown>;
}

export function createTask(input: CreateTaskInput): Promise<StandaloneTask> {
  return apiPost<StandaloneTask>('/api/tasks', input);
}

export function listTasks(serviceType?: string): Promise<StandaloneTask[]> {
  const query = serviceType ? `?serviceType=${serviceType}` : '';
  return apiFetch<StandaloneTask[]>(`/api/tasks${query}`);
}

export function deleteTask(taskId: string): Promise<{ ok: boolean }> {
  return apiDelete<{ ok: boolean }>(`/api/tasks/${taskId}`);
}

// Schedule types

export interface ScheduleSlot {
  timeOfDay: string;    // "HH:MM"
  daysOfWeek: number[]; // 0=Sun..6=Sat
}

export type ScheduleConfig =
  | { type: 'once' }
  | { type: 'scheduled'; slots: ScheduleSlot[] };

// Prompt refinement (dual provider: Claude async job or OpenAI sync)

export type RefineProvider = 'claude' | 'openai';
export type OpenAIModel = 'gpt-5-nano' | 'gpt-5-mini' | 'gpt-5.2';

export interface RefineStartResponse {
  provider: RefineProvider;
  jobId?: string;           // claude path
  refinedPrompt?: string;   // openai path
  cost?: number;            // openai path
  tokensUsed?: { input: number; output: number }; // openai path
}

export interface RefineJobPollResponse {
  jobId: string;
  status: 'running' | 'completed' | 'errored';
  refinedPrompt?: string;
  cost?: number;
  sessionId?: string;
  error?: string;
}

export function startRefinePrompt(
  prompt: string,
  provider: RefineProvider,
  model: string,
  maxTokens: number,
): Promise<RefineStartResponse> {
  return apiPost<RefineStartResponse>('/api/tasks/refine-prompt', { prompt, provider, model, maxTokens });
}

export function pollRefinePrompt(jobId: string): Promise<RefineJobPollResponse> {
  return apiFetch<RefineJobPollResponse>(`/api/tasks/refine-prompt/${jobId}`);
}
