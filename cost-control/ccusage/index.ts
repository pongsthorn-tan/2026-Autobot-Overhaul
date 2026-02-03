import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const CCUSAGE_PATH = process.env.CCUSAGE_PATH ?? "/opt/homebrew/bin/ccusage";

export interface CcusageSessionResult {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalCost: number;
}

export class CcusageClient {
  async getSessionCost(sessionId: string): Promise<CcusageSessionResult | null> {
    try {
      const { stdout } = await execFileAsync(CCUSAGE_PATH, [
        "session",
        "--json",
        "--id",
        sessionId,
      ]);
      const data = JSON.parse(stdout);
      const session = data.sessions?.[0];
      if (!session) return null;

      return {
        sessionId: session.sessionId ?? sessionId,
        inputTokens: session.inputTokens ?? 0,
        outputTokens: session.outputTokens ?? 0,
        cacheCreationTokens: session.cacheCreationTokens ?? 0,
        cacheReadTokens: session.cacheReadTokens ?? 0,
        totalCost: session.totalCost ?? 0,
      };
    } catch {
      return null;
    }
  }

  async getDailyCosts(projectName: string, since: string): Promise<unknown> {
    try {
      const { stdout } = await execFileAsync(CCUSAGE_PATH, [
        "daily",
        "--json",
        "--since",
        since,
        "--project",
        projectName,
      ]);
      return JSON.parse(stdout);
    } catch {
      return null;
    }
  }

  async getCurrentBlock(): Promise<unknown> {
    try {
      const { stdout } = await execFileAsync(CCUSAGE_PATH, [
        "blocks",
        "--json",
      ]);
      return JSON.parse(stdout);
    } catch {
      return null;
    }
  }
}
