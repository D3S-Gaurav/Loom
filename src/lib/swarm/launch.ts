import { getExecutionMode, startSwarmWorkflow } from "@/lib/temporal/client";
import { EventBus } from "./bus";
import { runSwarm } from "./orchestrator";
import { createRunSession, finishRunSession, type SwarmEventEnvelope } from "./session";
import { readDurableEvents } from "./sse";
import type { SwarmMode } from "./types";

export interface LaunchSwarmInput {
  runId: string;
  ownerId: string;
  goal: string;
  context?: string;
  mode: SwarmMode;
  signal: AbortSignal;
}

export interface RunningSwarm {
  mode: "direct" | "temporal";
  events: AsyncIterable<SwarmEventEnvelope>;
}

/**
 * Application boundary between HTTP and execution infrastructure. Route
 * handlers should know that a run starts and emits events, not how Temporal or
 * the in-process debugging path is wired.
 */
export async function launchSwarm(input: LaunchSwarmInput): Promise<RunningSwarm> {
  const mode = getExecutionMode();

  if (mode === "temporal") {
    try {
      await createRunSession(input.runId, input.ownerId, input.goal);
      await startSwarmWorkflow({
        runId: input.runId,
        ownerId: input.ownerId,
        goal: input.goal,
        context: input.context,
        mode: input.mode,
      });
    } catch (error) {
      await finishRunSession(input.runId, "failed").catch(() => undefined);
      throw error;
    }

    return {
      mode,
      events: readDurableEvents(input.runId, input.ownerId, input.signal),
    };
  }

  const bus = new EventBus(input.runId, input.ownerId);
  runSwarm(input.goal, bus, input.signal, input.context, input.mode).catch(async (error) => {
    console.error(`Direct swarm ${input.runId} failed`, error);
    bus.emit({ kind: "error", message: "The swarm stopped because an internal dependency failed." });
    try {
      await bus.close("failed");
    } catch (deliveryError) {
      console.error("Failed to persist swarm failure", deliveryError);
    }
  });

  return { mode, events: bus };
}
