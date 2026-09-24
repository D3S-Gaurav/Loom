import type { SwarmMode } from "../lib/swarm/types";

export interface SwarmWorkflowInput {
  runId: string;
  ownerId: string;
  goal: string;
  context?: string;
  mode: SwarmMode;
}
