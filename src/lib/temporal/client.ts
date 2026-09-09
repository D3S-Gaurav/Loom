import { Client, Connection } from "@temporalio/client";
import { DEFAULT_TEMPORAL_TASK_QUEUE, SWARM_WORKFLOW_NAME } from "../../temporal/constants";
import type { SwarmWorkflowInput } from "../../temporal/types";

let clientPromise: Promise<Client> | null = null;

function temporalConfig() {
  return {
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: process.env.TEMPORAL_TASK_QUEUE ?? DEFAULT_TEMPORAL_TASK_QUEUE,
  };
}

export function getExecutionMode(): "direct" | "temporal" {
  return process.env.LOOM_EXECUTION_MODE === "temporal" ? "temporal" : "direct";
}

export function getTemporalClient() {
  if (!clientPromise) {
    const config = temporalConfig();
    clientPromise = Connection.connect({ address: config.address })
      .then((connection) => new Client({ connection, namespace: config.namespace }))
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

export async function startSwarmWorkflow(input: SwarmWorkflowInput) {
  const client = await getTemporalClient();
  const { taskQueue } = temporalConfig();
  return client.workflow.start(SWARM_WORKFLOW_NAME, {
    workflowId: `swarm-${input.runId}`,
    taskQueue,
    args: [input],
    workflowExecutionTimeout: "15 minutes",
  });
}

export async function pingTemporal() {
  const client = await getTemporalClient();
  await client.connection.workflowService.getSystemInfo({});
}
