import { cancellationSignal, heartbeat } from "@temporalio/activity";
import { EventBus } from "../lib/swarm/bus";
import { runSwarm } from "../lib/swarm/orchestrator";
import type { SwarmWorkflowInput } from "./types";

/**
 * Network and AI work belongs in an Activity, never directly in a Temporal
 * Workflow. The Workflow is replayed deterministically; this Activity is normal
 * Node.js code and may call OpenRouter, Redis, and Kafka.
 */
export async function executeSwarm(input: SwarmWorkflowInput) {
  const bus = new EventBus(input.runId, input.ownerId, { localDelivery: false });
  const pulse = setInterval(() => heartbeat({ runId: input.runId }), 10_000);

  try {
    await runSwarm(input.goal, bus, cancellationSignal(), input.context, input.mode);
  } finally {
    clearInterval(pulse);
  }
}
