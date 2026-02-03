import { ServiceConfig } from "../../shared/types/service.js";
import { BaseService } from "../base-service.js";
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

    for (const topic of topics) {
      if (this._status !== "running") break;

      await this.runTask({
        label: `track: ${topic}`,
        prompt: `Check for recent developments and changes regarding: "${topic}". Summarize any new findings, compare with known information, and highlight significant changes.`,
        maxTurns: 3,
      });
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
}
