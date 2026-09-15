import { describe, expect, it, vi } from "vitest";
import {
  MAX_SOCKET_ATTEMPTS,
  openRunSocketLane,
  retryDelayMs,
  runSocketUrl,
  toRunFrame,
  type RunSocket,
} from "./wsTransport";

const RUN_ID = "9f1b6c2a-0000-4000-8000-000000000001";

class FakeSocket implements RunSocket {
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(readonly url: string) {}
  close() {}
}

describe("runSocketUrl", () => {
  it("adds the runId filter the telemetry hub subscribes with", () => {
    expect(runSocketUrl("wss://telemetry.example.com/ws", RUN_ID)).toBe(
      `wss://telemetry.example.com/ws?runId=${RUN_ID}`,
    );
  });
});

describe("toRunFrame", () => {
  it("reads the telemetry WebSocket frame shape", () => {
    expect(
      toRunFrame({
        version: 1,
        runId: RUN_ID,
        sequence: 7,
        occurredAt: 1,
        kind: "agent.token",
        event: { kind: "agent.token", id: "agent-t1", delta: "hi" },
      }),
    ).toEqual({ sequence: 7, event: { kind: "agent.token", id: "agent-t1", delta: "hi" } });
  });

  it("reads a stored Redis envelope from the replay endpoint", () => {
    expect(
      toRunFrame({
        version: 1,
        id: `${RUN_ID}:3`,
        runId: RUN_ID,
        sequence: 3,
        occurredAt: 1,
        ownerId: "user-1",
        event: { kind: "plan.token", delta: "x" },
      }),
    ).toEqual({ sequence: 3, event: { kind: "plan.token", delta: "x" } });
  });

  it("treats a bare event as unsequenced rather than rejecting it", () => {
    expect(toRunFrame({ kind: "error", message: "boom" })).toEqual({
      sequence: 0,
      event: { kind: "error", message: "boom" },
    });
  });

  it("rejects anything that is not an event", () => {
    expect(toRunFrame({ sequence: 4 })).toBeNull();
    expect(toRunFrame("agent.token")).toBeNull();
    expect(toRunFrame(null)).toBeNull();
  });
});

describe("retryDelayMs", () => {
  it("grows exponentially, stays capped, and never returns a fixed delay", () => {
    const lowJitter = (attempt: number) => retryDelayMs(attempt, () => 0);
    const highJitter = (attempt: number) => retryDelayMs(attempt, () => 1);

    expect(lowJitter(0)).toBe(250);
    expect(highJitter(0)).toBe(500);
    expect(highJitter(3)).toBe(4_000);
    // Capped: attempt 20 would be minutes away without the ceiling.
    expect(highJitter(20)).toBe(8_000);
    expect(lowJitter(20)).toBe(4_000);
  });
});

describe("openRunSocketLane", () => {
  it("reports every drop and reconnects on a jittered backoff until it gives up", () => {
    const sockets: FakeSocket[] = [];
    const retries: number[] = [];
    const down: string[] = [];
    const pending: Array<() => void> = [];

    openRunSocketLane({
      url: "wss://telemetry.example.com/ws",
      runId: RUN_ID,
      onOpen: () => {},
      onFrame: () => {},
      onDown: (reason) => down.push(reason),
      signal: new AbortController().signal,
      createSocket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      schedule: (run, delayMs) => {
        retries.push(delayMs);
        pending.push(run);
      },
      random: () => 1,
    });

    for (let attempt = 0; attempt <= MAX_SOCKET_ATTEMPTS; attempt += 1) {
      sockets.at(-1)?.onclose?.();
      pending.shift()?.();
    }

    expect(down).toHaveLength(MAX_SOCKET_ATTEMPTS + 1);
    expect(retries).toEqual([500, 1_000, 2_000, 4_000, 8_000, 8_000]);
    // One connect for the initial attempt plus one per scheduled retry.
    expect(sockets).toHaveLength(MAX_SOCKET_ATTEMPTS + 1);
  });

  it("counts an error immediately followed by a close as one drop", () => {
    const onDown = vi.fn();
    let socket: FakeSocket | undefined;

    openRunSocketLane({
      url: "wss://telemetry.example.com/ws",
      runId: RUN_ID,
      onOpen: () => {},
      onFrame: () => {},
      onDown,
      signal: new AbortController().signal,
      createSocket: (url) => (socket = new FakeSocket(url)),
      schedule: () => {},
      random: () => 0.5,
    });

    socket?.onerror?.();
    socket?.onclose?.();

    expect(onDown).toHaveBeenCalledTimes(1);
  });

  it("stops connecting once the run is aborted", () => {
    const controller = new AbortController();
    const createSocket = vi.fn((url: string) => new FakeSocket(url));
    const pending: Array<() => void> = [];
    let socket: FakeSocket | undefined;

    openRunSocketLane({
      url: "wss://telemetry.example.com/ws",
      runId: RUN_ID,
      onOpen: () => {},
      onFrame: () => {},
      onDown: () => {},
      signal: controller.signal,
      createSocket: (url) => {
        const created = new FakeSocket(url);
        socket = created;
        createSocket(url);
        return created;
      },
      schedule: (run) => pending.push(run),
      random: () => 0.5,
    });

    socket?.onclose?.();
    controller.abort();
    pending.shift()?.();

    expect(createSocket).toHaveBeenCalledTimes(1);
  });
});
