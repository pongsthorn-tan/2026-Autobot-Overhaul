import { ServiceConfig } from "../../shared/types/service.js";
import { TaskParams, TopicTrackerTaskParams } from "../../shared/types/task.js";
import { BaseService, StandaloneContext } from "../base-service.js";
import { JsonStore } from "../../shared/persistence/index.js";

export class TopicTrackerService extends BaseService {
  readonly config: ServiceConfig = {
    id: "topic-tracker",
    name: "Topic Tracker",
    description: "Monitors and tracks specified topics over time, detecting changes and new developments.",
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
          prompt: `Check for recent developments and changes regarding: "${topic}". Summarize any new findings, compare with known information, and highlight significant changes.`,
          maxTurns: 3,
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
    await this.runTask({
      label: `track: ${p.topic}`,
      prompt: `Check for recent developments and changes regarding: "${p.topic}". Summarize any new findings, compare with known information, and highlight significant changes.`,
      maxTurns: 3,
      modelOverride: ctx.model,
      serviceIdOverride: ctx.budgetKey,
    });
  }
}
