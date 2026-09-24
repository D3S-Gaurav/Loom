import { proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities";
import type { SwarmWorkflowInput } from "./types";

const { executeSwarm } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "30 seconds",
  // Model calls are not safely idempotent yet. Temporal still durably queues
  // the run, but automatic Activity replay is disabled until each swarm phase
  // has its own idempotency key and checkpoint.
  retry: { maximumAttempts: 1 },
});

export async function loomSwarmWorkflow(input: SwarmWorkflowInput) {
  await executeSwarm(input);
}
