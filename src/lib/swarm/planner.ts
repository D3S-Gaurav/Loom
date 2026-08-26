import { z } from "zod";
import { AllModelsFailed, genObject } from "./run";
import type { EventBus } from "./bus";
import type { SwarmMode, SwarmPlan } from "./types";
import { executionPolicy } from "./executionMode";

const taskSchema = z.object({
  id: z.string().describe("Short stable id, e.g. 't1'."),
  type: z
    .enum(["researcher", "analyst", "writer", "coder"])
    .describe("Which specialist agent should own this task."),
  title: z.string().describe("3-6 word task name shown on the graph node."),
  brief: z.string().describe("Clear, self-contained instruction for the worker agent."),
  dependsOn: z
    .array(z.string())
    .describe("Ids of tasks whose output this task needs. Empty for root tasks."),
});

export function planSchemaFor(mode: SwarmMode) {
  const { taskBounds } = executionPolicy(mode);
  return z.object({
    summary: z.string().describe("One-sentence read of the goal and the strategy to solve it."),
    tasks: z.array(taskSchema).min(taskBounds.min).max(taskBounds.max),
    synthesisBrief: z
      .string()
      .describe("How to fuse all worker outputs into one polished final deliverable."),
  });
}

// Interview note: this system prompt is the planner's control policy. It asks the
// model for a small DAG, pushes it toward parallel execution, and limits agent
// types so the orchestrator receives a compact, machine-runnable plan.
const SYSTEM = `You are the Planner of an autonomous agent swarm.
Decompose the user's goal into a small DAG (2-4 tasks) of specialist subtasks that
together fully solve it. STRONGLY maximize PARALLELISM: prefer independent tasks with
NO dependencies so they all run at once. Only add a dependency when a task genuinely
needs another's output; avoid long dependency chains. Each task must be self-contained and assigned to
the best-fit specialist: researcher (gather/structure knowledge), analyst (reason,
compare, evaluate trade-offs), writer (produce prose/sections), coder (produce code
or technical specs). When the goal depends on current facts, external evidence, market data,
papers, products, or public sources, include a researcher task and make its brief a precise,
search-ready evidence request. Keep the graph tight — no redundant tasks.`;

function plannerSystem(mode: SwarmMode) {
  if (mode === "auto") return SYSTEM;
  const policy = executionPolicy(mode);
  return `${SYSTEM.replace("(2-4 tasks)", `(${policy.taskBounds.min}-${policy.taskBounds.max} tasks)`)}\n${policy.plannerDirective}`;
}

/** Generic degrade-gracefully plan used if every planner model is rate-limited/unavailable. */
function fallbackPlan(goal: string, mode: SwarmMode): SwarmPlan {
  if (mode === "max") {
    return {
      goal,
      summary:
        "Default deep research, risk, recommendation, and delivery plan (planner models were unavailable).",
      tasks: [
        {
          id: "t1",
          type: "researcher",
          title: "Gather evidence",
          brief: `Research the facts, context, constraints, and landscape relevant to: ${goal}.`,
          dependsOn: [],
        },
        {
          id: "t2",
          type: "analyst",
          title: "Test assumptions",
          brief: `Identify assumptions, risks, edge cases, and competing approaches for: ${goal}.`,
          dependsOn: [],
        },
        {
          id: "t3",
          type: "analyst",
          title: "Develop recommendations",
          brief: `Develop concrete, evidence-based recommendations for: ${goal}.`,
          dependsOn: ["t1", "t2"],
        },
        {
          id: "t4",
          type: "writer",
          title: "Shape deliverable",
          brief: `Turn the evidence and recommendations into a polished, actionable response to: ${goal}.`,
          dependsOn: ["t1", "t2", "t3"],
        },
      ],
      synthesisBrief: `Reconcile every section into a comprehensive, decision-ready answer to: ${goal}.`,
    };
  }
  return {
    goal,
    summary: "Default research → analysis → write plan (planner models were unavailable).",
    tasks: [
      { id: "t1", type: "researcher", title: "Gather context", brief: `Research everything relevant to: ${goal}. Facts, landscape, constraints, players.`, dependsOn: [] },
      { id: "t2", type: "analyst", title: "Analyze & recommend", brief: `Reason through the key decisions and trade-offs for: ${goal}, and give concrete recommendations.`, dependsOn: [] },
    ],
    synthesisBrief: `Combine the sections into one cohesive, well-structured answer to: ${goal}.`,
  };
}

export async function plan(
  goal: string,
  bus: EventBus,
  signal?: AbortSignal,
  attachmentContext?: string,
  mode: SwarmMode = "auto",
): Promise<SwarmPlan> {
  // First UI-visible event for the planning phase.
  bus.emit({ kind: "plan.start" });

  let plan: SwarmPlan;
  try {
    // Schema-constrained generation: the model must return an object matching
    // planSchema, not arbitrary prose. This is critical because the orchestrator
    // will execute these tasks programmatically.
    const { object } = await genObject("planner", {
      schema: planSchemaFor(mode),
      system: plannerSystem(mode),
      prompt: [
        `Goal:\n${goal}`,
        attachmentContext,
      ]
        .filter(Boolean)
        .join("\n\n"),
      signal,
    });
    plan = { goal, ...object };
    bus.emit({ kind: "plan.token", delta: plan.summary });
  } catch (e) {
    // Only degrade to the generic plan when every model in the chain was
    // genuinely exhausted. An infrastructure error (e.g. Redis unreachable)
    // is NOT a "the AI was flaky" situation — let it propagate so the run
    // fails visibly instead of silently shipping a lower-quality plan.
    if (!(e instanceof AllModelsFailed)) throw e;
    plan = fallbackPlan(goal, mode);
    bus.emit({ kind: "plan.token", delta: plan.summary });
  }

  // Emits the complete DAG so the frontend can create graph nodes and edges.
  bus.emit({ kind: "plan.done", plan });
  return plan;
}
