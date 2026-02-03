import { Service } from "../../shared/types/service.js";

export class ServiceRegistry {
  private services = new Map<string, Service>();

  register(service: Service): void {
    this.services.set(service.config.id, service);
  }

  unregister(serviceId: string): void {
    this.services.delete(serviceId);
  }

  get(serviceId: string): Service | undefined {
    return this.services.get(serviceId);
  }

  list(): Service[] {
    return Array.from(this.services.values());
  }

  has(serviceId: string): boolean {
    return this.services.has(serviceId);
  }
}
