import cron from "node-cron";
import { Schedule, ScheduledService, ScheduledTask, SchedulerState } from "../../shared/types/scheduler.js";
import { ServiceStatus } from "../../shared/types/service.js";
import { MessageBus } from "../../shared/messaging/index.js";
import { CostControlAPI } from "../../cost-control/api/index.js";
import { ServiceRegistry } from "../registry/index.js";
import { JsonStore } from "../../shared/persistence/index.js";
import { createLogger } from "../../shared/logger/index.js";

let CronExpressionParser: { parse: (expr: string, opts?: { currentDate?: Date }) => { next: () => { toDate: () => Date } } } | null = null;
try {
  const cronParser = await import("cron-parser");
  CronExpressionParser = cronParser.CronExpressionParser;
} catch {
  // cron-parser not installed, next-runs for cron schedules won't work
}

const logger = createLogger("scheduler");

export class SchedulingEngine {
  private schedules = new Map<string, ScheduledService>();
  private scheduledTasks = new Map<string, ScheduledTask>();
  private timers = new Map<string, cron.ScheduledTask | ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>>();
  private store: JsonStore<SchedulerState>;

  constructor(
    private registry: ServiceRegistry,
    private bus: MessageBus,
    private costControlAPI: CostControlAPI,
    dataDir = "data",
  ) {
    this.store = new JsonStore<SchedulerState>(
      `${dataDir}/scheduler-state.json`,
      { services: [], tasks: [], isRunning: false },
    );
  }

  async loadState(): Promise<void> {
    const state = await this.store.load();
    for (const scheduled of state.services) {
      // Ensure cyclesCompleted exists for older persisted data
      if (scheduled.cyclesCompleted === undefined) {
        scheduled.cyclesCompleted = 0;
      }
      this.schedules.set(scheduled.serviceId, scheduled);
      if (scheduled.enabled) {
        await this.startSchedule(scheduled.serviceId, scheduled.schedule);
      }
    }
    logger.info("Scheduler state loaded", { serviceCount: state.services.length });
  }

  async scheduleService(serviceId: string, schedule: Schedule, maxCycles?: number): Promise<void> {
    if (!this.registry.has(serviceId)) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    await this.unscheduleService(serviceId);

    const scheduled: ScheduledService = {
      serviceId,
      schedule,
      status: "idle",
      enabled: true,
      lastRun: null,
      nextRun: null,
      maxCycles,
      cyclesCompleted: 0,
    };

    this.schedules.set(serviceId, scheduled);
    await this.startSchedule(serviceId, schedule);
    await this.persistState();
  }

  private async startSchedule(serviceId: string, schedule: Schedule): Promise<void> {
    switch (schedule.type) {
      case "once": {
        if (!schedule.at) break;
        const delay = new Date(schedule.at).getTime() - Date.now();
        if (delay > 0) {
          const timer = setTimeout(() => this.executeService(serviceId), delay);
          this.timers.set(serviceId, timer);
        }
        break;
      }
      case "interval": {
        if (!schedule.intervalMs) break;
        const timer = setInterval(() => this.executeService(serviceId), schedule.intervalMs);
        this.timers.set(serviceId, timer);
        break;
      }
      case "daily": {
        if (!schedule.timeOfDay) break;
        const [hour, minute] = schedule.timeOfDay.split(":").map(Number);
        const cronExpr = `${minute} ${hour} * * *`;
        const task = cron.schedule(cronExpr, () => this.executeService(serviceId));
        this.timers.set(serviceId, task);
        break;
      }
      case "weekly": {
        if (!schedule.timeOfDay || !schedule.daysOfWeek) break;
        const [hour, minute] = schedule.timeOfDay.split(":").map(Number);
        const days = schedule.daysOfWeek.join(",");
        const cronExpr = `${minute} ${hour} * * ${days}`;
        const task = cron.schedule(cronExpr, () => this.executeService(serviceId));
        this.timers.set(serviceId, task);
        break;
      }
      case "cron": {
        if (!schedule.cron) break;
        const task = cron.schedule(schedule.cron, () => this.executeService(serviceId));
        this.timers.set(serviceId, task);
        break;
      }
    }
  }

  scheduleCallback(key: string, schedule: Schedule, callback: () => Promise<void>): void {
    // Unschedule any existing timer with this key
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      if (typeof existingTimer === "object" && "stop" in existingTimer) {
        (existingTimer as cron.ScheduledTask).stop();
      } else {
        clearInterval(existingTimer as ReturnType<typeof setInterval>);
        clearTimeout(existingTimer as ReturnType<typeof setTimeout>);
      }
      this.timers.delete(key);
    }

    const wrappedCallback = () => {
      const scheduledTask = this.scheduledTasks.get(key);
      if (scheduledTask) {
        scheduledTask.lastRun = new Date().toISOString();
      }
      callback().catch((err) => {
        logger.error(`Scheduled callback failed for ${key}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      this.persistState();
    };

    switch (schedule.type) {
      case "once": {
        if (!schedule.at) break;
        const delay = new Date(schedule.at).getTime() - Date.now();
        if (delay > 0) {
          const timer = setTimeout(wrappedCallback, delay);
          this.timers.set(key, timer);
        }
        break;
      }
      case "interval": {
        if (!schedule.intervalMs) break;
        const timer = setInterval(wrappedCallback, schedule.intervalMs);
        this.timers.set(key, timer);
        break;
      }
      case "daily": {
        if (!schedule.timeOfDay) break;
        const [hour, minute] = schedule.timeOfDay.split(":").map(Number);
        const cronExpr = `${minute} ${hour} * * *`;
        const task = cron.schedule(cronExpr, wrappedCallback);
        this.timers.set(key, task);
        break;
      }
      case "weekly": {
        if (!schedule.timeOfDay || !schedule.daysOfWeek) break;
        const [hour, minute] = schedule.timeOfDay.split(":").map(Number);
        const days = schedule.daysOfWeek.join(",");
        const cronExpr = `${minute} ${hour} * * ${days}`;
        const task = cron.schedule(cronExpr, wrappedCallback);
        this.timers.set(key, task);
        break;
      }
      case "cron": {
        if (!schedule.cron) break;
        const task = cron.schedule(schedule.cron, wrappedCallback);
        this.timers.set(key, task);
        break;
      }
    }

    // Track the scheduled task
    this.scheduledTasks.set(key, {
      taskId: key,
      schedule,
      enabled: true,
      lastRun: null,
      nextRun: null,
    });

    this.persistState();
  }

  unscheduleCallback(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      if (typeof timer === "object" && "stop" in timer) {
        (timer as cron.ScheduledTask).stop();
      } else {
        clearInterval(timer as ReturnType<typeof setInterval>);
        clearTimeout(timer as ReturnType<typeof setTimeout>);
      }
      this.timers.delete(key);
    }
    this.scheduledTasks.delete(key);
    this.persistState();
  }

  async executeService(serviceId: string): Promise<void> {
    const service = this.registry.get(serviceId);
    if (!service) {
      logger.error(`Service not found for execution: ${serviceId}`);
      return;
    }

    const scheduled = this.schedules.get(serviceId);
    if (scheduled && !scheduled.enabled) {
      logger.info(`Service ${serviceId} is disabled, skipping`);
      return;
    }

    // Check cycle limit before executing
    if (scheduled?.maxCycles && scheduled.cyclesCompleted >= scheduled.maxCycles) {
      logger.info(`Service ${serviceId} has reached max cycles (${scheduled.maxCycles}), auto-stopping`);
      await this.stopService(serviceId);
      return;
    }

    const { allowed } = await this.costControlAPI.checkBudget(serviceId);
    if (!allowed) {
      logger.warn(`Budget exhausted for ${serviceId}, skipping execution`);
      await this.bus.publish({
        type: "budget.exhausted",
        serviceId,
        payload: {},
        timestamp: new Date(),
      });
      return;
    }

    try {
      if (scheduled) {
        scheduled.status = "running";
        scheduled.lastRun = new Date().toISOString();
      }

      await this.bus.publish({
        type: "service.started",
        serviceId,
        payload: {},
        timestamp: new Date(),
      });

      logger.info(`Executing service: ${serviceId}`);
      await service.start();

      if (scheduled) {
        scheduled.status = "idle";
        scheduled.cyclesCompleted++;

        // Check if cycle limit reached after execution
        if (scheduled.maxCycles && scheduled.cyclesCompleted >= scheduled.maxCycles) {
          logger.info(`Service ${serviceId} completed max cycles (${scheduled.maxCycles}), auto-stopping`);
          await this.stopService(serviceId);
          return;
        }
      }

      logger.info(`Service completed: ${serviceId}`);
    } catch (err) {
      logger.error(`Service execution failed: ${serviceId}`, {
        error: err instanceof Error ? err.message : String(err),
      });

      if (scheduled) {
        scheduled.status = "errored";
      }

      await this.bus.publish({
        type: "service.errored",
        serviceId,
        payload: { error: err instanceof Error ? err.message : String(err) },
        timestamp: new Date(),
      });
    }

    await this.persistState();
  }

  async unscheduleService(serviceId: string): Promise<void> {
    const timer = this.timers.get(serviceId);
    if (timer) {
      if (typeof timer === "object" && "stop" in timer) {
        (timer as cron.ScheduledTask).stop();
      } else {
        clearInterval(timer as ReturnType<typeof setInterval>);
        clearTimeout(timer as ReturnType<typeof setTimeout>);
      }
      this.timers.delete(serviceId);
    }
    this.schedules.delete(serviceId);
    await this.persistState();
  }

  async pauseService(serviceId: string): Promise<void> {
    const scheduled = this.schedules.get(serviceId);
    if (scheduled) {
      scheduled.enabled = false;
      scheduled.status = "paused";
    }

    const service = this.registry.get(serviceId);
    if (service) {
      await service.pause();
    }

    const timer = this.timers.get(serviceId);
    if (timer && typeof timer === "object" && "stop" in timer) {
      (timer as cron.ScheduledTask).stop();
    }

    await this.bus.publish({
      type: "service.paused",
      serviceId,
      payload: {},
      timestamp: new Date(),
    });

    await this.persistState();
  }

  async resumeService(serviceId: string): Promise<void> {
    const scheduled = this.schedules.get(serviceId);
    if (scheduled) {
      scheduled.enabled = true;
      scheduled.status = "idle";
      await this.startSchedule(serviceId, scheduled.schedule);
    }

    const service = this.registry.get(serviceId);
    if (service) {
      await service.resume();
    }

    await this.persistState();
  }

  async stopService(serviceId: string): Promise<void> {
    const service = this.registry.get(serviceId);
    if (service) {
      await service.stop();
    }

    const scheduled = this.schedules.get(serviceId);
    if (scheduled) {
      scheduled.status = "stopped";
      scheduled.enabled = false;
    }

    const timer = this.timers.get(serviceId);
    if (timer) {
      if (typeof timer === "object" && "stop" in timer) {
        (timer as cron.ScheduledTask).stop();
      } else {
        clearInterval(timer as ReturnType<typeof setInterval>);
        clearTimeout(timer as ReturnType<typeof setTimeout>);
      }
      this.timers.delete(serviceId);
    }

    await this.bus.publish({
      type: "service.stopped",
      serviceId,
      payload: {},
      timestamp: new Date(),
    });

    await this.persistState();
  }

  getNextExecutionTimes(serviceId: string, count: number): string[] {
    const scheduled = this.schedules.get(serviceId);
    if (!scheduled || !scheduled.enabled) return [];

    const schedule = scheduled.schedule;
    const times: string[] = [];
    const now = new Date();

    switch (schedule.type) {
      case "interval": {
        if (!schedule.intervalMs) break;
        let next = new Date(now.getTime() + schedule.intervalMs);
        for (let i = 0; i < count; i++) {
          times.push(next.toISOString());
          next = new Date(next.getTime() + schedule.intervalMs);
        }
        break;
      }
      case "daily": {
        if (!schedule.timeOfDay) break;
        const [hour, minute] = schedule.timeOfDay.split(":").map(Number);
        const candidate = new Date(now);
        candidate.setHours(hour, minute, 0, 0);
        if (candidate <= now) {
          candidate.setDate(candidate.getDate() + 1);
        }
        for (let i = 0; i < count; i++) {
          times.push(candidate.toISOString());
          candidate.setDate(candidate.getDate() + 1);
        }
        break;
      }
      case "weekly": {
        if (!schedule.timeOfDay || !schedule.daysOfWeek || schedule.daysOfWeek.length === 0) break;
        const [hour, minute] = schedule.timeOfDay.split(":").map(Number);
        const sortedDays = [...schedule.daysOfWeek].sort((a, b) => a - b);
        const candidate = new Date(now);
        candidate.setHours(hour, minute, 0, 0);

        while (times.length < count) {
          const dayOfWeek = candidate.getDay();
          if (sortedDays.includes(dayOfWeek) && candidate > now) {
            times.push(candidate.toISOString());
          }
          candidate.setDate(candidate.getDate() + 1);
        }
        break;
      }
      case "cron": {
        if (!schedule.cron || !CronExpressionParser) break;
        try {
          const interval = CronExpressionParser.parse(schedule.cron, { currentDate: now });
          for (let i = 0; i < count; i++) {
            try {
              const next = interval.next();
              times.push(next.toDate().toISOString());
            } catch {
              break;
            }
          }
        } catch {
          // Invalid cron expression, skip
        }
        break;
      }
    }

    return times;
  }

  getState(): SchedulerState {
    return {
      services: Array.from(this.schedules.values()),
      tasks: Array.from(this.scheduledTasks.values()),
      isRunning: true,
    };
  }

  getScheduledService(serviceId: string): ScheduledService | undefined {
    return this.schedules.get(serviceId);
  }

  private async persistState(): Promise<void> {
    await this.store.save(this.getState());
  }
}

