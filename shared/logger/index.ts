import { TaskLog } from "../types/service.js";
import { appendFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  taskLog(entry: Omit<TaskLog, "timestamp">): void;
}

interface LogEntry {
  level: LogLevel;
  serviceId: string;
  message: string;
  meta?: Record<string, unknown>;
  timestamp: string;
}

const LOG_DIR = resolve(process.cwd(), "logs");

function ensureLogDir(): void {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
}

function writeLine(filePath: string, data: unknown): void {
  appendFileSync(filePath, JSON.stringify(data) + "\n");
}

export function createLogger(serviceId: string): Logger {
  ensureLogDir();

  const serviceLogPath = resolve(LOG_DIR, `${serviceId}.jsonl`);
  const tasksLogPath = resolve(LOG_DIR, "tasks.jsonl");

  function log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      serviceId,
      message,
      meta,
      timestamp: new Date().toISOString(),
    };

    const line = JSON.stringify(entry);

    if (level === "error" || level === "warn") {
      process.stderr.write(`[${level.toUpperCase()}] [${serviceId}] ${message}\n`);
    } else {
      process.stdout.write(`[${level.toUpperCase()}] [${serviceId}] ${message}\n`);
    }

    writeLine(serviceLogPath, entry);
  }

  return {
    debug: (message, meta) => log("debug", message, meta),
    info: (message, meta) => log("info", message, meta),
    warn: (message, meta) => log("warn", message, meta),
    error: (message, meta) => log("error", message, meta),
    taskLog(entry) {
      const fullEntry = { ...entry, timestamp: new Date().toISOString() };
      writeLine(tasksLogPath, fullEntry);
      writeLine(serviceLogPath, {
        level: "info",
        serviceId,
        message: entry.message,
        meta: {
          taskId: entry.taskId,
          iteration: entry.iteration,
          tokensUsed: entry.tokensUsed,
          costEstimate: entry.costEstimate,
        },
        timestamp: fullEntry.timestamp,
      });
      process.stdout.write(
        `[TASK] [${serviceId}] ${entry.message} (tokens: ${entry.tokensUsed}, cost: $${entry.costEstimate.toFixed(4)})\n`
      );
    },
  };
}
