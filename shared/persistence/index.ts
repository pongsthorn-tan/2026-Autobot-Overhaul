import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname } from "path";

export class JsonStore<T> {
  constructor(
    private filePath: string,
    private defaultValue: T,
  ) {}

  async load(): Promise<T> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as T;
    } catch {
      return structuredClone(this.defaultValue);
    }
  }

  async save(data: T): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.filePath, JSON.stringify(data, null, 2) + "\n");
  }
}
