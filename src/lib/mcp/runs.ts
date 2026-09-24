import { getRunSession, listRunSessions } from "../swarm/session";

export async function listOwnedRuns(ownerId: string, limit = 20) {
  const runs = await listRunSessions(ownerId, limit);
  return runs.map((run) => ({
    runId: run.runId,
    goal: run.goal ?? "Untitled swarm",
    status: run.status,
    startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
    completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
    hasFinalDeliverable: Boolean(run.final),
  }));
}

export async function getOwnedFinalDeliverable(ownerId: string, runId: string) {
  const run = await getRunSession(runId);
  if (!run || run.ownerId !== ownerId) return null;

  return {
    runId: run.runId,
    goal: run.goal ?? "Untitled swarm",
    status: run.status,
    completedAt: run.completedAt ? new Date(run.completedAt).toISOString() : null,
    final: run.final ?? null,
  };
}
