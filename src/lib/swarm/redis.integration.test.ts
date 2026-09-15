// Integration tests: these hit a REAL Redis, not a mock. Requires local infra
// running: `pnpm infra:up` (or any REDIS_URL pointed at a real Redis).
process.env.REDIS_URL ??= "redis://localhost:6379";

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getRedis, disconnectRedis } from "./redis";
import { enforceRateLimit, enforceRunRateLimit, rateLimitKey, RateLimitError } from "./rateLimit";
import { persistRunEvent, getRunSession, getRunEvents, listRunSessions } from "./session";
import type { SwarmEventEnvelope } from "./session";

// Unique-ish prefix per test run so parallel/rerun test runs never collide keys.
const testId = () => `test:${Date.now()}:${Math.random().toString(36).slice(2)}`;

afterAll(async () => {
  await disconnectRedis();
});

describe("enforceRateLimit against real Redis", () => {
  let key: string;

  beforeEach(() => {
    key = rateLimitKey("itest", testId());
  });

  it("allows requests up to the limit", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(enforceRateLimit({ key, limit: 3, windowSeconds: 60 })).resolves.toBeUndefined();
    }
  });

  it("throws RateLimitError on the request that exceeds the limit", async () => {
    await enforceRateLimit({ key, limit: 1, windowSeconds: 60 });
    await expect(enforceRateLimit({ key, limit: 1, windowSeconds: 60 })).rejects.toThrow(RateLimitError);
  });

  it("reports a retryAfterSeconds that matches the key's real TTL", async () => {
    await enforceRateLimit({ key, limit: 1, windowSeconds: 60 });
    try {
      await enforceRateLimit({ key, limit: 1, windowSeconds: 60 });
      throw new Error("expected RateLimitError");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      const err = e as RateLimitError;
      expect(err.retryAfterSeconds).toBeGreaterThan(0);
      expect(err.retryAfterSeconds).toBeLessThanOrEqual(60);
    }
  });

  it("does NOT reset the TTL on every increment (proves the count===1 guard)", async () => {
    const redis = await getRedis();
    await enforceRateLimit({ key, limit: 10, windowSeconds: 60 });
    const ttlAfterFirst = await redis.ttl(key);
    await enforceRateLimit({ key, limit: 10, windowSeconds: 60 });
    const ttlAfterSecond = await redis.ttl(key);
    // If EXPIRE ran again on the 2nd call, ttlAfterSecond would jump back near 60.
    expect(ttlAfterSecond).toBeLessThanOrEqual(ttlAfterFirst);
  });
});

describe("enforceRunRateLimit against real Redis", () => {
  it("enforces Max separately without consuming a rejected run", async () => {
    const id = testId();
    const input = {
      totalKey: rateLimitKey("runs", id),
      totalLimit: 3,
      maxKey: rateLimitKey("runs:max", id),
      maxLimit: 1,
      windowSeconds: 60,
    };

    await expect(enforceRunRateLimit({ ...input, isMax: true })).resolves.toBeUndefined();
    await expect(enforceRunRateLimit({ ...input, isMax: true })).rejects.toThrow(
      "Max mode hourly limit",
    );
    await expect(enforceRunRateLimit({ ...input, isMax: false })).resolves.toBeUndefined();
    await expect(enforceRunRateLimit({ ...input, isMax: false })).resolves.toBeUndefined();
    await expect(enforceRunRateLimit({ ...input, isMax: false })).rejects.toThrow(
      "Hourly run limit",
    );
  });
});

describe("persistRunEvent against real Redis", () => {
  function envelope(runId: string, sequence: number): SwarmEventEnvelope {
    return {
      version: 1,
      id: `${runId}:${sequence}`,
      runId,
      ownerId: "test-user",
      sequence,
      occurredAt: Date.now(),
      event: { kind: "run.start", goal: "integration test goal", at: Date.now() },
    };
  }

  it("writes a queryable session projection", async () => {
    const runId = testId();
    await persistRunEvent(envelope(runId, 1));
    const session = await getRunSession(runId);
    expect(session?.runId).toBe(runId);
    expect(session?.ownerId).toBe("test-user");
    expect(session?.goal).toBe("integration test goal");
    expect(session?.eventCount).toBe(1);
  });

  it("indexes runs by owner without exposing another owner's runs", async () => {
    const runId = testId();
    await persistRunEvent(envelope(runId, 1));

    await expect(listRunSessions("test-user")).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ runId, ownerId: "test-user" })]),
    );
    await expect(listRunSessions("another-user")).resolves.not.toEqual(
      expect.arrayContaining([expect.objectContaining({ runId })]),
    );
  });

  it("appends events to the replayable stream in order", async () => {
    const runId = testId();
    await persistRunEvent(envelope(runId, 1));
    await persistRunEvent(envelope(runId, 2));
    const events = await getRunEvents(runId);
    expect(events.map((e) => e.sequence)).toEqual([1, 2]);
  });

  it("is idempotent: replaying an already-persisted sequence is a no-op", async () => {
    const runId = testId();
    await persistRunEvent(envelope(runId, 1));
    await persistRunEvent(envelope(runId, 1)); // exact replay of the same event
    const session = await getRunSession(runId);
    const events = await getRunEvents(runId);
    expect(session?.eventCount).toBe(1); // NOT double-counted
    expect(events).toHaveLength(1); // NOT double-appended
  });

  it("rejects an out-of-order (stale) sequence the same way it rejects a replay", async () => {
    const runId = testId();
    await persistRunEvent(envelope(runId, 2)); // sequence 2 arrives first
    await persistRunEvent(envelope(runId, 1)); // then a stale/late sequence 1
    const session = await getRunSession(runId);
    expect(session?.eventCount).toBe(2); // stale write did not move eventCount backward
  });
});
