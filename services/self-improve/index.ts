import { ServiceConfig } from "../../shared/types/service.js";
import { TaskParams, SelfImproveTaskParams } from "../../shared/types/task.js";
import { BaseService, StandaloneContext } from "../base-service.js";
import { generateTaskId } from "../../shared/utils/index.js";

export class SelfImproveService extends BaseService {
  readonly config: ServiceConfig = {
    id: "self-improve",
    name: "Self-Iterative Improvement",
    description: "Analyzes system performance and iteratively improves services, prompts, and workflows.",
    budget: 0,
  };

  private maxIterations = 3;

  protected getServiceId(): string {
    return "self-improve";
  }

  async start(): Promise<void> {
    this._status = "running";

    const taskId = generateTaskId("self-improve", "system-optimization");

    await this.beginRun();
    try {
      for (let i = 1; i <= this.maxIterations; i++) {
        if (this._status !== "running") break;

        await this.runTask({
          label: `system optimization (iteration ${i}/${this.maxIterations})`,
          prompt: `Iteration ${i} of ${this.maxIterations}: Analyze the autobot system logs, performance metrics, and service outputs. Identify areas for improvement in prompts, workflows, or configurations. Suggest and implement concrete improvements.`,
          maxTurns: 5,
          iteration: i,
          existingTaskId: taskId,
        });
      }
      await this.completeRun("completed");
    } catch (err) {
      await this.completeRun("errored");
      throw err;
    }

    this._status = "idle";
  }

  protected async executeStandalone(params: TaskParams, ctx: StandaloneContext): Promise<void> {
    const p = params as SelfImproveTaskParams;
    const taskId = generateTaskId("self-improve", "standalone");
    for (let i = 1; i <= p.maxIterations; i++) {
      await this.runTask({
        label: `optimization (iteration ${i}/${p.maxIterations})`,
        prompt: `Iteration ${i} of ${p.maxIterations}: Analyze the autobot system logs, performance metrics, and service outputs. Identify areas for improvement in prompts, workflows, or configurations. Suggest and implement concrete improvements.`,
        maxTurns: 5,
        iteration: i,
        existingTaskId: taskId,
        modelOverride: ctx.model,
        serviceIdOverride: ctx.budgetKey,
      });
    }
  }
}
