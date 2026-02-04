/**
 * TopicTrackerIntelService — recurring topic monitoring with branching tree structure.
 *
 * Topics are organized as trees:
 *   Root topic (e.g., "Trade War")
 *   ├── Branch: China — tariffs, tech restrictions, negotiations
 *   ├── Branch: India — trade agreements, manufacturing shifts
 *   ├── Branch: Europe — EU trade policy, auto tariffs
 *   └── Branch: Asia Pacific — ASEAN, Japan, Korea supply chains
 *
 * Per cycle, each active leaf branch is tracked independently:
 *   - Each branch has its own rolling digest for dedup
 *   - If a branch has nothing new, it reports "nothing new this cycle"
 *   - Branch prompts are scoped to their specific dimension
 *
 * Flat topics (no branches) still work — they're treated as a single-branch tree.
 *
 * Token optimization: each branch only receives its own digest, not other branches'
 * data. Branches are independent tracking units.
 */

import { ServiceConfig, ClaudeModel } from "../../shared/types/service.js";
import { TaskParams, TopicTrackerTaskParams, TopicPreset } from "../../shared/types/task.js";
import { BaseService, StandaloneContext } from "../base-service.js";
import { DigestStore, TrackerTreeStore } from "./digest-store.js";
import { DigestEntry, TrackerTree, TrackerBranch } from "./types.js";
import { buildTopicTrackerPrompt, buildBranchTrackerPrompt } from "./prompt-builder.js";

export class TopicTrackerIntelService extends BaseService {
  readonly config: ServiceConfig = {
    id: "topic-tracker",
    name: "Topic Tracker",
    description: "Monitors topics over time using a branching tree structure. Each dimension is tracked independently with its own rolling digest.",
    budget: 0,
  };

  private treeStore = new TrackerTreeStore();
  private digestStore = new DigestStore();

  protected getServiceId(): string {
    return "topic-tracker";
  }

  // ── Service lifecycle ────────────────────────────────────────────

  async start(): Promise<void> {
    this._status = "running";
    const trees = await this.treeStore.getAllTrees();

    if (trees.length === 0) {
      this.logger.info("No topic trees being tracked");
      this._status = "idle";
      return;
    }

    await this.beginRun();
    try {
      for (const tree of trees) {
        if (this._status !== "running") break;
        await this.trackTree(tree);
      }
      await this.completeRun("completed");
    } catch (err) {
      await this.completeRun("errored");
      throw err;
    }

    this._status = "idle";
  }

  // ── Tree and branch management (exposed for API) ─────────────────

  async createTree(topic: string, preset: TopicPreset): Promise<TrackerTree> {
    return this.treeStore.createTree(topic, preset);
  }

  async getTree(treeId: string): Promise<TrackerTree | null> {
    return this.treeStore.getTree(treeId);
  }

  async getTrees(): Promise<TrackerTree[]> {
    return this.treeStore.getAllTrees();
  }

  async deleteTree(treeId: string): Promise<void> {
    // Clean up all branch digests
    const tree = await this.treeStore.getTree(treeId);
    if (tree) {
      const activeBranches = this.treeStore.getActiveBranches(tree);
      for (const { path } of activeBranches) {
        await this.digestStore.deleteDigest(this.branchDigestKey(treeId, path));
      }
    }
    await this.treeStore.deleteTree(treeId);
  }

  async addBranch(treeId: string, label: string, description: string, parentBranchId?: string): Promise<TrackerBranch | null> {
    return this.treeStore.addBranch(treeId, label, description, parentBranchId);
  }

  async removeBranch(treeId: string, branchId: string): Promise<boolean> {
    return this.treeStore.removeBranch(treeId, branchId);
  }

  async updateBranchStatus(treeId: string, branchId: string, status: TrackerBranch["status"]): Promise<boolean> {
    return this.treeStore.updateBranchStatus(treeId, branchId, status);
  }

  // Backward compat: flat topic list maps to single-branch trees
  async addTopic(topic: string): Promise<void> {
    await this.treeStore.createTree(topic, "custom");
  }

  async getTopics(): Promise<string[]> {
    const trees = await this.treeStore.getAllTrees();
    return trees.map((t) => t.topic);
  }

  async clearTopics(): Promise<void> {
    const trees = await this.treeStore.getAllTrees();
    for (const tree of trees) {
      await this.deleteTree(tree.id);
    }
  }

  // ── Standalone execution ─────────────────────────────────────────

  protected async executeStandalone(params: TaskParams, ctx: StandaloneContext): Promise<void> {
    const p = params as TopicTrackerTaskParams;
    const preset = p.preset ?? "custom";

    // Create tree if it doesn't exist
    const tree = await this.treeStore.createTree(p.topic, preset);
    await this.trackTree(tree, {
      modelOverride: ctx.model,
      serviceIdOverride: ctx.budgetKey,
    });
  }

  // ── Core tracking logic ──────────────────────────────────────────

  private branchDigestKey(treeId: string, branchPath: string[]): string {
    return `tree:${treeId}:${branchPath.join("/")}`;
  }

  private async trackTree(
    tree: TrackerTree,
    opts?: { modelOverride?: ClaudeModel; serviceIdOverride?: string },
  ): Promise<void> {
    const activeBranches = this.treeStore.getActiveBranches(tree);

    if (activeBranches.length === 0) {
      // No branches — track root topic as flat (backward compat)
      this.logger.info(`Tracking flat topic: ${tree.topic}`);
      await this.trackFlat(tree, opts);
    } else {
      // Track each branch independently
      this.logger.info(`Tracking tree: ${tree.topic} (${activeBranches.length} active branches)`);
      for (const { branch, path } of activeBranches) {
        if (this._status !== "running" && this._status !== "idle") break;
        await this.trackBranch(tree, branch, path, opts);
      }
    }

    await this.treeStore.recordTreeCycle(tree.id);
  }

  /** Track a single branch within a tree. */
  private async trackBranch(
    tree: TrackerTree,
    branch: TrackerBranch,
    branchPath: string[],
    opts?: { modelOverride?: ClaudeModel; serviceIdOverride?: string },
  ): Promise<void> {
    const digestKey = this.branchDigestKey(tree.id, branchPath);
    const digest = await this.digestStore.getDigest(digestKey);

    const prompt = buildBranchTrackerPrompt(
      tree.topic,
      branch.label,
      branch.description,
      branchPath,
      tree.preset,
      digest,
    );

    this.logger.info(`Tracking branch: ${tree.topic} → ${branchPath.join(" → ")}`, {
      branchId: branch.id,
      digestEntries: digest?.entries.length ?? 0,
      cycleNumber: branch.totalCycles + 1,
    });

    const result = await this.runTask({
      label: `track: ${tree.topic} / ${branch.label}`,
      prompt,
      maxTurns: 15,
      modelOverride: opts?.modelOverride,
      serviceIdOverride: opts?.serviceIdOverride,
    });

    // Extract digest and update
    const newEntries = this.parseDigestOutput(result.output);
    const hadFindings = newEntries.length > 0;

    await this.digestStore.updateDigest(digestKey, newEntries, `${tree.topic} / ${branch.label}`, "topic-tracker");
    await this.treeStore.recordBranchCycle(tree.id, branch.id, hadFindings);

    this.logger.info(`Branch cycle complete: ${branch.label}`, {
      hadFindings,
      newEntries: newEntries.length,
    });
  }

  /** Track a flat topic with no branches (backward compat). */
  private async trackFlat(
    tree: TrackerTree,
    opts?: { modelOverride?: ClaudeModel; serviceIdOverride?: string },
  ): Promise<void> {
    const digestKey = `flat:${tree.id}`;
    const digest = await this.digestStore.getDigest(digestKey);

    const prompt = buildTopicTrackerPrompt(tree.topic, tree.preset, digest);

    const result = await this.runTask({
      label: `track: ${tree.topic}`,
      prompt,
      maxTurns: 15,
      modelOverride: opts?.modelOverride,
      serviceIdOverride: opts?.serviceIdOverride,
    });

    const newEntries = this.parseDigestOutput(result.output);
    await this.digestStore.updateDigest(digestKey, newEntries, tree.topic, "topic-tracker");
  }

  // ── Output parsing ───────────────────────────────────────────────

  private parseDigestOutput(output: string): DigestEntry[] {
    try {
      const digestMatch = output.match(/DIGEST:\s*(\{[\s\S]*?\})\s*$/m);
      if (digestMatch) {
        const parsed = JSON.parse(digestMatch[1]);
        if (Array.isArray(parsed.entries)) {
          return parsed.entries.map((e: { id?: string; summary?: string }) => ({
            id: e.id || `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            summary: e.summary || "Unknown item",
            trackedAt: new Date().toISOString(),
          }));
        }
      }
    } catch {
      // Fall through
    }

    // Fallback: extract key findings from structured JSON output
    try {
      const jsonMatch = output.match(/\{[\s\S]*"sections"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const entries: DigestEntry[] = [];
        for (const section of parsed.sections || []) {
          if (section.type === "key-findings" && Array.isArray(section.items)) {
            for (const item of section.items) {
              entries.push({
                id: `kf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                summary: typeof item === "string" ? item : String(item),
                trackedAt: new Date().toISOString(),
              });
            }
          }
        }
        return entries;
      }
    } catch {
      // Fall through
    }

    return [];
  }
}
