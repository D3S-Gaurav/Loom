import { EventBus } from "./bus";
import { plan } from "./planner";
import { nextWave } from "./dagSchedule";
import { runWorker } from "./worker";
import { validate } from "./validator";
import { runText } from "./run";
import type { SwarmMode, SwarmPlan, SwarmTask } from "./types";
import { executionPolicy } from "./executionMode";
import { searchWeb } from "../research/firecrawl";
import {
  approximateTokens,
  boundContext,
  boundContextSections,
  contextBudgetFor,
} from "./tokenBudget";

interface Done {
  task: SwarmTask;
  agentId: string;
  output: string;
}

/**
 * Drives a full swarm run, emitting events onto the bus. Tasks whose dependencies
 * are all satisfied run concurrently; each is gated by the validator with one
 * mode-aware validation and self-correction. A synthesizer fuses the outputs
 * into the final answer.
 *
 * `signal` represents the execution owner's cancellation request. In direct
 * mode that owner is the HTTP request; in Temporal mode it is the Activity,
 * which intentionally continues if a browser merely disconnects.
 */
export async function runSwarm(
  goal: string,
  bus: EventBus,
  signal?: AbortSignal,
  attachmentContext?: string,
  mode: SwarmMode = "auto",
) {
  const policy = executionPolicy(mode);
  const contextBudget = contextBudgetFor(mode);
  const t0 = Date.now();
  let tokensOut = 0;
  let tokensIn = approximateTokens(goal) + approximateTokens(attachmentContext ?? "");

  bus.emit({ kind: "run.start", goal, at: t0 });

  let plannedPlan: SwarmPlan;
  try {
    plannedPlan = await plan(goal, bus, signal, attachmentContext, mode);
  } catch (e) {
    console.error("Planner failed", e);
    bus.emit({ kind: "error", message: "The planner could not produce a safe execution plan." });
    await bus.close("failed");
    return;
  }
  tokensOut += approximateTokens(JSON.stringify(plannedPlan));

  // completed is the shared blackboard: once a task finishes, its output is
  // stored here so downstream tasks can consume it as context.
  const completed = new Map<string, Done>();

  // remaining is the scheduler's worklist: tasks are removed from this map once
  // they are selected for an execution wave.
  const remaining = new Map(plannedPlan.tasks.map((t) => [t.id, t]));

  // Execute the DAG in waves of independent tasks.
  while (remaining.size > 0) {
    if (signal?.aborted) {
      bus.emit({ kind: "error", message: "Run cancelled: client disconnected." });
      await bus.close("failed");
      return;
    }
    const wave = nextWave([...remaining.values()], new Set(completed.keys()));
    if (wave.length === 0) {
      // If tasks remain but none are ready, the graph has an impossible
      // dependency shape: a cycle, missing dependency, or invalid task id.
      bus.emit({ kind: "error", message: "Plan has an unsatisfiable dependency cycle." });
      break;
    }
    wave.forEach((t) => remaining.delete(t.id));

    // Run all currently-ready tasks concurrently. This is where the swarm gets
    // latency benefits over a simple serial task list.
    await Promise.all(
      wave.map(async (task) => {
        const agentId = `agent-${task.id}`;
        bus.emit({
          kind: "agent.spawn",
          id: agentId,
          agentType: task.type,
          taskId: task.id,
          title: task.title,
          dependsOn: task.dependsOn,
        });

        // Pull upstream outputs off the shared blackboard, and draw the edges.
        const deps = task.dependsOn
          .map((d) => completed.get(d))
          // Type guard: after this filter, TypeScript knows each item is Done,
          // not undefined from a failed Map lookup.
          .filter((d): d is Done => Boolean(d));
        for (const d of deps) {
          bus.emit({ kind: "message", from: d.agentId, to: agentId, label: "context" });
        }
        const depContext = deps.map((d) => ({ title: d.task.title, output: d.output }));
        const boundedDependencies = boundContextSections(
          depContext.map((dependency) => ({
            heading: `### ${dependency.title}`,
            body: dependency.output,
          })),
          contextBudget.dependencyChars,
        );
        const webResearch = task.type === "researcher"
          ? await searchWeb(`${goal}\n\n${task.title}\n${task.brief}`, signal)
          : undefined;

        tokensIn +=
          approximateTokens(task.brief) +
          approximateTokens(boundedDependencies) +
          approximateTokens(webResearch?.context ?? "");

        try {
          let output = await runWorker(agentId, task, depContext, bus, undefined, signal, mode, webResearch);
          tokensOut += approximateTokens(output);

          // Validation depth is part of the selected execution policy: low
          // performs one gate, auto can revise once, and max can revise twice.
          for (let attempt = 0; attempt <= policy.maxRevisions; attempt++) {
            bus.emit({ kind: "agent.status", id: agentId, status: "validating" });
            bus.emit({ kind: "message", from: agentId, to: "validator", label: "review" });
            tokensIn +=
              approximateTokens(task.brief) +
              approximateTokens(boundContext(output, contextBudget.validationChars));
            const verdict = await validate(task, output, signal, mode);
            tokensOut += approximateTokens(JSON.stringify(verdict));
            bus.emit({
              kind: "validate.result",
              id: agentId,
              taskId: task.id,
              approved: verdict.approved,
              score: verdict.score,
              feedback: verdict.feedback,
            });
            if (verdict.approved || attempt === policy.maxRevisions) break;

            // Feedback-based self-correction: the same worker reruns with the
            // validator's concrete feedback appended to its prompt.
            bus.emit({ kind: "message", from: "validator", to: agentId, label: "revise" });
            tokensIn +=
              approximateTokens(task.brief) +
              approximateTokens(boundedDependencies) +
              approximateTokens(webResearch?.context ?? "") +
              approximateTokens(boundContext(verdict.feedback, contextBudget.revisionChars));
            output = await runWorker(agentId, task, depContext, bus, verdict.feedback, signal, mode, webResearch);
            tokensOut += approximateTokens(output);
          }

          bus.emit({ kind: "agent.status", id: agentId, status: "done" });
          bus.emit({ kind: "task.done", taskId: task.id, agentId, output });
          completed.set(task.id, { task, agentId, output });
        } catch (e) {
          console.error(`Agent ${agentId} failed`, e);
          bus.emit({ kind: "agent.status", id: agentId, status: "failed" });
          bus.emit({ kind: "error", agentId, message: "This specialist could not complete its task." });
          // Record an empty result so dependents can still proceed.
          // Product tradeoff: this favors completing the run over strict quality.
          // A production system should mark this as degraded/untrusted.
          completed.set(task.id, { task, agentId, output: "(this subtask failed)" });
        }
      }),
    );
  }

  if (signal?.aborted) {
    bus.emit({ kind: "error", message: "Run cancelled: client disconnected." });
    await bus.close("failed");
    return;
  }

  // Synthesis pass.
  const synthId = "synthesizer";
  bus.emit({
    kind: "agent.spawn",
    id: synthId,
    agentType: "synthesizer",
    taskId: "synthesis",
    title: "Final synthesis",
    dependsOn: [...completed.values()].map((d) => d.task.id),
  });
  for (const d of completed.values()) {
    bus.emit({ kind: "message", from: d.agentId, to: synthId, label: "result" });
  }
  bus.emit({ kind: "agent.status", id: synthId, status: "streaming" });

  const corpus = boundContextSections(
    [...completed.values()].map((done) => ({
      heading: `## ${done.task.title}`,
      body: done.output,
    })),
    contextBudget.synthesisChars,
  );

  let final = "";
  try {
    tokensIn +=
      approximateTokens(goal) +
      approximateTokens(plannedPlan.synthesisBrief) +
      approximateTokens(corpus);
    const res = await runText("synthesizer", {
      system: [
        "You are the Synthesizer agent. Fuse the swarm's worker outputs into one cohesive, " +
          "polished final deliverable that fully answers the original goal. Resolve overlaps, " +
          "keep the best detail, and structure it cleanly in markdown. Do not mention the agents.",
        policy.synthesisDirective,
      ]
        .filter(Boolean)
        .join("\n\n"),
      prompt: `Original goal:\n${goal}\n\nHow to fuse:\n${plannedPlan.synthesisBrief}\n\nWorker outputs:\n${corpus}`,
      onDelta: (delta) => {
        final += delta;
        bus.emit({ kind: "agent.token", id: synthId, delta });
      },
      signal,
    });
    final = res.text;
    tokensOut += approximateTokens(final);
    bus.emit({ kind: "agent.status", id: synthId, status: "done" });
  } catch (e) {
    console.error("Synthesizer failed", e);
    bus.emit({ kind: "error", agentId: synthId, message: "Synthesis failed; showing the worker outputs instead." });
    final = corpus; // fall back to raw worker outputs
  }

  bus.emit({ kind: "run.done", final, tokensIn, tokensOut, ms: Date.now() - t0 });
  await bus.close("completed");
}
