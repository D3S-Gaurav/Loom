// Core domain + event types for the Loom agent swarm.

export type AgentType =
  | "planner"
  | "researcher"
  | "analyst"
  | "writer"
  | "coder"
  | "validator"
  | "synthesizer";

export type AgentStatus =
  | "idle"
  | "thinking"
  | "streaming"
  | "validating"
  | "retrying"
  | "done"
  | "failed";

export const SWARM_MODES = ["low", "auto", "max"] as const;
export type SwarmMode = (typeof SWARM_MODES)[number];

/** A unit of work in the plan DAG. */
export interface SwarmTask {
  id: string;
  type: Exclude<AgentType, "planner" | "validator" | "synthesizer">;
  title: string;
  /** The instruction handed to the worker agent. */
  brief: string;
  /** Task ids this task consumes the output of. */
  dependsOn: string[];
}

export interface SwarmPlan {
  goal: string;
  summary: string;
  tasks: SwarmTask[];
  /** How the synthesizer should fuse worker outputs into the final answer. */
  synthesisBrief: string;
}

// ---- Streaming events emitted by the orchestrator ----

export type SwarmEvent =
  | { kind: "run.start"; goal: string; at: number }
  | { kind: "plan.start" }
  | { kind: "plan.token"; delta: string }
  | { kind: "plan.done"; plan: SwarmPlan }
  | { kind: "agent.spawn"; id: string; agentType: AgentType; taskId: string; title: string; dependsOn: string[] }
  | { kind: "agent.status"; id: string; status: AgentStatus }
  | { kind: "agent.token"; id: string; delta: string }
  | { kind: "message"; from: string; to: string; label: string }
  | { kind: "validate.result"; id: string; taskId: string; approved: boolean; score: number; feedback: string }
  | { kind: "task.done"; taskId: string; agentId: string; output: string }
  | { kind: "run.done"; final: string; tokensIn: number; tokensOut: number; ms: number }
  | { kind: "error"; message: string; agentId?: string };

export const AGENT_META: Record<AgentType, { label: string; color: string }> = {
  planner: { label: "Planner", color: "#a78bfa" },
  researcher: { label: "Researcher", color: "#38bdf8" },
  analyst: { label: "Analyst", color: "#34d399" },
  writer: { label: "Writer", color: "#fbbf24" },
  coder: { label: "Coder", color: "#f472b6" },
  validator: { label: "Validator", color: "#fb7185" },
  synthesizer: { label: "Synthesizer", color: "#c084fc" },
};
