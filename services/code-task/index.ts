import { ServiceConfig } from "../../shared/types/service.js";
import { BaseService } from "../base-service.js";
import { JsonStore } from "../../shared/persistence/index.js";

interface CodeTask {
  description: string;
  targetPath: string;
  maxIterations: number;
}

export class CodeTaskService extends BaseService {
  readonly config: ServiceConfig = {
    id: "code-task",
    name: "Code Task",
    description: "Executes AI-driven coding tasks including code generation, review, refactoring, and bug fixes.",
    budget: 0,
  };

  private tasksStore = new JsonStore<CodeTask[]>("data/code-tasks.json", []);

  protected getServiceId(): string {
    return "code-task";
  }

  async start(): Promise<void> {
    this._status = "running";
    const tasks = await this.tasksStore.load();

    if (tasks.length === 0) {
      this.logger.info("No code tasks queued");
      this._status = "idle";
      return;
    }

    await this.beginRun();
    try {
      for (const task of tasks) {
        if (this._status !== "running") break;

        await this.runTask({
          label: task.description,
          prompt: `Execute the following coding task:\n\n${task.description}\n\nTarget path: ${task.targetPath}`,
          maxTurns: task.maxIterations,
        });
      }
      await this.completeRun("completed");
    } catch (err) {
      await this.completeRun("errored");
      throw err;
    }

    this._status = "idle";
  }

  async addTask(task: CodeTask): Promise<void> {
    const tasks = await this.tasksStore.load();
    tasks.push(task);
    await this.tasksStore.save(tasks);
  }

  async getTasks(): Promise<CodeTask[]> {
    return this.tasksStore.load();
  }

  async clearTasks(): Promise<void> {
    await this.tasksStore.save([]);
  }
}
