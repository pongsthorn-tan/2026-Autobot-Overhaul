import { ServiceStatus } from "./service.js";

export type ScheduleType = "once" | "interval" | "daily" | "weekly" | "cron";

export interface Schedule {
  type: ScheduleType;
  at?: string;
  intervalMs?: number;
  timeOfDay?: string;
  daysOfWeek?: number[];
  cron?: string;
}

export interface ScheduledService {
  serviceId: string;
  schedule: Schedule;
  status: ServiceStatus;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
}

export interface SchedulerState {
  services: ScheduledService[];
  isRunning: boolean;
}
