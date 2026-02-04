import { ServiceConfig } from "../../shared/types/service.js";
import { TaskParams, TopicTrackerTaskParams, TopicPreset } from "../../shared/types/task.js";
import { BaseService, StandaloneContext } from "../base-service.js";
import { JsonStore } from "../../shared/persistence/index.js";

const PRESET_TIMEFRAMES: Record<TopicPreset, string> = {
  "company-news": "past 7 days",
  "market-crypto": "past 24 hours",
  "election-politics": "past 2 hours",
  "tech-launch": "past 6 hours",
  "custom": "past 3 days",
};

const PRESET_FOCUS: Record<TopicPreset, string> = {
  "company-news":
    "Focus on earnings reports, official announcements, leadership changes, partnerships, acquisitions, and regulatory filings.",
  "market-crypto":
    "Focus on price movements, regulatory news, whale activity, exchange volumes, sentiment shifts, and notable on-chain events.",
  "election-politics":
    "Focus on vote counts, candidate statements, poll results, breaking political news, policy announcements, and debate highlights.",
  "tech-launch":
    "Focus on product launches, early reviews, user reactions, availability and pricing, feature comparisons, and notable bugs or issues.",
  "custom":
    "Track all notable developments, news, and changes related to this topic.",
};

function buildPrompt(topic: string, preset: TopicPreset): string {
  const timeframe = PRESET_TIMEFRAMES[preset];
  const focus = PRESET_FOCUS[preset];

  return `You are a topic tracker that monitors recent developments. Your job is to search the internet for the latest news and developments on the given topic.

IMPORTANT: Use your web search capabilities to find the most recent information. Search for news from the ${timeframe}.

Topic: "${topic}"

${focus}

Search for:
1. Latest news articles and announcements
2. Key developments and changes
3. Notable events or milestones
4. Expert opinions and analysis

Output a valid JSON object following this schema (no markdown fences):
{
  "title": "Topic Update: ${topic}",
  "generatedAt": "ISO timestamp",
  "sections": [
    { "type": "summary", "content": "Brief overview of what happened..." },
    { "type": "key-findings", "heading": "Key Developments", "items": ["item1", "item2", ...] },
    { "type": "text", "heading": "Detailed Analysis", "content": "..." },
    { "type": "callout", "variant": "info|warning|success", "content": "Notable highlight..." }
  ],
  "conclusion": "Summary and what to watch for next..."
}`;
}

export class TopicTrackerService extends BaseService {
  readonly config: ServiceConfig = {
    id: "topic-tracker",
    name: "Topic Tracker",
    description: "Monitors and tracks specified topics over time using web search, with preset-based tracking styles.",
    budget: 0,
  };

  private trackedTopicsStore = new JsonStore<string[]>("data/tracked-topics.json", []);

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

        await this.runTask({
          label: `track: ${topic}`,
          prompt: buildPrompt(topic, "custom"),
          maxTurns: 15,
        });
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
    const prompt = buildPrompt(p.topic, preset);

    await this.runTask({
      label: `track: ${p.topic}`,
      prompt,
      maxTurns: 15,
      modelOverride: ctx.model,
      serviceIdOverride: ctx.budgetKey,
      onProgress: ctx.onProgress,
    });
  }
}
