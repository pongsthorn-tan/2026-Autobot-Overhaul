/**
 * ReportIntelService — single-pass, stateless report generation.
 *
 * User provides what they want reported on → prompt builder converts
 * that intent into a detailed report prompt → single runTask → structured JSON.
 *
 * No state between runs. Each invocation is independent.
 */

import { ServiceConfig, ClaudeModel } from "../../shared/types/service.js";
import { TaskParams, ReportTaskParams } from "../../shared/types/task.js";
import { BaseService, StandaloneContext } from "../base-service.js";
import { buildReportPrompt } from "./prompt-builder.js";

export class ReportIntelService extends BaseService {
  readonly config: ServiceConfig = {
    id: "report",
    name: "Report",
    description: "Generates structured reports from user intent. Single-pass, stateless — each run is independent.",
    budget: 0,
  };

  protected getServiceId(): string {
    return "report";
  }

  async start(): Promise<void> {
    this._status = "running";

    await this.beginRun();
    try {
      const prompt = buildReportPrompt(
        "Generate a comprehensive system status report summarizing all service activity, costs, and performance metrics.",
      );
      await this.runTask({
        label: "system-report",
        prompt,
        maxTurns: 5,
      });
      await this.completeRun("completed");
    } catch (err) {
      await this.completeRun("errored");
      throw err;
    }

    this._status = "idle";
  }

  protected async executeStandalone(params: TaskParams, ctx: StandaloneContext): Promise<void> {
    const p = params as ReportTaskParams;
    const prompt = buildReportPrompt(p.prompt);
    await this.runTask({
      label: "standalone-report",
      prompt,
      maxTurns: 5,
      modelOverride: ctx.model,
      serviceIdOverride: ctx.budgetKey,
    });
  }
}
