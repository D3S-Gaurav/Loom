import { describe, expect, it } from "vitest";
import { nextWave, planWaves } from "./dagSchedule";
import type { SwarmTask } from "./types";

function task(id: string, dependsOn: string[] = []): SwarmTask {
  return { id, type: "researcher", title: id, brief: id, dependsOn };
}

describe("nextWave", () => {
  it("returns tasks with no dependencies when nothing is completed", () => {
    const tasks = [task("t1"), task("t2", ["t1"])];
    expect(nextWave(tasks, new Set())).toEqual([task("t1")]);
  });

  it("returns a task only once ALL of its dependencies are completed", () => {
    const t3 = task("t3", ["t1", "t2"]);
    expect(nextWave([t3], new Set(["t1"]))).toEqual([]); // t2 still missing
    expect(nextWave([t3], new Set(["t1", "t2"]))).toEqual([t3]);
  });
});

describe("planWaves", () => {
  it("runs independent tasks in the same wave (parallelism)", () => {
    const waves = planWaves([task("t1"), task("t2")]);
    expect(waves).toEqual([[task("t1"), task("t2")]]);
  });

  it("splits a dependency chain into separate sequential waves", () => {
    const waves = planWaves([task("t1"), task("t2", ["t1"]), task("t3", ["t2"])]);
    expect(waves.map((w) => w.map((t) => t.id))).toEqual([["t1"], ["t2"], ["t3"]]);
  });

  it("groups a fan-in task into the wave right after all its dependencies finish", () => {
    const waves = planWaves([task("t1"), task("t2"), task("t3", ["t1", "t2"])]);
    expect(waves.map((w) => w.map((t) => t.id))).toEqual([["t1", "t2"], ["t3"]]);
  });

  it("throws on a direct cycle (t1 <-> t2)", () => {
    const tasks = [task("t1", ["t2"]), task("t2", ["t1"])];
    expect(() => planWaves(tasks)).toThrow("unsatisfiable dependency cycle");
  });

  it("throws on a dependency id that doesn't exist in the plan", () => {
    const tasks = [task("t1", ["ghost"])];
    expect(() => planWaves(tasks)).toThrow("unsatisfiable dependency cycle");
  });
});
