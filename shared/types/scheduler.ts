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

export interface ScheduleSlot {
  timeOfDay: string;    // "HH:MM"
  daysOfWeek: number[]; // 0=Sun..6=Sat
}

export type ScheduleConfig =
  | { type: "once" }
  | { type: "scheduled"; slots: ScheduleSlot[] }
  | { type: "interval"; intervalHours: number; maxCycles?: number };

export interface ScheduledService {
  serviceId: string;
  schedule: Schedule;
  status: ServiceStatus;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  maxCycles?: number;
  cyclesCompleted: number;
}

export interface ScheduledTask {
  taskId: string;
  schedule: Schedule;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
}

export interface SchedulerState {
  services: ScheduledService[];
  tasks: ScheduledTask[];
  isRunning: boolean;
}
