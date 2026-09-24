import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSwarm } from "../store";
import { consumeRunStream, createRunEventGate, type RunTransport } from "./runStream";
import type { RunFrame, RunSocket } from "./wsTransport";
import type { SwarmEvent } from "./types";

const RUN_ID = "9f1b6c2a-0000-4000-8000-000000000001";
const SOCKET_URL = "ws://telemetry.test:9091/ws";

const EVENTS: SwarmEvent[] = [
  { kind: "run.start", goal: "Ship the launch plan", at: 1 },
  { kind: "plan.token", delta: "decomposing" },
  {
    kind: "plan.done",
    plan: { goal: "Ship the launch plan", summary: "One research pass", tasks: [], synthesisBrief: "" },
  },
  {
    kind: "agent.spawn",
    id: "agent-t1",
    agentType: "researcher",
    taskId: "t1",
    title: "Research",
    dependsOn: [],
  },
  { kind: "agent.token", id: "agent-t1", delta: "hello " },
  { kind: "agent.token", id: "agent-t1", delta: "world" },
  { kind: "agent.status", id: "agent-t1", status: "done" },
  { kind: "run.done", final: "# Launch plan", tokensIn: 10, tokensOut: 20, ms: 1234 },
];

const FRAMES: RunFrame[] = EVENTS.map((event, index) => ({ sequence: index + 1, event }));

/** Everything the reducer projects from a run, transport-independent. */
function projection() {
  const state = useSwarm.getState();
  return {
    runStatus: state.runStatus,
    planSummary: state.planSummary,
    planThinking: state.planThinking,
    agents: state.agents,
    order: state.order,
    edges: state.edges,
    final: state.final,
    stats: state.stats,
    error: state.error,
  };
}

function sseSource() {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  return {
    stream,
    push(frame: RunFrame) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
    },
    close() {
      controller.close();
    },
  };
}

class FakeSocket implements RunSocket {
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: unknown }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  close() {
    this.closed = true;
  }

  open() {
    this.onopen?.();
  }

  deliver(frame: RunFrame) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  drop() {
    this.onclose?.();
  }
}

/** Lets queued microtasks and the awaited backfill promises settle. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createRunEventGate", () => {
  const applied: SwarmEvent[] = [];
  const apply = (event: SwarmEvent) => {
    applied.push(event);
  };

  beforeEach(() => {
    applied.length = 0;
  });

  it("backfills once from the durable log when the mirror drops a sequence", async () => {
    const backfill = vi.fn(async () => FRAMES.slice(1, 3));
    const gate = createRunEventGate({ apply, backfill });

    gate.accept(FRAMES[0]);
    // Kafka publish failures are swallowed (bus.ts), so sequences 2 and 3 can be
    // missing from the socket while Redis still holds them.
    gate.accept(FRAMES[3]);
    gate.accept(FRAMES[4]);
    await flush();

    expect(backfill).toHaveBeenCalledTimes(1);
    expect(applied).toEqual(EVENTS.slice(0, 5));
    expect(gate.lastSequence()).toBe(5);
  });

  it("ignores an already applied sequence instead of replaying it", async () => {
    const backfill = vi.fn(async () => FRAMES);
    const gate = createRunEventGate({ apply, backfill });

    gate.accept(FRAMES[0]);
    gate.accept(FRAMES[0]);
    gate.accept(FRAMES[1]);
    gate.accept(FRAMES[1]);
    // A full durable replay overlaps everything already applied.
    await gate.resync();

    expect(backfill).toHaveBeenCalledTimes(1);
    expect(applied).toEqual(EVENTS);
    expect(applied.filter((event) => event.kind === "plan.token")).toHaveLength(1);
  });

  it("pages through the durable log until it has caught up with the live lane", async () => {
    // A long run is tens of thousands of token events; one replay page would
    // leave the client permanently behind and re-trigger on every later frame.
    const backfill = vi.fn(async (afterSequence: number) =>
      FRAMES.slice(afterSequence, afterSequence + 2),
    );
    const gate = createRunEventGate({ apply, backfill });

    gate.accept(FRAMES[6]);
    await flush();

    expect(backfill.mock.calls.map(([after]) => after)).toEqual([0, 2, 4]);
    expect(gate.lastSequence()).toBe(7);
    expect(applied).toEqual(EVENTS.slice(0, 7));
  });

  it("applies an unsequenced frame without moving the de-duplication cursor", () => {
    const gate = createRunEventGate({ apply, backfill: vi.fn(async () => []) });

    gate.accept({ sequence: 0, event: { kind: "error", message: "stream interrupted" } });

    expect(applied).toEqual([{ kind: "error", message: "stream interrupted" }]);
    expect(gate.lastSequence()).toBe(0);
  });
});

describe("consumeRunStream", () => {
  beforeEach(() => {
    useSwarm.getState().reset("Ship the launch plan");
  });

  it("projects the same store state from WebSocket frames as from SSE frames", async () => {
    const source = sseSource();
    for (const frame of FRAMES) source.push(frame);
    source.close();

    await consumeRunStream({
      runId: RUN_ID,
      body: source.stream,
      apply: useSwarm.getState().apply,
      onTransport: () => {},
      websocketUrl: null,
      signal: new AbortController().signal,
    });
    const overSse = projection();

    useSwarm.getState().reset("Ship the launch plan");
    const socketSource = sseSource();
    let socket: FakeSocket | undefined;
    const streaming = consumeRunStream({
      runId: RUN_ID,
      body: socketSource.stream,
      apply: useSwarm.getState().apply,
      onTransport: () => {},
      websocketUrl: SOCKET_URL,
      backfill: async () => [],
      createSocket: (url) => (socket = new FakeSocket(url)),
      // No timers: this test exercises a socket that stays up.
      schedule: () => {},
      signal: new AbortController().signal,
    });

    socket?.open();
    await flush();
    for (const frame of FRAMES) socket?.deliver(frame);
    await flush();
    socketSource.close();
    await streaming;

    expect(socket?.url).toBe(`${SOCKET_URL}?runId=${RUN_ID}`);
    expect(projection()).toEqual(overSse);
  });

  it("falls back to SSE when the socket cannot be opened", async () => {
    const transports: RunTransport[] = [];
    const source = sseSource();
    for (const frame of FRAMES) source.push(frame);
    source.close();

    await consumeRunStream({
      runId: RUN_ID,
      body: source.stream,
      apply: useSwarm.getState().apply,
      onTransport: (transport) => transports.push(transport),
      websocketUrl: SOCKET_URL,
      backfill: async () => [],
      createSocket: () => {
        throw new Error("connection refused");
      },
      schedule: () => {},
      signal: new AbortController().signal,
    });

    expect(transports).toEqual(["sse"]);
    expect(useSwarm.getState().runStatus).toBe("done");
    expect(useSwarm.getState().agents["agent-t1"].output).toBe("hello world");
  });

  it("hands over when a socket hangs mid-handshake but leaves a live one alone", async () => {
    const transports: RunTransport[] = [];
    const deadlines: Array<() => void> = [];
    const source = sseSource();
    let socket: FakeSocket | undefined;

    const streaming = consumeRunStream({
      runId: RUN_ID,
      body: source.stream,
      apply: useSwarm.getState().apply,
      onTransport: (transport) => transports.push(transport),
      websocketUrl: SOCKET_URL,
      backfill: async () => [],
      createSocket: (url) => (socket = new FakeSocket(url)),
      schedule: (run) => deadlines.push(run),
      signal: new AbortController().signal,
    });

    // A socket that accepts TCP and never upgrades: nothing has been reported
    // yet, so the deadline is what unblocks the UI.
    expect(deadlines).toHaveLength(1);
    deadlines[0]();
    expect(transports).toEqual(["sse"]);

    // The same deadline must never knock over a socket that did open.
    socket?.open();
    await flush();
    deadlines[0]();
    expect(transports).toEqual(["sse", "websocket"]);

    source.close();
    await streaming;
  });

  it("hands the run back to SSE when a live socket drops, backfilling the hole", async () => {
    const transports: RunTransport[] = [];
    const source = sseSource();
    let socket: FakeSocket | undefined;
    const backfill = vi.fn(async () => FRAMES);

    const streaming = consumeRunStream({
      runId: RUN_ID,
      body: source.stream,
      apply: useSwarm.getState().apply,
      onTransport: (transport) => transports.push(transport),
      websocketUrl: SOCKET_URL,
      backfill,
      createSocket: (url) => (socket = new FakeSocket(url)),
      schedule: () => {},
      signal: new AbortController().signal,
    });

    socket?.open();
    await flush();
    for (const frame of FRAMES.slice(0, 2)) socket?.deliver(frame);
    await flush();

    // The socket dies mid-run. Everything after this only ever reaches the
    // browser through the SSE lane plus the durable replay.
    socket?.drop();
    for (const frame of FRAMES) source.push(frame);
    source.close();
    await streaming;

    expect(transports).toEqual(["websocket", "sse"]);
    expect(socket?.closed).toBe(true);
    // Sequences 3-8 never reached the socket, so the durable replay is what put
    // them on screen; the SSE frames that follow are de-duplicated away.
    expect(backfill).toHaveBeenCalled();
    expect(useSwarm.getState().runStatus).toBe("done");
    expect(useSwarm.getState().agents["agent-t1"].output).toBe("hello world");
    expect(useSwarm.getState().final).toBe("# Launch plan");
  });
});
