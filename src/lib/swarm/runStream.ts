import type { SwarmEvent } from "./types";
import {
  openRunSocketLane,
  toRunFrame,
  type RunFrame,
  type RunSocketFactory,
} from "./wsTransport";

/** Which transport is currently painting the graph. Surfaced in the UI. */
export type RunTransport = "websocket" | "sse";

/** How long the socket gets to complete its handshake before SSE takes over. */
const SOCKET_OPEN_DEADLINE_MS = 3_000;

export interface RunEventGate {
  accept(frame: RunFrame): void;
  /** Replays the durable log and applies whatever the live lane has not. */
  resync(): Promise<void>;
  lastSequence(): number;
}

export interface RunEventGateOptions {
  apply: (event: SwarmEvent) => void;
  /** Reads the durable stream from `afterSequence` onwards, one page at a time. */
  backfill: (afterSequence: number) => Promise<RunFrame[]>;
  onBackfill?: (reason: "gap" | "handover") => void;
}

/**
 * Bound on one replay. The Redis stream is capped at 10k events
 * (LOOM_RUN_EVENT_STREAM_MAX_LENGTH) and a page is 1k, so this cannot be hit
 * by a legitimate run — it exists so a misbehaving endpoint cannot spin here.
 */
const MAX_REPLAY_PAGES = 20;

/**
 * The single event path both transports feed. Its whole job is to reconcile a
 * best-effort mirror with a durable log.
 *
 * Redis is the source of truth: `bus.ts` swallows a failed Kafka publish on
 * purpose, so a run can succeed with an event that never reached Kafka and
 * therefore never reached the WebSocket. A socket consumer can also simply join
 * late — the telemetry hub only forwards what arrives after you subscribe.
 *
 * Both look identical from here: a sequence arrives that is not the one expected
 * next. The answer is the same in both cases — replay `GET /api/swarm/[runId]`,
 * which reads the Redis stream, and let the sequence de-duplicate the overlap.
 * The socket is a latency optimisation over the durable log, never a substitute
 * for it.
 */
export function createRunEventGate(options: RunEventGateOptions): RunEventGate {
  let lastApplied = 0;
  let inFlight: Promise<void> | null = null;
  const pending = new Map<number, SwarmEvent>();

  const drain = () => {
    let next = pending.get(lastApplied + 1);
    while (next) {
      pending.delete(lastApplied + 1);
      lastApplied += 1;
      options.apply(next);
      next = pending.get(lastApplied + 1);
    }
  };

  const replay = async () => {
    // The replay endpoint is paginated. A long run can be tens of thousands of
    // token events, so a single page would leave the client permanently behind
    // the socket and re-trigger a replay on every frame that follows.
    for (let page = 0; page < MAX_REPLAY_PAGES; page += 1) {
      const before = lastApplied;
      for (const frame of await options.backfill(lastApplied)) {
        if (frame.sequence > lastApplied) pending.set(frame.sequence, frame.event);
      }
      drain();
      // Nothing new means the durable log has no more to give; an empty buffer
      // means the live lane has already been caught up with.
      if (lastApplied === before || pending.size === 0) return;
    }
  };

  const resync = (reason: "gap" | "handover") => {
    // One replay at a time. A burst of out-of-order frames is one hole in the
    // mirror, not one hole per frame.
    if (inFlight) return inFlight;
    options.onBackfill?.(reason);
    inFlight = replay()
      .catch(() => {
        // A failed replay is not terminal: the live lanes keep delivering and
        // the next gap, lane handover, or end-of-run replay tries again.
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return {
    lastSequence: () => lastApplied,
    accept(frame) {
      // Sequence 0 is a frame the server never persisted, so there is nothing to
      // de-duplicate it against and nothing to replay it from.
      if (frame.sequence <= 0) {
        options.apply(frame.event);
        return;
      }
      // Already applied — a replayed or double-delivered event is a no-op, which
      // mirrors the server-side guarantee from the deterministic `sequence-0`
      // Redis stream id.
      if (frame.sequence <= lastApplied) return;

      pending.set(frame.sequence, frame.event);
      if (frame.sequence === lastApplied + 1) {
        drain();
        return;
      }
      void resync("gap");
    },
    resync: () => resync("handover"),
  };
}

/** Durable replay endpoint over the Redis-backed run stream. */
export async function fetchRunBackfill(runId: string, afterSequence = 0): Promise<RunFrame[]> {
  const response = await fetch(
    `/api/swarm/${encodeURIComponent(runId)}?after=${afterSequence}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Run replay failed with HTTP ${response.status}`);
  const payload = (await response.json()) as { events?: unknown };
  if (!Array.isArray(payload.events)) return [];
  return payload.events.flatMap((entry) => {
    const frame = toRunFrame(entry);
    return frame ? [frame] : [];
  });
}

export interface RunStreamOptions {
  /** From the `x-loom-run-id` response header. Without it there is no socket. */
  runId: string | null;
  /** The `POST /api/swarm` response body: the SSE lane. */
  body: ReadableStream<Uint8Array>;
  apply: (event: SwarmEvent) => void;
  onTransport: (transport: RunTransport) => void;
  backfill?: (runId: string, afterSequence: number) => Promise<RunFrame[]>;
  websocketUrl?: string | null;
  signal: AbortSignal;
  createSocket?: RunSocketFactory;
  schedule?: (run: () => void, delayMs: number) => void;
  random?: () => number;
  maxAttempts?: number;
}

function parseSseChunk(chunk: string): RunFrame | null {
  const line = chunk.trim();
  if (!line.startsWith("data:")) return null;
  try {
    return toRunFrame(JSON.parse(line.slice(5).trim()));
  } catch {
    // Ignore partial or malformed frames.
    return null;
  }
}

/**
 * Runs one swarm's live event stream over both lanes and resolves when the run's
 * event stream ends.
 *
 * The POST response is held open for the whole run even while the socket is the
 * one being rendered, for two reasons. In `direct` execution mode that response
 * *is* the run's lifeline — cancelling it aborts the swarm (`route.ts` `cancel`).
 * And keeping it drained makes falling back a switch rather than a new request,
 * with no server-side buffering of an unread stream.
 */
export async function consumeRunStream(options: RunStreamOptions): Promise<void> {
  const runId = options.runId;
  const socketUrl = runId ? options.websocketUrl ?? null : null;
  const backfill = options.backfill ?? fetchRunBackfill;

  const gate = createRunEventGate({
    apply: options.apply,
    backfill: (afterSequence) => (runId ? backfill(runId, afterSequence) : Promise.resolve([])),
  });

  // Until the socket is proven live, SSE renders. It only stays dark while a
  // configured socket is still shaking hands, and any events missed in that
  // window are recovered by the replay that every lane handover performs.
  let sseActive = socketUrl === null;
  let usedSocket = false;
  let stopSocket = () => {};

  if (sseActive) options.onTransport("sse");

  const fallBackToSse = () => {
    if (sseActive) return;
    sseActive = true;
    options.onTransport("sse");
    // The SSE lane is further ahead than the socket got, so the switch itself
    // looks exactly like a dropped mirror event: reconcile against Redis.
    void gate.resync();
  };

  if (socketUrl && runId) {
    const schedule = options.schedule ?? ((run: () => void, delayMs: number) => {
      setTimeout(run, delayMs);
    });
    stopSocket = openRunSocketLane({
      url: socketUrl,
      runId,
      signal: options.signal,
      createSocket: options.createSocket,
      schedule: options.schedule,
      random: options.random,
      maxAttempts: options.maxAttempts,
      onOpen: () => {
        usedSocket = true;
        sseActive = false;
        options.onTransport("websocket");
        // The hub only forwards events published after this subscription, so
        // everything before it exists solely in Redis. Every run therefore
        // starts with a replay; the socket only ever carries the tail.
        void gate.resync();
      },
      onFrame: (frame) => {
        if (!sseActive) gate.accept(frame);
      },
      onDown: fallBackToSse,
    });
    // A socket that is refused fires onDown in milliseconds. A socket that hangs
    // mid-handshake — a proxy that accepts TCP and never upgrades — would
    // otherwise leave the graph blank, so the deadline hands over on its own.
    // It only ever fires for a socket that has never opened; a live one is left
    // alone, and a socket that opens later still takes the run back.
    schedule(() => {
      if (!usedSocket) fallBackToSse();
    }, SOCKET_OPEN_DEADLINE_MS);
  }

  const reader = options.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";
      for (const chunk of chunks) {
        const frame = parseSseChunk(chunk);
        // The socket lane is rendering, so these frames are drained and dropped:
        // applying both would double every token. Reading them anyway is what
        // keeps the response flowing and the fallback instant.
        if (frame && sseActive) gate.accept(frame);
      }
    }
  } catch (error) {
    if (!options.signal.aborted) throw error;
  } finally {
    stopSocket();
  }

  // The durable stream has ended. If the socket was carrying the run, one last
  // replay guarantees the terminal run.done/error landed even if the Kafka
  // mirror lost it.
  if (usedSocket && !options.signal.aborted) await gate.resync();
}
