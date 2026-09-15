import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventBus } from "./bus";
import type { SwarmMode, SwarmPlan } from "./types";

const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  runWorker: vi.fn(),
  validate: vi.fn(),
  runText: vi.fn(),
}));

vi.mock("./planner", () => ({ plan: mocks.plan }));
vi.mock("./worker", () => ({ runWorker: mocks.runWorker }));
vi.mock("./validator", () => ({ validate: mocks.validate }));
vi.mock("./run", () => ({ runText: mocks.runText }));

import { runSwarm } from "./orchestrator";

const planned: SwarmPlan = {
  goal: "Test the mode",
  summary: "One specialist can exercise the retry policy.",
  tasks: [
    {
      id: "t1",
      type: "analyst",
      title: "Test policy",
      brief: "Return a useful result.",
      dependsOn: [],
    },
  ],
  synthesisBrief: "Return the result.",
};

function bus() {
  return {
    emit: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBus;
}

describe("mode-aware orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.plan.mockResolvedValue(planned);
    mocks.runWorker.mockResolvedValue("worker result");
    mocks.validate.mockResolvedValue({ approved: false, score: 4, feedback: "Revise it." });
    mocks.runText.mockResolvedValue({ text: "final result", modelId: "test" });
  });

  it.each([
    ["low", 1],
    ["auto", 2],
    ["max", 3],
  ] satisfies [SwarmMode, number][])(
    "%s performs the configured number of validation passes",
    async (mode, validationPasses) => {
      await runSwarm(planned.goal, bus(), undefined, undefined, mode);

      expect(mocks.validate).toHaveBeenCalledTimes(validationPasses);
      expect(mocks.runWorker).toHaveBeenCalledTimes(validationPasses);
      expect(mocks.plan).toHaveBeenCalledWith(planned.goal, expect.anything(), undefined, undefined, mode);
      expect(mocks.validate).toHaveBeenLastCalledWith(planned.tasks[0], "worker result", undefined, mode);
    },
  );
});
