import { ServiceConfig } from "../../shared/types/service.js";
import { TaskParams, ResearchTaskParams } from "../../shared/types/task.js";
import { BaseService, StandaloneContext } from "../base-service.js";
import { JsonStore } from "../../shared/persistence/index.js";

export class ResearchService extends BaseService {
  readonly config: ServiceConfig = {
    id: "research",
    name: "Research",
    description: "AI-powered research service that gathers, synthesizes, and summarizes information on given topics.",
    budget: 0,
  };

  private topicsStore = new JsonStore<string[]>("data/research-topics.json", []);

  protected getServiceId(): string {
    return "research";
  }

  async start(): Promise<void> {
    this._status = "running";
    const topics = await this.topicsStore.load();

    if (topics.length === 0) {
      this.logger.info("No research topics queued");
      this._status = "idle";
      return;
    }

    await this.beginRun();
    try {
      for (const topic of topics) {
        if (this._status !== "running") break;

        await this.runTask({
          label: topic,
          prompt: `Research the following topic thoroughly and produce a structured summary with key findings, analysis, and sources:\n\n"${topic}"`,
          maxTurns: 5,
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
    const topics = await this.topicsStore.load();
    topics.push(topic);
    await this.topicsStore.save(topics);
    this.logger.info(`Added research topic: ${topic}`);
  }

  async getTopics(): Promise<string[]> {
    return this.topicsStore.load();
  }

  async clearTopics(): Promise<void> {
    await this.topicsStore.save([]);
  }

  protected async executeStandalone(params: TaskParams, ctx: StandaloneContext): Promise<void> {
    const p = params as ResearchTaskParams;
    await this.runTask({
      label: p.topic,
      prompt: `Research the following topic thoroughly and produce a structured summary with key findings, analysis, and sources:\n\n"${p.topic}"`,
      maxTurns: 5,
      modelOverride: ctx.model,
      serviceIdOverride: ctx.budgetKey,
    });
  }
}
