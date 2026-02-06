/**
 * Claude Usage Report — reads ~/.claude/stats-cache.json and computes metrics.
 * Adapted from nazt/claude-usage-report (MIT License).
 */

import { readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type {
  UsageReportData,
  ModelUsage,
  DailyActivity,
  ModelPricing,
} from "../../shared/types/usage-report.js";

const CLAUDE_DIR = join(homedir(), ".claude");
const STATS_FILE = join(CLAUDE_DIR, "stats-cache.json");

// Per-model pricing (Feb 2026, https://docs.anthropic.com/en/docs/about-claude/pricing)
const PRICING: Record<string, ModelPricing> = {
  opus:   { input: 5,   output: 25,  cacheRead: 0.50, cacheWrite: 6.25 },
  sonnet: { input: 3,   output: 15,  cacheRead: 0.30, cacheWrite: 3.75 },
  haiku:  { input: 1,   output: 5,   cacheRead: 0.10, cacheWrite: 1.25 },
  other:  { input: 3,   output: 15,  cacheRead: 0.30, cacheWrite: 3.75 },
};

const PLAN_COST = 200; // Max plan tier ($200/month)

function getModelPricing(modelId: string): ModelPricing {
  if (modelId.includes("opus")) return PRICING.opus;
  if (modelId.includes("sonnet")) return PRICING.sonnet;
  if (modelId.includes("haiku")) return PRICING.haiku;
  return PRICING.other;
}

export class UsageReportReader {
  private statsPath: string;

  constructor(statsPath?: string) {
    this.statsPath = statsPath ?? STATS_FILE;
  }

  /**
   * Read stats-cache.json and compute the full usage report.
   * Returns null if the file does not exist or cannot be parsed.
   */
  async getReport(): Promise<UsageReportData | null> {
    let raw: string;
    try {
      raw = await readFile(this.statsPath, "utf-8");
    } catch {
      return null;
    }

    let stats: Record<string, unknown>;
    try {
      stats = JSON.parse(raw);
    } catch {
      return null;
    }

    return this.computeMetrics(stats);
  }

  private computeMetrics(stats: Record<string, unknown>): UsageReportData {
    // Parse model usage
    const modelUsageRaw = (stats.modelUsage ?? {}) as Record<
      string,
      {
        inputTokens?: number;
        outputTokens?: number;
        cacheReadInputTokens?: number;
        cacheCreationInputTokens?: number;
      }
    >;

    const models: ModelUsage[] = Object.entries(modelUsageRaw)
      .map(([id, u]) => {
        const inputTokens = u.inputTokens ?? 0;
        const outputTokens = u.outputTokens ?? 0;
        const cacheReadInputTokens = u.cacheReadInputTokens ?? 0;
        const cacheCreationInputTokens = u.cacheCreationInputTokens ?? 0;
        const total =
          inputTokens + outputTokens + cacheReadInputTokens + cacheCreationInputTokens;
        return { id, inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens, total };
      })
      .sort((a, b) => b.total - a.total);

    const totalTokens = models.reduce((s, m) => s + m.total, 0);
    const totalInput = models.reduce((s, m) => s + m.inputTokens, 0);
    const totalOutput = models.reduce((s, m) => s + m.outputTokens, 0);
    const totalCacheRead = models.reduce((s, m) => s + m.cacheReadInputTokens, 0);
    const totalCacheCreate = models.reduce((s, m) => s + m.cacheCreationInputTokens, 0);

    // Calculate cost estimate per-model
    const costEstimate = models.reduce((sum, m) => {
      const p = getModelPricing(m.id);
      return (
        sum +
        (m.inputTokens * p.input +
          m.outputTokens * p.output +
          m.cacheReadInputTokens * p.cacheRead +
          m.cacheCreationInputTokens * p.cacheWrite) /
          1_000_000
      );
    }, 0);

    // Daily activity
    const daily = ((stats.dailyActivity ?? []) as DailyActivity[]).map((d) => ({
      date: d.date,
      messageCount: d.messageCount ?? 0,
      sessionCount: d.sessionCount ?? 0,
      toolCallCount: d.toolCallCount ?? 0,
    }));

    const totalMessages =
      (stats.totalMessages as number | undefined) ??
      daily.reduce((s, d) => s + d.messageCount, 0);
    const totalSessions =
      (stats.totalSessions as number | undefined) ??
      daily.reduce((s, d) => s + d.sessionCount, 0);
    const totalToolCalls = daily.reduce((s, d) => s + d.toolCallCount, 0);
    const dayCount = daily.length;
    const avgMessagesPerDay = dayCount ? Math.round(totalMessages / dayCount) : 0;

    // Peak day
    const peakDay =
      daily.length > 0
        ? daily.reduce((max, d) => (d.messageCount > max.messageCount ? d : max), daily[0])
        : null;

    // Top 5 days by message count
    const topDays = [...daily]
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 5);

    // Hourly distribution
    const hourCounts = (stats.hourCounts ?? {}) as Record<number, number>;

    // Value multiplier
    const valueMultiplier = costEstimate > 0 ? Math.round(costEstimate / PLAN_COST) : 0;

    return {
      generated: new Date().toISOString(),
      firstSessionDate: (stats.firstSessionDate as string) ?? null,
      lastComputedDate: (stats.lastComputedDate as string) ?? null,
      totalTokens,
      totalInput,
      totalOutput,
      totalCacheRead,
      totalCacheCreate,
      costEstimate,
      totalMessages,
      totalSessions,
      totalToolCalls,
      dayCount,
      avgMessagesPerDay,
      models,
      daily,
      hourCounts,
      peakDay,
      topDays,
      valueMultiplier,
      planCost: PLAN_COST,
    };
  }
}
