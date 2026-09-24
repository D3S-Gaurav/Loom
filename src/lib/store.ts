import { create } from "zustand";
import type { AgentStatus, AgentType, SwarmEvent } from "./swarm/types";
import type { RunTransport } from "./swarm/runStream";
import { saveRun, type SavedRun } from "./history";

export interface AgentNode {
  id: string;
  agentType: AgentType;
  taskId: string;
  title: string;
  status: AgentStatus;
  dependsOn: string[];
  output: string;
  score?: number;
  feedback?: string;
}

export interface SwarmEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export type RunStatus = "idle" | "running" | "done" | "error";

interface State {
  runStatus: RunStatus;
  runId: string | null;
  /** Which live transport is delivering events; null while none is proven yet. */
  transport: RunTransport | null;
  goal: string;
  planSummary: string;
  planThinking: string;
  agents: Record<string, AgentNode>;
  order: string[];
  edges: SwarmEdge[];
  selected: string | null;
  final: string;
  stats: { tokensIn: number; tokensOut: number; ms: number } | null;
  error: string | null;

  reset: (goal: string) => void;
  goHome: () => void;
  setRunId: (runId: string) => void;
  setTransport: (transport: RunTransport | null) => void;
  select: (id: string | null) => void;
  apply: (e: SwarmEvent) => void;
  loadRun: (run: SavedRun) => void;
}

const PLANNER_ID = "planner";
const VALIDATOR_ID = "validator";

function ensureEdge(edges: SwarmEdge[], source: string, target: string, label: string): SwarmEdge[] {
  const id = `${source}->${target}`;
  const existing = edges.find((e) => e.id === id);
  if (existing) {
    if (existing.label !== label) existing.label = label;
    return edges;
  }
  return [...edges, { id, source, target, label }];
}

export const useSwarm = create<State>((set) => ({
  runStatus: "idle",
  runId: null,
  transport: null,
  goal: "",
  planSummary: "",
  planThinking: "",
  agents: {},
  order: [],
  edges: [],
  selected: null,
  final: "",
  stats: null,
  error: null,

  reset: (goal) =>
    set({
      runStatus: "running",
      runId: null,
      transport: null,
      goal,
      planSummary: "",
      planThinking: "",
      agents: {
        [PLANNER_ID]: {
          id: PLANNER_ID,
          agentType: "planner",
          taskId: "plan",
          title: "Planner",
          status: "thinking",
          dependsOn: [],
          output: "",
        },
        [VALIDATOR_ID]: {
          id: VALIDATOR_ID,
          agentType: "validator",
          taskId: "validate",
          title: "Validator",
          status: "idle",
          dependsOn: [],
          output: "",
        },
      },
      order: [PLANNER_ID, VALIDATOR_ID],
      edges: [],
      selected: null,
      final: "",
      stats: null,
      error: null,
    }),

  goHome: () =>
    set({
      runStatus: "idle",
      runId: null,
      transport: null,
      goal: "",
      planSummary: "",
      planThinking: "",
      agents: {},
      order: [],
      edges: [],
      selected: null,
      final: "",
      stats: null,
      error: null,
    }),

  select: (id) => set({ selected: id }),

  setRunId: (runId) => set({ runId }),

  setTransport: (transport) => set({ transport }),

  loadRun: (run) =>
    set({
      runStatus: "done",
      runId: run.id,
      transport: null,
      goal: run.goal,
      planSummary: run.summary,
      planThinking: "",
      agents: Object.fromEntries(run.agents.map((a) => [a.id, a])),
      order: run.agents.map((a) => a.id),
      edges: run.edges,
      selected: null,
      final: run.final,
      stats: run.stats,
      error: null,
    }),

  apply: (e) =>
    set((s) => {
      switch (e.kind) {
        case "plan.token":
          return { planThinking: s.planThinking + e.delta };
        case "plan.done":
          return {
            planSummary: e.plan.summary,
            agents: { ...s.agents, [PLANNER_ID]: { ...s.agents[PLANNER_ID], status: "done" } },
          };
        case "agent.spawn": {
          const node: AgentNode = {
            id: e.id,
            agentType: e.agentType,
            taskId: e.taskId,
            title: e.title,
            status: "thinking",
            dependsOn: e.dependsOn,
            output: "",
          };
          let edges = s.edges;
          if (e.dependsOn.length === 0 && e.agentType !== "synthesizer") {
            edges = ensureEdge(edges, PLANNER_ID, e.id, "assign");
          }
          for (const d of e.dependsOn) edges = ensureEdge(edges, `agent-${d}`, e.id, "depends");
          const order = s.order.includes(e.id) ? s.order : [...s.order, e.id];
          return { agents: { ...s.agents, [e.id]: node }, edges, order };
        }
        case "agent.status": {
          const a = s.agents[e.id];
          if (!a) return {};
          return { agents: { ...s.agents, [e.id]: { ...a, status: e.status } } };
        }
        case "agent.token": {
          const a = s.agents[e.id];
          if (!a) return {};
          return { agents: { ...s.agents, [e.id]: { ...a, output: a.output + e.delta } } };
        }
        case "message": {
          if (e.to === VALIDATOR_ID || e.from === VALIDATOR_ID) {
            const [src, tgt] = e.from === VALIDATOR_ID ? [VALIDATOR_ID, e.to] : [e.from, VALIDATOR_ID];
            return { edges: ensureEdge(s.edges, src, tgt, e.label) };
          }
          return {};
        }
        case "validate.result": {
          const a = s.agents[e.id];
          if (!a) return {};
          return {
            agents: { ...s.agents, [e.id]: { ...a, score: e.score, feedback: e.feedback } },
          };
        }
        case "run.done": {
          const stats = { tokensIn: e.tokensIn, tokensOut: e.tokensOut, ms: e.ms };
          const saved: SavedRun = {
            id: s.runId ?? `run-${Date.now()}`,
            goal: s.goal,
            at: Date.now(),
            summary: s.planSummary,
            agents: s.order.map((id) => s.agents[id]).filter(Boolean),
            edges: s.edges,
            final: e.final,
            stats,
          };
          saveRun(saved);
          return { runStatus: "done", final: e.final, stats };
        }
        case "error":
          return { runStatus: "error", error: e.message };
        default:
          return {};
      }
    }),
}));
