/**
 * Intel service types — shared across report, research, and topic-tracker.
 *
 * All three services follow the same pattern:
 *   user input → prompt builder → runTask → structured JSON output
 *
 * They differ in iteration strategy and state management:
 *   - report:        single pass, stateless between runs
 *   - research:      adaptive multi-step with evolving todo list
 *   - topic-tracker: recurring with rolling digest to avoid re-tracking
 */

export type IntelStyle = "report" | "research" | "topic-tracker";

// Re-export TopicPreset from shared types (canonical definition)
import type { TopicPreset } from "../../shared/types/task.js";
export type { TopicPreset } from "../../shared/types/task.js";

// ── Preset configuration ───────────────────────────────────────────

export interface PresetConfig {
  timeframe: string;
  maxTurns: number;
  focus: string;
  webSearch: boolean;
}

export const PRESETS: Record<TopicPreset, PresetConfig> = {
  "company-news": {
    timeframe: "past 7 days",
    maxTurns: 15,
    focus: "Focus on earnings reports, official announcements, leadership changes, partnerships, acquisitions, and regulatory filings.",
    webSearch: true,
  },
  "market-crypto": {
    timeframe: "past 24 hours",
    maxTurns: 15,
    focus: "Focus on price movements, regulatory news, whale activity, exchange volumes, sentiment shifts, and notable on-chain events.",
    webSearch: true,
  },
  "election-politics": {
    timeframe: "past 2 hours",
    maxTurns: 15,
    focus: "Focus on vote counts, candidate statements, poll results, breaking political news, policy announcements, and debate highlights.",
    webSearch: true,
  },
  "tech-launch": {
    timeframe: "past 6 hours",
    maxTurns: 15,
    focus: "Focus on product launches, early reviews, user reactions, availability and pricing, feature comparisons, and notable bugs or issues.",
    webSearch: true,
  },
  custom: {
    timeframe: "past 3 days",
    maxTurns: 15,
    focus: "Track all notable developments, news, and changes related to this topic.",
    webSearch: true,
  },
};

// ── Structured output schema ───────────────────────────────────────

export interface IntelSection {
  type: "summary" | "key-findings" | "text" | "callout";
  heading?: string;
  content?: string;
  items?: string[];
  variant?: "info" | "warning" | "success";
}

export interface IntelOutput {
  title: string;
  generatedAt: string;
  style: IntelStyle;
  sections: IntelSection[];
  conclusion: string;
}

// ── Digest: compressed state for token-efficient context passing ───

export interface DigestEntry {
  id: string;           // unique identifier for this item
  summary: string;      // one-line description
  trackedAt: string;    // ISO timestamp when first found
}

export interface Digest {
  topic: string;
  style: IntelStyle;
  entries: DigestEntry[];
  lastUpdatedAt: string;
  cycleCount: number;
}

// ── Research-specific: adaptive todo list ──────────────────────────

export interface ResearchStep {
  id: string;
  subTopic: string;
  status: "pending" | "completed" | "skipped";
  findings?: string;     // compressed summary of what was found
}

export interface ResearchState {
  topic: string;
  steps: ResearchStep[];
  overallFindings: string;  // rolling summary of all findings so far
  iterationsCompleted: number;
}
