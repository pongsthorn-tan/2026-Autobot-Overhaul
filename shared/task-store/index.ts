import { StandaloneTask } from "../types/task.js";
import { JsonStore } from "../persistence/index.js";

export class TaskStore {
  private store = new JsonStore<StandaloneTask[]>("data/standalone-tasks.json", []);

  async getAll(): Promise<StandaloneTask[]> {
    return this.store.load();
  }

  async getById(taskId: string): Promise<StandaloneTask | undefined> {
    const tasks = await this.store.load();
    return tasks.find((t) => t.taskId === taskId);
  }

  async getByService(serviceType: string): Promise<StandaloneTask[]> {
    const tasks = await this.store.load();
    return tasks.filter((t) => t.serviceType === serviceType);
  }

  async create(task: StandaloneTask): Promise<void> {
    const tasks = await this.store.load();
    tasks.push(task);
    await this.store.save(tasks);
  }

  async update(taskId: string, updates: Partial<StandaloneTask>): Promise<void> {
    const tasks = await this.store.load();
    const idx = tasks.findIndex((t) => t.taskId === taskId);
    if (idx === -1) return;
    tasks[idx] = { ...tasks[idx], ...updates };
    await this.store.save(tasks);
  }

  async delete(taskId: string): Promise<void> {
    const tasks = await this.store.load();
    const filtered = tasks.filter((t) => t.taskId !== taskId);
    await this.store.save(filtered);
  }
}
