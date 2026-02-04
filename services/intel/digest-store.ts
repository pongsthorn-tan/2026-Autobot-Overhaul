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
import { Digest, DigestEntry, ResearchState, ResearchStep, TrackerTree, TrackerBranch, TopicPreset } from "./types.js";

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

// ── TrackerTreeStore — persists topic tracker tree structures ──────

function toKebab(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
}

function findBranch(branches: TrackerBranch[], branchId: string): TrackerBranch | null {
  for (const b of branches) {
    if (b.id === branchId) return b;
    const found = findBranch(b.children, branchId);
    if (found) return found;
  }
  return null;
}

function findParentBranches(branches: TrackerBranch[], branchId: string): TrackerBranch[] | null {
  for (let i = 0; i < branches.length; i++) {
    if (branches[i].id === branchId) return branches;
    const found = findParentBranches(branches[i].children, branchId);
    if (found) return found;
  }
  return null;
}

/** Collect all active leaf-to-root paths for execution. */
function collectActiveBranches(branches: TrackerBranch[], parentPath: string[]): { branch: TrackerBranch; path: string[] }[] {
  const result: { branch: TrackerBranch; path: string[] }[] = [];
  for (const b of branches) {
    if (b.status !== "active") continue;
    const currentPath = [...parentPath, b.id];
    if (b.children.length === 0) {
      // Leaf branch — track it
      result.push({ branch: b, path: currentPath });
    } else {
      // Has children — recurse into them
      result.push(...collectActiveBranches(b.children, currentPath));
    }
  }
  return result;
}

export class TrackerTreeStore {
  private store: JsonStore<Record<string, TrackerTree>>;

  constructor(path = "data/tracker-trees.json") {
    this.store = new JsonStore<Record<string, TrackerTree>>(path, {});
  }

  async getTree(treeId: string): Promise<TrackerTree | null> {
    const all = await this.store.load();
    return all[treeId] ?? null;
  }

  async getAllTrees(): Promise<TrackerTree[]> {
    const all = await this.store.load();
    return Object.values(all);
  }

  async createTree(topic: string, preset: TopicPreset): Promise<TrackerTree> {
    const all = await this.store.load();
    const id = toKebab(topic);

    if (all[id]) return all[id]; // already exists

    const tree: TrackerTree = {
      id,
      topic,
      preset,
      branches: [],
      createdAt: new Date().toISOString(),
      lastCycleAt: null,
      totalCycles: 0,
    };

    all[id] = tree;
    await this.store.save(all);
    return tree;
  }

  async addBranch(
    treeId: string,
    label: string,
    description: string,
    parentBranchId?: string,
  ): Promise<TrackerBranch | null> {
    const all = await this.store.load();
    const tree = all[treeId];
    if (!tree) return null;

    const branch: TrackerBranch = {
      id: toKebab(label),
      label,
      description,
      status: "active",
      createdAt: new Date().toISOString(),
      lastCycleAt: null,
      lastCycleHadFindings: false,
      totalCycles: 0,
      children: [],
    };

    if (parentBranchId) {
      const parent = findBranch(tree.branches, parentBranchId);
      if (!parent) return null;
      parent.children.push(branch);
    } else {
      tree.branches.push(branch);
    }

    await this.store.save(all);
    return branch;
  }

  async removeBranch(treeId: string, branchId: string): Promise<boolean> {
    const all = await this.store.load();
    const tree = all[treeId];
    if (!tree) return false;

    const parent = findParentBranches(tree.branches, branchId);
    if (!parent) return false;

    const idx = parent.findIndex((b) => b.id === branchId);
    if (idx === -1) return false;

    parent.splice(idx, 1);
    await this.store.save(all);
    return true;
  }

  async updateBranchStatus(treeId: string, branchId: string, status: TrackerBranch["status"]): Promise<boolean> {
    const all = await this.store.load();
    const tree = all[treeId];
    if (!tree) return false;

    const branch = findBranch(tree.branches, branchId);
    if (!branch) return false;

    branch.status = status;
    await this.store.save(all);
    return true;
  }

  async recordBranchCycle(treeId: string, branchId: string, hadFindings: boolean): Promise<void> {
    const all = await this.store.load();
    const tree = all[treeId];
    if (!tree) return;

    const branch = findBranch(tree.branches, branchId);
    if (!branch) return;

    branch.lastCycleAt = new Date().toISOString();
    branch.lastCycleHadFindings = hadFindings;
    branch.totalCycles++;

    await this.store.save(all);
  }

  async recordTreeCycle(treeId: string): Promise<void> {
    const all = await this.store.load();
    const tree = all[treeId];
    if (!tree) return;

    tree.lastCycleAt = new Date().toISOString();
    tree.totalCycles++;
    await this.store.save(all);
  }

  async deleteTree(treeId: string): Promise<void> {
    const all = await this.store.load();
    delete all[treeId];
    await this.store.save(all);
  }

  /** Get all active leaf branches with their full path for execution. */
  getActiveBranches(tree: TrackerTree): { branch: TrackerBranch; path: string[] }[] {
    return collectActiveBranches(tree.branches, []);
  }
}
