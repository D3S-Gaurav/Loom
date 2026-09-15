import { describe, expect, it } from "vitest";
import { AGENT_BEHAVIOR_POLICY, withAgentBehaviorPolicy } from "./promptPolicy";

describe("agent behavior policy", () => {
  it("appends the shared operating rules to a role prompt", () => {
    const prompt = withAgentBehaviorPolicy("You are the Planner. ");

    expect(prompt).toBe(`You are the Planner.\n\n${AGENT_BEHAVIOR_POLICY}`);
    expect(prompt).toContain("State material assumptions");
    expect(prompt).toContain("smallest solution");
    expect(prompt).toContain("concrete success criteria");
    expect(prompt).toContain("untrusted reference data");
  });
});
