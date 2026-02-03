import { resolve } from "path";

export interface AppConfig {
  logLevel: string;
  logDir: string;
  webUi: {
    port: number;
    host: string;
  };
  costControl: {
    defaultBudget: number;
    alertThreshold: number;
  };
}

export function loadConfig(): AppConfig {
  return {
    logLevel: process.env.LOG_LEVEL ?? "info",
    logDir: process.env.LOG_DIR ?? resolve(process.cwd(), "logs"),
    webUi: {
      port: parseInt(process.env.WEB_UI_PORT ?? "3000", 10),
      host: process.env.WEB_UI_HOST ?? "localhost",
    },
    costControl: {
      defaultBudget: parseFloat(process.env.DEFAULT_SERVICE_BUDGET ?? "10.00"),
      alertThreshold: parseFloat(process.env.BUDGET_ALERT_THRESHOLD ?? "0.8"),
    },
  };
}
