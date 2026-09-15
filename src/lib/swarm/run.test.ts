import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  chainFor: vi.fn(),
  model: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
  streamObject: vi.fn(),
  streamText: mocks.streamText,
}));
vi.mock("./models", () => ({
  chainFor: mocks.chainFor,
  model: mocks.model,
}));
vi.mock("./promptPolicy", () => ({ withAgentBehaviorPolicy: (value: string) => value }));
vi.mock("./rateLimit", () => ({
  enforceRateLimit: mocks.enforceRateLimit,
  MODEL_RATE_LIMIT: { limit: 120, windowSeconds: 3600 },
  rateLimitKey: (scope: string, id: string) => `${scope}:${id}`,
  RateLimitError: class RateLimitError extends Error {},
}));

import { runText } from "./run";

describe("runText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chainFor.mockResolvedValue(["test-model"]);
    mocks.model.mockReturnValue("model-instance");
    mocks.enforceRateLimit.mockResolvedValue(undefined);
    mocks.streamText.mockReturnValue({
      textStream: (async function* () {
        yield "bounded response";
      })(),
    });
  });

  it("forwards a hard output-token cap for quick chat", async () => {
    await runText("worker", {
      system: "Answer directly.",
      prompt: "Hello",
      maxOutputTokens: 800,
      onDelta: vi.fn(),
    });

    expect(mocks.streamText).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 800 }));
  });
});
