/**
 * ResearchIntelService — adaptive multi-step research with evolving plan.
 *
 * Flow:
 *   1. User provides a topic
 *   2. Planner LLM breaks it into sub-topic todo list (ResearchState)
 *   3. For each sub-topic: research it, record compressed findings
 *   4. Adapt the plan between steps based on what's discovered
 *   5. Final synthesis combines all findings into one report
 *
 * Token optimization: each step only receives a compressed summary of
 * previous findings (ResearchState.overallFindings), not raw outputs.
 */

import { ServiceConfig, ClaudeModel } from "../../shared/types/service.js";
import { TaskParams, ResearchTaskParams } from "../../shared/types/task.js";
import { BaseService, StandaloneContext } from "../base-service.js";
import { JsonStore } from "../../shared/persistence/index.js";
import { ResearchStateStore } from "./digest-store.js";
import { ResearchState, ResearchStep } from "./types.js";
import {
  buildResearchPlanPrompt,
  buildResearchStepPrompt,
  buildResearchSynthesisPrompt,
} from "./prompt-builder.js";

export class ResearchIntelService extends BaseService {
  readonly config: ServiceConfig = {
    id: "research",
    name: "Research",
    description: "Deep research with adaptive sub-topic planning. Breaks topics into steps, researches each, adapts plan based on findings.",
    budget: 0,
  };

  private topicsStore = new JsonStore<string[]>("data/research-topics.json", []);
  private stateStore = new ResearchStateStore();

  protected getServiceId(): string {
    return "research";
  }

  async start(): Promise<void> {
    this._status = "running";
    const topics = await this.topicsStore.load();

    if (topics.length === 0) {
      this.logger.info("No research topics queued");
      this._status = "idle";
      return;
    }

    await this.beginRun();
    try {
      for (const topic of topics) {
        if (this._status !== "running") break;
        await this.researchTopic(topic);
      }
      await this.completeRun("completed");
    } catch (err) {
      await this.completeRun("errored");
      throw err;
    }

    this._status = "idle";
  }

  async addTopic(topic: string): Promise<void> {
    const topics = await this.topicsStore.load();
    topics.push(topic);
    await this.topicsStore.save(topics);
    this.logger.info(`Added research topic: ${topic}`);
  }

  async getTopics(): Promise<string[]> {
    return this.topicsStore.load();
  }

  async clearTopics(): Promise<void> {
    await this.topicsStore.save([]);
  }

  protected async executeStandalone(params: TaskParams, ctx: StandaloneContext): Promise<void> {
    const p = params as ResearchTaskParams;
    await this.researchTopic(p.topic, {
      modelOverride: ctx.model,
      serviceIdOverride: ctx.budgetKey,
      maxSteps: p.maxSteps,
    });
  }

  private async researchTopic(
    topic: string,
    opts?: { modelOverride?: ClaudeModel; serviceIdOverride?: string; maxSteps?: number },
  ): Promise<void> {
    const taskKey = `research:${topic.toLowerCase().replace(/\s+/g, "-").slice(0, 50)}`;

    // Step 1: Create research plan
    this.logger.info(`Planning research: ${topic}`);
    const planResult = await this.runTask({
      label: `plan: ${topic}`,
      prompt: buildResearchPlanPrompt(topic),
      maxTurns: 3,
      modelOverride: opts?.modelOverride,
      serviceIdOverride: opts?.serviceIdOverride,
    });

    const state = this.parsePlanOutput(topic, planResult.output);
    if (opts?.maxSteps && state.steps.length > opts.maxSteps) {
      state.steps = state.steps.slice(0, opts.maxSteps);
    }
    await this.stateStore.saveState(taskKey, state);

    // Step 2: Execute each sub-topic
    for (const step of state.steps) {
      if (this._status !== "running" && this._status !== "idle") break;
      if (step.status === "completed") continue;

      this.logger.info(`Researching step: ${step.subTopic}`);
      step.status = "completed"; // Mark before running to avoid re-runs on crash

      const currentState = (await this.stateStore.getState(taskKey)) ?? state;

      const stepResult = await this.runTask({
        label: `research: ${step.subTopic}`,
        prompt: buildResearchStepPrompt(topic, step, currentState),
        maxTurns: 5,
        modelOverride: opts?.modelOverride,
        serviceIdOverride: opts?.serviceIdOverride,
      });

      // Parse findings and update state
      this.parseStepFindings(stepResult.output, state, step.id);
      await this.stateStore.saveState(taskKey, state);
    }

    // Step 3: Final synthesis
    this.logger.info(`Synthesizing research: ${topic}`);
    const finalState = (await this.stateStore.getState(taskKey)) ?? state;
    await this.runTask({
      label: `synthesis: ${topic}`,
      prompt: buildResearchSynthesisPrompt(topic, finalState),
      maxTurns: 5,
      modelOverride: opts?.modelOverride,
      serviceIdOverride: opts?.serviceIdOverride,
    });

    // Clean up state after successful completion
    await this.stateStore.deleteState(taskKey);
  }

  private parsePlanOutput(topic: string, output: string): ResearchState {
    try {
      // Try to find JSON in the output
      const jsonMatch = output.match(/\{[\s\S]*"steps"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          topic,
          steps: (parsed.steps || []).map((s: { id?: string; subTopic?: string }, i: number) => ({
            id: s.id || `step-${i + 1}`,
            subTopic: s.subTopic || `Sub-topic ${i + 1}`,
            status: "pending" as const,
          })),
          overallFindings: "",
          iterationsCompleted: 0,
        };
      }
    } catch {
      // Fall through to default
    }

    // Fallback: single-step research
    return {
      topic,
      steps: [
        { id: "step-1", subTopic: topic, status: "pending" },
      ],
      overallFindings: "",
      iterationsCompleted: 0,
    };
  }

  private parseStepFindings(output: string, state: ResearchState, stepId: string): void {
    try {
      const findingsMatch = output.match(/FINDINGS:\s*(\{[\s\S]*?\})\s*$/m);
      if (findingsMatch) {
        const parsed = JSON.parse(findingsMatch[1]);
        const step = state.steps.find((s) => s.id === stepId);
        if (step) {
          step.findings = parsed.findings || "";
        }
        if (parsed.overallUpdate) {
          state.overallFindings = parsed.overallUpdate;
        }
        state.iterationsCompleted++;
        return;
      }
    } catch {
      // Fall through
    }

    // Fallback: extract a summary from the structured output
    const step = state.steps.find((s) => s.id === stepId);
    if (step) {
      step.findings = output.slice(0, 200);
    }
    state.iterationsCompleted++;
  }
}
