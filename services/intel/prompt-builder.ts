/**
 * Prompt builder — converts user input into effective prompts per intel style.
 *
 * Each style transforms user input differently:
 *   - report:        user intent → detailed report requirements prompt
 *   - research:      user topic → sub-topic planning prompt / step execution prompt
 *   - topic-tracker: user topic → tracking prompt with digest context for dedup
 */

import {
  IntelStyle,
  TopicPreset,
  PresetConfig,
  PRESETS,
  Digest,
  ResearchState,
} from "./types.js";

const OUTPUT_SCHEMA = `Output a valid JSON object following this schema (no markdown fences):
{
  "title": "<descriptive title>",
  "generatedAt": "<ISO timestamp>",
  "style": "<report|research|topic-tracker>",
  "sections": [
    { "type": "summary", "content": "Brief overview..." },
    { "type": "key-findings", "heading": "Key Findings", "items": ["item1", "item2", ...] },
    { "type": "text", "heading": "Detailed Analysis", "content": "..." },
    { "type": "callout", "variant": "info|warning|success", "content": "Notable highlight..." }
  ],
  "conclusion": "Summary and outlook..."
}`;

const DIGEST_OUTPUT_INSTRUCTION = `

Additionally, after the main JSON output, output a second JSON object on a new line starting with "DIGEST:" that lists new items discovered in this run:
DIGEST:{"entries":[{"id":"<short-kebab-id>","summary":"<one line summary>"}]}

This digest will be used to avoid re-tracking the same items in future runs. Be thorough — include every distinct finding, event, or data point.`;

// ── Report prompts ─────────────────────────────────────────────────

export function buildReportPrompt(userInput: string): string {
  return `You are an analyst producing a structured report. The user has described what they want reported on. Convert their intent into a thorough, well-organized report.

User request: "${userInput}"

Analyze the request carefully. Produce a comprehensive report covering all aspects the user is interested in. Use web search if needed to gather current data.

${OUTPUT_SCHEMA}`;
}

// ── Research prompts ───────────────────────────────────────────────

export function buildResearchPlanPrompt(topic: string): string {
  return `You are a research planner. Given a topic, break it down into a structured research plan — a list of sub-topics that should be investigated to thoroughly understand the subject.

Topic: "${topic}"

Output a valid JSON object (no markdown fences):
{
  "topic": "${topic}",
  "steps": [
    { "id": "step-1", "subTopic": "<specific sub-topic to research>" },
    { "id": "step-2", "subTopic": "<specific sub-topic to research>" },
    ...
  ]
}

Guidelines:
- Create 3-7 sub-topics that together cover the topic comprehensively
- Order them logically — foundational concepts first, then deeper analysis
- Each sub-topic should be specific enough to research in a single focused session
- Include at least one sub-topic for "current state / recent developments"`;
}

export function buildResearchStepPrompt(
  topic: string,
  step: { id: string; subTopic: string },
  state: ResearchState,
): string {
  // Build context from previous findings
  const previousContext = state.overallFindings
    ? `\n\nRESEARCH SO FAR:\n${state.overallFindings}`
    : "";

  const completedSteps = state.steps
    .filter((s) => s.status === "completed" && s.findings)
    .map((s) => `- ${s.subTopic}: ${s.findings}`)
    .join("\n");

  const completedContext = completedSteps
    ? `\n\nCOMPLETED SUB-TOPICS:\n${completedSteps}`
    : "";

  return `You are a researcher conducting deep research on: "${topic}"

Current sub-topic to investigate: "${step.subTopic}"
${previousContext}${completedContext}

Use web search to find current, authoritative information on this sub-topic. Build on what has already been discovered — go deeper, find new angles, and cross-reference.

${OUTPUT_SCHEMA}

Additionally, after the main JSON output, output a summary line for the research state:
FINDINGS:{"stepId":"${step.id}","findings":"<2-3 sentence summary of key discoveries>","overallUpdate":"<updated 3-5 sentence summary of ALL research findings so far, incorporating this new sub-topic>"}`;
}

export function buildResearchSynthesisPrompt(
  topic: string,
  state: ResearchState,
): string {
  const allFindings = state.steps
    .filter((s) => s.status === "completed" && s.findings)
    .map((s) => `## ${s.subTopic}\n${s.findings}`)
    .join("\n\n");

  return `You are a researcher producing a final synthesis report on: "${topic}"

All research has been completed. Here are the findings from each sub-topic:

${allFindings}

Overall summary so far: ${state.overallFindings}

Produce a comprehensive final report that synthesizes all findings into a cohesive analysis. Draw connections between sub-topics, highlight key themes, and provide actionable conclusions.

${OUTPUT_SCHEMA}`;
}

// ── Topic tracker prompts ──────────────────────────────────────────

export function buildTopicTrackerPrompt(
  topic: string,
  preset: TopicPreset,
  digest: Digest | null,
): string {
  const config: PresetConfig = PRESETS[preset] ?? PRESETS.custom;

  const digestContext = digest && digest.entries.length > 0
    ? buildDigestContext(digest)
    : "";

  return `You are a topic tracker that monitors recent developments. Your job is to search the internet for the latest news and developments on the given topic.

IMPORTANT: Use your web search capabilities to find the most recent information. Search for news from the ${config.timeframe}.

Topic: "${topic}"

${config.focus}
${digestContext}

Search for:
1. Latest news articles and announcements
2. Key developments and changes
3. Notable events or milestones
4. Expert opinions and analysis

${OUTPUT_SCHEMA}${DIGEST_OUTPUT_INSTRUCTION}`;
}

function buildDigestContext(digest: Digest): string {
  const recentEntries = digest.entries.slice(-50); // most recent 50
  const itemList = recentEntries
    .map((e) => `- [${e.trackedAt}] ${e.summary}`)
    .join("\n");

  return `
PREVIOUSLY TRACKED (${digest.entries.length} items across ${digest.cycleCount} cycles — DO NOT re-report these):
${itemList}

Focus ONLY on NEW developments not listed above. If there is nothing new, say so clearly in the summary rather than repeating old information.`;
}

// ── Branch-aware topic tracker prompt ────────────────────────────────

export function buildBranchTrackerPrompt(
  rootTopic: string,
  branchLabel: string,
  branchDescription: string,
  branchPath: string[],
  preset: TopicPreset,
  digest: Digest | null,
): string {
  const config: PresetConfig = PRESETS[preset] ?? PRESETS.custom;

  const pathContext = branchPath.length > 1
    ? `\nBranch path: ${branchPath.join(" → ")}`
    : "";

  const digestContext = digest && digest.entries.length > 0
    ? buildDigestContext(digest)
    : "";

  return `You are a topic tracker monitoring a specific dimension of a broader topic.

ROOT TOPIC: "${rootTopic}"
TRACKING DIMENSION: "${branchLabel}"${pathContext}
DIMENSION SCOPE: ${branchDescription}

IMPORTANT: Use your web search capabilities to find the most recent information. Search for news from the ${config.timeframe}.

${config.focus}

Focus your search specifically on the "${branchLabel}" dimension of "${rootTopic}". Do NOT cover other dimensions — stay scoped to this branch only.
${digestContext}

Search for:
1. Latest news and developments specific to this dimension
2. Key changes, decisions, or announcements
3. Notable events or milestones
4. Expert opinions and analysis

If there are NO new developments for this dimension in the given timeframe, respond with a report that has a single summary section stating "No new developments found for ${branchLabel} in the ${config.timeframe}." — do not fabricate or repeat old information.

${OUTPUT_SCHEMA}${DIGEST_OUTPUT_INSTRUCTION}`;
}

// ── Scheduled report prompt (topic-tracker without digest) ─────────

export function buildScheduledReportPrompt(
  topic: string,
  preset: TopicPreset,
): string {
  const config: PresetConfig = PRESETS[preset] ?? PRESETS.custom;

  return `You are a topic tracker that monitors recent developments. Your job is to search the internet for the latest news and developments on the given topic.

IMPORTANT: Use your web search capabilities to find the most recent information. Search for news from the ${config.timeframe}.

Topic: "${topic}"

${config.focus}

Search for:
1. Latest news articles and announcements
2. Key developments and changes
3. Notable events or milestones
4. Expert opinions and analysis

${OUTPUT_SCHEMA}`;
}
