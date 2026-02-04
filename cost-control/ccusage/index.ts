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

const CCUSAGE_TIMEOUT_MS = 15_000;

export class CcusageClient {
  async getSessionCost(sessionId: string): Promise<CcusageSessionResult | null> {
    try {
      const { stdout } = await execFileAsync(CCUSAGE_PATH, [
        "session",
        "--json",
        "--id",
        sessionId,
      ], { timeout: CCUSAGE_TIMEOUT_MS });
      const data = JSON.parse(stdout);

      // --id returns a flat object: { sessionId, totalCost, totalTokens, entries[] }
      // Aggregate token counts from entries
      if (!data || !data.entries || data.entries.length === 0) return null;

      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationTokens = 0;
      let cacheReadTokens = 0;

      for (const entry of data.entries) {
        inputTokens += entry.inputTokens ?? 0;
        outputTokens += entry.outputTokens ?? 0;
        cacheCreationTokens += entry.cacheCreationTokens ?? 0;
        cacheReadTokens += entry.cacheReadTokens ?? 0;
      }

      return {
        sessionId: data.sessionId ?? sessionId,
        inputTokens,
        outputTokens,
        cacheCreationTokens,
        cacheReadTokens,
        totalCost: data.totalCost ?? 0,
      };
    } catch {
      return null;
    }
  }

}
