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

// Type definitions for API responses

export interface Service {
  id: string;
  name: string;
  status: 'active' | 'running' | 'paused' | 'stopped' | 'errored';
  schedule?: {
    type: string;
    expression?: string;
    interval?: number;
    timeOfDay?: string;
    daysOfWeek?: string[];
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
