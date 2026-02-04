/**
 * DigestStore — manages rolling digests for intel services.
 *
 * Instead of feeding all previous full reports into the next cycle
 * (which grows input tokens linearly), we maintain a compressed digest:
 * a structured list of items already tracked with one-line summaries.
 *
 * The digest stays roughly constant size because:
 *   - Each entry is a single summary line, not a full report
 *   - Old entries beyond a configurable window are pruned
 *   - The AI sees "what's been covered" without raw report text
 *
 * For research, we use ResearchState instead — same principle,
 * but tracks a todo list of sub-topics and their findings.
 */

import { JsonStore } from "../../shared/persistence/index.js";
import { Digest, DigestEntry, ResearchState, ResearchStep } from "./types.js";

const MAX_DIGEST_ENTRIES = 200;  // prune oldest beyond this

export class DigestStore {
  private store: JsonStore<Record<string, Digest>>;

  constructor(path = "data/intel-digests.json") {
    this.store = new JsonStore<Record<string, Digest>>(path, {});
  }

  async getDigest(topicKey: string): Promise<Digest | null> {
    const all = await this.store.load();
    return all[topicKey] ?? null;
  }

  async updateDigest(topicKey: string, newEntries: DigestEntry[], topic: string, style: Digest["style"]): Promise<Digest> {
    const all = await this.store.load();
    const existing = all[topicKey] ?? {
      topic,
      style,
      entries: [],
      lastUpdatedAt: new Date().toISOString(),
      cycleCount: 0,
    };

    // Merge new entries, dedup by id
    const existingIds = new Set(existing.entries.map((e) => e.id));
    for (const entry of newEntries) {
      if (!existingIds.has(entry.id)) {
        existing.entries.push(entry);
        existingIds.add(entry.id);
      }
    }

    // Prune oldest if over limit
    if (existing.entries.length > MAX_DIGEST_ENTRIES) {
      existing.entries = existing.entries.slice(-MAX_DIGEST_ENTRIES);
    }

    existing.lastUpdatedAt = new Date().toISOString();
    existing.cycleCount++;

    all[topicKey] = existing;
    await this.store.save(all);
    return existing;
  }

  async deleteDigest(topicKey: string): Promise<void> {
    const all = await this.store.load();
    delete all[topicKey];
    await this.store.save(all);
  }
}

export class ResearchStateStore {
  private store: JsonStore<Record<string, ResearchState>>;

  constructor(path = "data/intel-research-states.json") {
    this.store = new JsonStore<Record<string, ResearchState>>(path, {});
  }

  async getState(taskKey: string): Promise<ResearchState | null> {
    const all = await this.store.load();
    return all[taskKey] ?? null;
  }

  async saveState(taskKey: string, state: ResearchState): Promise<void> {
    const all = await this.store.load();
    all[taskKey] = state;
    await this.store.save(all);
  }

  async updateStep(taskKey: string, stepId: string, updates: Partial<ResearchStep>): Promise<void> {
    const all = await this.store.load();
    const state = all[taskKey];
    if (!state) return;

    const step = state.steps.find((s) => s.id === stepId);
    if (step) {
      Object.assign(step, updates);
    }
    await this.store.save(all);
  }

  async deleteState(taskKey: string): Promise<void> {
    const all = await this.store.load();
    delete all[taskKey];
    await this.store.save(all);
  }
}
