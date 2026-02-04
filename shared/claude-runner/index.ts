import { spawn } from "child_process";
import { readdir, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const CLAUDE_SESSIONS_BASE = path.join(
  process.env.HOME ?? "/root",
  ".claude",
  "projects",
);

export interface ClaudeTaskParams {
  prompt: string;
  workingDir: string;
  maxTurns?: number;
  model?: string;
  onStdoutChunk?: (chunk: string) => void;
}

export interface ClaudeTaskResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  sessionId: string;
}

async function listJsonlFiles(dir: string): Promise<string[]> {
  try {
    const files = await readdir(dir);
    return files.filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    return [];
  }
}

function getProjectKey(workingDir: string): string {
  const absPath = path.resolve(workingDir);
  return absPath.replace(/\//g, "-");
}

export async function spawnClaudeTask(
  params: ClaudeTaskParams,
): Promise<ClaudeTaskResult> {
  if (!existsSync(params.workingDir)) {
    await mkdir(params.workingDir, { recursive: true });
  }

  const projectKey = getProjectKey(params.workingDir);
  const sessionDir = path.join(CLAUDE_SESSIONS_BASE, projectKey);

  const beforeFiles = await listJsonlFiles(sessionDir);

  const args = [
    "--print",
    "--dangerously-skip-permissions",
    "-p",
    params.prompt,
  ];

  if (params.model) {
    args.push("--model", params.model);
  }

  if (params.maxTurns) {
    args.push("--max-turns", String(params.maxTurns));
  }

  const child = spawn("claude", args, {
    cwd: params.workingDir,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stdout += text;
    if (params.onStdoutChunk) {
      params.onStdoutChunk(text);
    }
  });

  child.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on("close", (code) => resolve(code ?? 1));
    child.on("error", reject);
  });

  // Wait briefly for session file to flush
  await new Promise((r) => setTimeout(r, 500));

  const afterFiles = await listJsonlFiles(sessionDir);
  const newFiles = afterFiles.filter((f) => !beforeFiles.includes(f));
  const sessionUuid = newFiles.length > 0
    ? path.basename(newFiles[0], ".jsonl")
    : "";

  return {
    exitCode,
    stdout,
    stderr,
    sessionId: sessionUuid,
  };
}
