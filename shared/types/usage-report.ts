/**
 * Types for the Claude Usage Report integration.
 * Based on nazt/claude-usage-report — reads ~/.claude/stats-cache.json
 */

export interface ModelUsage {
  id: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  total: number;
}

export interface DailyActivity {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface UsageReportData {
  generated: string;
  firstSessionDate: string | null;
  lastComputedDate: string | null;

  // Aggregate totals
  totalTokens: number;
  totalInput: number;
  totalOutput: number;
  totalCacheRead: number;
  totalCacheCreate: number;
  costEstimate: number;

  // Activity totals
  totalMessages: number;
  totalSessions: number;
  totalToolCalls: number;
  dayCount: number;
  avgMessagesPerDay: number;

  // Per-model breakdown
  models: ModelUsage[];

  // Daily activity
  daily: DailyActivity[];

  // Hourly distribution (hour 0-23 => count)
  hourCounts: Record<number, number>;

  // Peak day
  peakDay: DailyActivity | null;

  // Top 5 busiest days
  topDays: DailyActivity[];

  // Value analysis
  valueMultiplier: number;
  planCost: number;
}

/** Pricing per million tokens, by model tier */
export interface ModelPricing {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
