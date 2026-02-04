/**
 * TopicTrackerIntelService — recurring topic monitoring with digest-based dedup.
 *
 * Flow:
 *   1. User provides a topic + preset (e.g., "market-crypto", "tech-launch")
 *   2. Prompt builder creates tracking prompt using preset config
 *   3. If previous runs exist, the rolling digest is injected into the prompt
 *      so the AI knows what's already been tracked and skips it
 *   4. After each run, new findings are extracted and added to the digest
 *
 * Token optimization: only the compressed digest (list of one-line summaries)
 * is passed to subsequent runs, not full previous reports. This keeps input
 * tokens roughly constant regardless of how many cycles have run.
 */

import { ServiceConfig, ClaudeModel } from "../../shared/types/service.js";
import { TaskParams, TopicTrackerTaskParams, TopicPreset } from "../../shared/types/task.js";
import { BaseService, StandaloneContext } from "../base-service.js";
import { JsonStore } from "../../shared/persistence/index.js";
import { DigestStore } from "./digest-store.js";
import { DigestEntry } from "./types.js";
import { buildTopicTrackerPrompt } from "./prompt-builder.js";

export class TopicTrackerIntelService extends BaseService {
  readonly config: ServiceConfig = {
    id: "topic-tracker",
    name: "Topic Tracker",
    description: "Monitors topics over time with web search. Uses rolling digest to avoid re-tracking known items and keep token usage constant.",
    budget: 0,
  };

  private trackedTopicsStore = new JsonStore<string[]>("data/tracked-topics.json", []);
  private digestStore = new DigestStore();

  protected getServiceId(): string {
    return "topic-tracker";
  }

  async start(): Promise<void> {
    this._status = "running";
    const topics = await this.trackedTopicsStore.load();

    if (topics.length === 0) {
      this.logger.info("No topics being tracked");
      this._status = "idle";
      return;
    }

    await this.beginRun();
    try {
      for (const topic of topics) {
        if (this._status !== "running") break;
        await this.trackTopic(topic, "custom");
      }
      await this.completeRun("completed");
    } catch (err) {
      await this.completeRun("errored");
      throw err;
    }

    this._status = "idle";
  }

  async addTopic(topic: string): Promise<void> {
    const topics = await this.trackedTopicsStore.load();
    if (!topics.includes(topic)) {
      topics.push(topic);
      await this.trackedTopicsStore.save(topics);
    }
  }

  async getTopics(): Promise<string[]> {
    return this.trackedTopicsStore.load();
  }

  async clearTopics(): Promise<void> {
    await this.trackedTopicsStore.save([]);
  }

  protected async executeStandalone(params: TaskParams, ctx: StandaloneContext): Promise<void> {
    const p = params as TopicTrackerTaskParams;
    const preset = p.preset ?? "custom";
    await this.trackTopic(p.topic, preset, {
      modelOverride: ctx.model,
      serviceIdOverride: ctx.budgetKey,
    });
  }

  private getDigestKey(topic: string): string {
    return `tracker:${topic.toLowerCase().replace(/\s+/g, "-").slice(0, 50)}`;
  }

  private async trackTopic(
    topic: string,
    preset: TopicPreset,
    opts?: { modelOverride?: ClaudeModel; serviceIdOverride?: string },
  ): Promise<void> {
    const digestKey = this.getDigestKey(topic);

    // Load existing digest for this topic
    const digest = await this.digestStore.getDigest(digestKey);

    // Build prompt with digest context for dedup
    const prompt = buildTopicTrackerPrompt(topic, preset, digest);

    this.logger.info(`Tracking topic: ${topic}`, {
      preset,
      digestEntries: digest?.entries.length ?? 0,
      cycleNumber: (digest?.cycleCount ?? 0) + 1,
    });

    const result = await this.runTask({
      label: `track: ${topic}`,
      prompt,
      maxTurns: 15,
      modelOverride: opts?.modelOverride,
      serviceIdOverride: opts?.serviceIdOverride,
    });

    // Extract new digest entries from output and update store
    const newEntries = this.parseDigestOutput(result.output);
    if (newEntries.length > 0) {
      await this.digestStore.updateDigest(digestKey, newEntries, topic, "topic-tracker");
      this.logger.info(`Updated digest: ${topic}`, { newEntries: newEntries.length });
    } else {
      // Still bump the cycle count even if no new entries
      await this.digestStore.updateDigest(digestKey, [], topic, "topic-tracker");
    }
  }

  private parseDigestOutput(output: string): DigestEntry[] {
    try {
      const digestMatch = output.match(/DIGEST:\s*(\{[\s\S]*?\})\s*$/m);
      if (digestMatch) {
        const parsed = JSON.parse(digestMatch[1]);
        if (Array.isArray(parsed.entries)) {
          return parsed.entries.map((e: { id?: string; summary?: string }) => ({
            id: e.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            summary: e.summary || "Unknown item",
            trackedAt: new Date().toISOString(),
          }));
        }
      }
    } catch {
      // Fall through
    }

    // Fallback: try to extract key findings from structured JSON output
    try {
      const jsonMatch = output.match(/\{[\s\S]*"sections"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const entries: DigestEntry[] = [];
        for (const section of parsed.sections || []) {
          if (section.type === "key-findings" && Array.isArray(section.items)) {
            for (const item of section.items) {
              entries.push({
                id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                summary: typeof item === "string" ? item : String(item),
                trackedAt: new Date().toISOString(),
              });
            }
          }
        }
        return entries;
      }
    } catch {
      // Fall through
    }

    return [];
  }
}
