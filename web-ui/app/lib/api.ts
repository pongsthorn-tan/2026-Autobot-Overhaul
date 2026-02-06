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

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method: 'PATCH',
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

export type StandaloneTaskStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'errored' | 'paused';
export type TaskServiceType = 'report' | 'research' | 'code-task' | 'topic-tracker' | 'self-improve';

export interface CycleRecord {
  cycle: number;
  startedAt: string;
  completedAt: string;
  costSpent: number;
  output: string | null;
  error: string | null;
}

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
  cyclesCompleted?: number;
  cycleHistory?: CycleRecord[];
  error: string | null;
  output: string | null;
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

export interface UpdateTaskInput {
  params?: Record<string, unknown>;
  model?: ClaudeModel;
  budget?: number;
  schedule?: Record<string, unknown> | null;
}

export function updateTask(taskId: string, updates: UpdateTaskInput): Promise<StandaloneTask> {
  return apiPatch<StandaloneTask>(`/api/tasks/${taskId}`, updates);
}

export function pauseTask(taskId: string): Promise<StandaloneTask> {
  return apiPost<StandaloneTask>(`/api/tasks/${taskId}/pause`);
}

export function resumeTask(taskId: string): Promise<StandaloneTask> {
  return apiPost<StandaloneTask>(`/api/tasks/${taskId}/resume`);
}

// Schedule types

export interface ScheduleSlot {
  timeOfDay: string;    // "HH:MM"
  daysOfWeek: number[]; // 0=Sun..6=Sat
}

export type ScheduleConfig =
  | { type: 'once' }
  | { type: 'scheduled'; slots: ScheduleSlot[] }
  | { type: 'interval'; intervalHours: number; maxCycles?: number };

// Topic tracker types

export type TopicPreset = 'company-news' | 'market-crypto' | 'election-politics' | 'tech-launch' | 'custom';

export interface SpendingLimit {
  maxPerWindow: number;
  windowHours: number;
}

export interface TopicTrackerTaskParams {
  serviceType: 'topic-tracker';
  topic: string;
  preset: TopicPreset;
  maxCycles?: number;
  spendingLimit?: SpendingLimit;
}

// Prompt refinement (Claude CLI async job)

export interface RefineStartResponse {
  jobId: string;
  fullPrompt?: string;
  model?: string;
}

export interface RefineJobPollResponse {
  jobId: string;
  status: 'running' | 'completed' | 'errored';
  refinedPrompt?: string;
  cost?: number;
  sessionId?: string;
  error?: string;
  fullPrompt?: string;
  model?: string;
}

export function startRefinePrompt(
  prompt: string,
  model: string,
): Promise<RefineStartResponse> {
  return apiPost<RefineStartResponse>('/api/tasks/refine-prompt', { prompt, model });
}

export function pollRefinePrompt(jobId: string): Promise<RefineJobPollResponse> {
  return apiFetch<RefineJobPollResponse>(`/api/tasks/refine-prompt/${jobId}`);
}

// Task detail fetch
export function getTask(taskId: string): Promise<StandaloneTask> {
  return apiFetch<StandaloneTask>(`/api/tasks/${taskId}`);
}

export function getTaskCycles(taskId: string): Promise<CycleRecord[]> {
  return apiFetch<CycleRecord[]>(`/api/tasks/${taskId}/cycles`);
}

// SSE Streaming

export interface TaskStreamEvent {
  type: 'connected' | 'prompt' | 'chunk' | 'step' | 'cost' | 'done' | 'error';
  taskId?: string;
  prompt?: string;
  model?: string;
  text?: string;
  step?: { index: number; label: string; status: string };
  cost?: number;
  output?: string;
  error?: string;
}

export interface RefineStreamEvent {
  type: 'connected' | 'chunk' | 'done' | 'error';
  jobId?: string;
  text?: string;
  refinedPrompt?: string;
  cost?: number;
  error?: string;
}

export function streamTask(taskId: string, onEvent: (e: TaskStreamEvent) => void): () => void {
  const url = `${API_URL}/api/tasks/${taskId}/stream`;
  const es = new EventSource(url);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch { /* ignore parse errors */ }
  };
  es.onerror = () => {
    es.close();
  };
  return () => es.close();
}

export function streamRefinePrompt(jobId: string, onEvent: (e: RefineStreamEvent) => void): () => void {
  const url = `${API_URL}/api/tasks/refine-prompt/${jobId}/stream`;
  const es = new EventSource(url);
  es.onmessage = (msg) => {
    try {
      onEvent(JSON.parse(msg.data));
    } catch { /* ignore parse errors */ }
  };
  es.onerror = () => {
    es.close();
  };
  return () => es.close();
}

// Usage Report types (from nazt/claude-usage-report integration)

export interface UsageReportModelUsage {
  id: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  total: number;
}

export interface UsageReportDailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface UsageReportData {
  generated: string;
  firstSessionDate: string | null;
  lastComputedDate: string | null;
  totalTokens: number;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheCreate: number;
  costEstimate: number;
  totalMessages: number;
  totalSessions: number;
  totalToolCalls: number;
  dayCount: number;
  avgMessagesPerDay: number;
  models: UsageReportModelUsage[];
  daily: UsageReportDailyActivity[];
  hourCounts: Record<number, number>;
  peakDay: UsageReportDailyActivity | null;
  topDays: UsageReportDailyActivity[];
  valueMultiplier: number;
  planCost: number;
}

export function fetchUsageReport(): Promise<UsageReportData> {
  return apiFetch<UsageReportData>('/api/usage-report');
}
