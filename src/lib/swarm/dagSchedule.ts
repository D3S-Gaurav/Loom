import type { SwarmTask } from "./types";

/**
 * Pure DAG wave-scheduling logic, extracted from the orchestrator so it can be
 * unit-tested without any AI calls, EventBus, or infrastructure.
 */

/** Tasks in `remaining` whose every dependency id is already in `completedIds`. */
export function nextWave(remaining: SwarmTask[], completedIds: Set<string>): SwarmTask[] {
  return remaining.filter((t) => t.dependsOn.every((d) => completedIds.has(d)));
}

/**
 * Splits a task list into ordered waves. Throws if a cycle or missing
 * dependency leaves tasks that can never become ready.
 */
export function planWaves(tasks: SwarmTask[]): SwarmTask[][] {
  const remaining = new Map(tasks.map((t) => [t.id, t]));
  const completedIds = new Set<string>();
  const waves: SwarmTask[][] = [];

  while (remaining.size > 0) {
    const wave = nextWave([...remaining.values()], completedIds);
    if (wave.length === 0) {
      throw new Error("Plan has an unsatisfiable dependency cycle.");
    }
    for (const t of wave) {
      remaining.delete(t.id);
      completedIds.add(t.id);
    }
    waves.push(wave);
  }

  return waves;
}
