import { afterEach, describe, expect, it, vi } from "vitest";
import { maxRunAllowance, runAllowance } from "./plans";

afterEach(() => vi.unstubAllEnvs());

describe("runAllowance", () => {
  it("gives Pro a larger default allowance than Free", () => {
    expect(runAllowance("free")).toEqual({ limit: 3, windowSeconds: 3600 });
    expect(runAllowance("pro")).toEqual({ limit: 100, windowSeconds: 3600 });
    expect(maxRunAllowance("free")).toEqual({ limit: 1, windowSeconds: 3600 });
    expect(maxRunAllowance("pro")).toEqual({ limit: 100, windowSeconds: 3600 });
  });

  it("accepts positive environment overrides and rejects invalid ones", () => {
    vi.stubEnv("LOOM_FREE_RUNS_PER_WINDOW", "7");
    vi.stubEnv("LOOM_FREE_MAX_RUNS_PER_WINDOW", "2");
    vi.stubEnv("LOOM_PRO_RUNS_PER_WINDOW", "not-a-number");
    vi.stubEnv("LOOM_RUN_WINDOW_SECONDS", "900");
    expect(runAllowance("free")).toEqual({ limit: 7, windowSeconds: 900 });
    expect(runAllowance("pro")).toEqual({ limit: 100, windowSeconds: 900 });
    expect(maxRunAllowance("free")).toEqual({ limit: 2, windowSeconds: 900 });
  });
});
