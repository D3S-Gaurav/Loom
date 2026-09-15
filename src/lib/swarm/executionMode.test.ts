import { describe, expect, it } from "vitest";
import { executionPolicy, isSwarmMode } from "./executionMode";
import { planSchemaFor } from "./planner";
import type { SwarmMode } from "./types";

const task = (index: number) => ({
  id: `t${index}`,
  type: "analyst" as const,
  title: `Task ${index}`,
  brief: `Handle task ${index}`,
  dependsOn: [] as string[],
});

const candidate = (count: number) => ({
  summary: "A valid plan",
  tasks: Array.from({ length: count }, (_, index) => task(index + 1)),
  synthesisBrief: "Combine the results.",
});

describe("swarm execution modes", () => {
  it.each([
    ["low", 1, 2, 0, 7],
    ["auto", 2, 4, 1, 7],
    ["max", 4, 6, 2, 8],
  ] as const)(
    "%s enforces its task and revision budget",
    (mode, min, max, maxRevisions, approvalScore) => {
      const policy = executionPolicy(mode);
      const schema = planSchemaFor(mode);

      expect(policy.taskBounds).toEqual({ min, max });
      expect(policy.maxRevisions).toBe(maxRevisions);
      expect(policy.approvalScore).toBe(approvalScore);
      expect(schema.safeParse(candidate(min)).success).toBe(true);
      expect(schema.safeParse(candidate(max)).success).toBe(true);
      expect(schema.safeParse(candidate(min - 1)).success).toBe(false);
      expect(schema.safeParse(candidate(max + 1)).success).toBe(false);
    },
  );

  it("preserves the previous adaptive auto policy", () => {
    expect(executionPolicy("auto")).toEqual({
      taskBounds: { min: 2, max: 4 },
      maxRevisions: 1,
      approvalScore: 7,
      plannerDirective: "",
      workerDirective: "",
      validatorDirective: "",
      synthesisDirective: "",
    });
  });

  it.each(["low", "auto", "max"] satisfies SwarmMode[])(
    "recognizes %s as a supported mode",
    (mode) => expect(isSwarmMode(mode)).toBe(true),
  );

  it("rejects unsupported mode input", () => {
    expect(isSwarmMode("turbo")).toBe(false);
    expect(isSwarmMode(null)).toBe(false);
  });
});
