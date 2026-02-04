/**
 * Intel services — consolidated report, research, and topic-tracker.
 *
 * Architecture:
 *   BaseService (lifecycle, runTask, cost tracking)
 *     └─ Each intel service (report, research, topic-tracker)
 *          └─ uses prompt-builder to convert user input → prompt
 *          └─ uses digest-store for token-efficient context (topic-tracker, research)
 *          └─ all output structured JSON
 *
 * Iteration strategies:
 *   - ReportIntelService:       single pass, stateless
 *   - ResearchIntelService:     plan → iterate steps → synthesize, with ResearchState
 *   - TopicTrackerIntelService: recurring with Digest-based dedup
 */

export { ReportIntelService } from "./report.js";
export { ResearchIntelService } from "./research.js";
export { TopicTrackerIntelService } from "./topic-tracker.js";
export { DigestStore, ResearchStateStore } from "./digest-store.js";
export type {
  IntelStyle,
  TopicPreset,
  IntelOutput,
  Digest,
  DigestEntry,
  ResearchState,
  ResearchStep,
} from "./types.js";
