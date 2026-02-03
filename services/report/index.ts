import { ServiceConfig } from "../../shared/types/service.js";
import { BaseService } from "../base-service.js";

export class ReportService extends BaseService {
  readonly config: ServiceConfig = {
    id: "report",
    name: "Report",
    description: "Generates and delivers scheduled reports. Aggregates data from other services into formatted outputs.",
    budget: 0,
  };

  protected getServiceId(): string {
    return "report";
  }

  async start(): Promise<void> {
    this._status = "running";

    await this.beginRun();
    try {
      await this.runTask({
        label: "system-report",
        prompt: "Generate a comprehensive system status report summarizing all service activity, costs, and performance metrics.",
        maxTurns: 3,
      });
      await this.completeRun("completed");
    } catch (err) {
      await this.completeRun("errored");
      throw err;
    }

    this._status = "idle";
  }
}
