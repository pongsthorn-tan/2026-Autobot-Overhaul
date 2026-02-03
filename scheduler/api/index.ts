import { Schedule, ScheduledService, SchedulerState } from "../../shared/types/scheduler.js";
import { ServiceStatus } from "../../shared/types/service.js";
import { SchedulingEngine } from "../engine/index.js";
import { ServiceRegistry } from "../registry/index.js";

export class SchedulerAPI {
  constructor(
    private engine: SchedulingEngine,
    private registry: ServiceRegistry,
  ) {}

  async startService(serviceId: string): Promise<void> {
    await this.engine.executeService(serviceId);
  }

  async stopService(serviceId: string): Promise<void> {
    await this.engine.stopService(serviceId);
  }

  async pauseService(serviceId: string): Promise<void> {
    await this.engine.pauseService(serviceId);
  }

  async resumeService(serviceId: string): Promise<void> {
    await this.engine.resumeService(serviceId);
  }

  async getServiceStatus(serviceId: string): Promise<ServiceStatus> {
    const service = this.registry.get(serviceId);
    if (!service) throw new Error(`Service not found: ${serviceId}`);
    return service.status();
  }

  async listServices(): Promise<Array<{
    id: string;
    name: string;
    description: string;
    status: ServiceStatus;
    schedule: ScheduledService | undefined;
  }>> {
    const services = this.registry.list();
    const result = [];

    for (const service of services) {
      const status = await service.status();
      const scheduled = this.engine.getScheduledService(service.config.id);
      result.push({
        id: service.config.id,
        name: service.config.name,
        description: service.config.description,
        status,
        schedule: scheduled,
      });
    }

    return result;
  }

  async updateSchedule(serviceId: string, schedule: Schedule, maxCycles?: number): Promise<void> {
    await this.engine.scheduleService(serviceId, schedule, maxCycles);
  }

  async getState(): Promise<SchedulerState> {
    return this.engine.getState();
  }
}
