import { describe, expect, it } from "vitest";
import type { SwarmMode } from "./types";
import {
  approximateTokens,
  boundContext,
  boundContextSections,
  CONTEXT_TRUNCATION_MARKER,
  contextBudgetFor,
} from "./tokenBudget";

describe("swarm context budgets", () => {
  it("orders every repeated-context budget from Low to Auto to Max", () => {
    const modes = ["low", "auto", "max"] satisfies SwarmMode[];
    const budgets = modes.map(contextBudgetFor);

    for (const field of [
      "dependencyChars",
      "revisionChars",
      "validationChars",
      "synthesisChars",
    ] as const) {
      expect(budgets[0][field]).toBeLessThan(budgets[1][field]);
      expect(budgets[1][field]).toBeLessThan(budgets[2][field]);
    }
  });

  it("caps long text, keeps its opening and conclusion, and marks the cut", () => {
    const source = `essential opening ${"x".repeat(500)} essential conclusion`;
    const bounded = boundContext(source, 120);

    expect(bounded).toHaveLength(120);
    expect(bounded).toContain("essential opening");
    expect(bounded).toContain("essential conclusion");
    expect(bounded).toContain(CONTEXT_TRUNCATION_MARKER.trim());
    expect(boundContext(source, CONTEXT_TRUNCATION_MARKER.length + 1)).toHaveLength(
      CONTEXT_TRUNCATION_MARKER.length + 1,
    );
  });

  it("keeps short sections and labels while fairly capping a large corpus", () => {
    const sections = [
      { heading: "## Core facts", body: "Keep this complete." },
      { heading: "## Analysis", body: `Opening analysis ${"a".repeat(600)} final recommendation` },
      { heading: "## Risks", body: `Opening risks ${"r".repeat(600)} final mitigation` },
    ];

    const first = boundContextSections(sections, 320);
    const second = boundContextSections(sections, 320);

    expect(first).toBe(second);
    expect(first.length).toBeLessThanOrEqual(320);
    expect(first).toContain("## Core facts\nKeep this complete.");
    expect(first).toContain("## Analysis");
    expect(first).toContain("## Risks");
    expect(first).toContain(CONTEXT_TRUNCATION_MARKER.trim());
  });

  it("labels chars/4 as an approximate whole-token count", () => {
    expect(approximateTokens("")).toBe(0);
    expect(approximateTokens("1234")).toBe(1);
    expect(approximateTokens("12345")).toBe(2);
  });
});
