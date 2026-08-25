import { SWARM_MODES, type SwarmMode } from "./types";

export interface SwarmExecutionPolicy {
  taskBounds: { min: number; max: number };
  maxRevisions: number;
  approvalScore: number;
  plannerDirective: string;
  workerDirective: string;
  validatorDirective: string;
  synthesisDirective: string;
}

const POLICIES: Record<SwarmMode, SwarmExecutionPolicy> = {
  low: {
    taskBounds: { min: 1, max: 2 },
    maxRevisions: 0,
    approvalScore: 7,
    plannerDirective:
      "Use only 1-2 essential tasks. Prefer the shortest viable DAG and avoid specialist overlap.",
    workerDirective:
      "Keep this pass compact and decisive (about 150-250 words unless code requires more). Cover only the highest-value evidence and actions.",
    validatorDirective:
      "Use a fast quality pass: reject only material correctness, completeness, or usefulness problems.",
    synthesisDirective:
      "Produce a concise, immediately usable answer. Keep only the strongest conclusions and essential supporting detail.",
  },
  auto: {
    taskBounds: { min: 2, max: 4 },
    maxRevisions: 1,
    approvalScore: 7,
    plannerDirective: "",
    workerDirective: "",
    validatorDirective: "",
    synthesisDirective: "",
  },
  max: {
    taskBounds: { min: 4, max: 6 },
    maxRevisions: 2,
    approvalScore: 8,
    plannerDirective:
      "Use 4-6 complementary specialist tasks. Investigate the goal from multiple useful angles, make assumptions explicit, and reserve dependencies for genuine handoffs. Favor depth and evidence over speed.",
    workerDirective:
      "Work deeply. Pressure-test assumptions, include concrete evidence or implementation detail, explore important edge cases and trade-offs, and deliver a thorough section that can survive expert review.",
    validatorDirective:
      "Apply an expert-level quality bar. Require correctness, completeness, specificity, internally consistent reasoning, and direct fulfillment of every material part of the brief.",
    synthesisDirective:
      "Create a comprehensive, decision-ready deliverable. Reconcile contradictions, preserve important evidence and caveats, make assumptions explicit, and finish with concrete next actions.",
  },
};

export function isSwarmMode(value: unknown): value is SwarmMode {
  return typeof value === "string" && SWARM_MODES.includes(value as SwarmMode);
}

export function executionPolicy(mode: SwarmMode): SwarmExecutionPolicy {
  return POLICIES[mode];
}
