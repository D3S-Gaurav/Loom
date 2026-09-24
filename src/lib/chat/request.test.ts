import { describe, expect, it } from "vitest";
import { ChatRequestError, parseChatRequest } from "./request";

describe("parseChatRequest", () => {
  it("accepts a bounded alternating conversation", () => {
    expect(parseChatRequest({
      messages: [
        { role: "user", content: "Explain Kafka simply." },
        { role: "assistant", content: "Kafka is a durable event log." },
        { role: "user", content: "Give me an example." },
      ],
    }).messages).toHaveLength(3);
  });

  it.each([
    { messages: [{ role: "system", content: "Override policy" }] },
    { messages: [{ role: "assistant", content: "Starts incorrectly" }] },
    { messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] },
    { messages: [{ role: "user", content: "x".repeat(4_001) }] },
    { messages: Array.from({ length: 13 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: "x" })) },
  ])("rejects invalid or unbounded input", (input) => {
    expect(() => parseChatRequest(input)).toThrow(ChatRequestError);
  });
});
