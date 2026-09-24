import type { SwarmEvent } from "./types";

/**
 * One live event as it travels to the browser.
 *
 * `sequence` is the run's monotonic position in the durable Redis stream
 * (`session.ts`). Both live transports carry it — the Go telemetry service puts
 * it on every WebSocket frame (`services/telemetry/ws.go`) and `/api/swarm`
 * repeats it on every SSE frame — because it is the only thing that makes the
 * two interchangeable. Sequence 0 means "never persisted": a purely local frame
 * such as a transport error notice, which is applied but never de-duplicated.
 */
export interface RunFrame {
  sequence: number;
  event: SwarmEvent;
}

/**
 * The slice of the browser `WebSocket` this client actually uses. Narrowing it
 * keeps the reconnect logic testable in plain Node, where a real socket would
 * need a real server.
 */
export interface RunSocket {
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((message: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export type RunSocketFactory = (url: string) => RunSocket;

const BASE_RETRY_MS = 500;
const MAX_RETRY_MS = 8_000;
/** After this many consecutive failures the socket is written off for this run. */
export const MAX_SOCKET_ATTEMPTS = 6;

/**
 * Selection rule for the whole feature: a configured telemetry URL means
 * WebSocket-first, an empty one means SSE only.
 *
 * This has to stay a literal `process.env.NEXT_PUBLIC_*` property read. Next.js
 * substitutes those at build time by matching the source text; a computed lookup
 * would simply be `undefined` in the browser bundle.
 */
export function configuredWebSocketUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL;
  const url = typeof configured === "string" ? configured.trim() : "";
  return url.length > 0 ? url : null;
}

/** Adds the `runId` filter the telemetry service uses to narrow the fan-out. */
export function runSocketUrl(base: string, runId: string): string {
  const url = new URL(base);
  url.searchParams.set("runId", runId);
  return url.toString();
}

/**
 * Capped exponential backoff with jitter. The cap stops a long outage from
 * pushing reconnects minutes apart, and the jitter stops every open tab from
 * coming back in the same millisecond after a telemetry deploy — a thundering
 * herd is how a recovering service gets knocked over a second time.
 */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** attempt);
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

export function parseSocketMessage(data: unknown): RunFrame | null {
  if (typeof data !== "string") return null;
  try {
    return toRunFrame(JSON.parse(data));
  } catch {
    return null;
  }
}

/**
 * Accepts every shape a run event arrives in: the telemetry WebSocket frame and
 * the `/api/swarm` SSE frame (`{ sequence, event }`), the stored Redis envelope
 * returned by the replay endpoint (same fields plus bookkeeping), and a bare
 * event object with no sequence at all.
 */
export function toRunFrame(value: unknown): RunFrame | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { sequence?: unknown; event?: unknown; kind?: unknown };
  const sequence = typeof record.sequence === "number" && Number.isFinite(record.sequence)
    ? record.sequence
    : 0;

  if (record.event && typeof record.event === "object") {
    const event = record.event as { kind?: unknown };
    if (typeof event.kind !== "string") return null;
    return { sequence, event: record.event as SwarmEvent };
  }
  if (typeof record.kind === "string") return { sequence, event: value as SwarmEvent };
  return null;
}

export interface RunSocketLaneOptions {
  /** Base URL from NEXT_PUBLIC_TELEMETRY_WS_URL, without the runId filter. */
  url: string;
  runId: string;
  onOpen: () => void;
  onFrame: (frame: RunFrame) => void;
  /** The socket is not delivering; the SSE lane has to take over now. */
  onDown: (reason: string) => void;
  signal: AbortSignal;
  createSocket?: RunSocketFactory;
  schedule?: (run: () => void, delayMs: number) => void;
  random?: () => number;
  maxAttempts?: number;
}

function browserSocket(url: string): RunSocket {
  if (typeof WebSocket === "undefined") throw new Error("WebSocket is unavailable.");
  return new WebSocket(url) as unknown as RunSocket;
}

/**
 * Keeps a telemetry socket connected for one run and returns a stop function.
 *
 * The lane never buffers on the caller's behalf: every open, drop and give-up is
 * reported so the caller can switch lanes and reconcile against the durable log.
 */
export function openRunSocketLane(options: RunSocketLaneOptions): () => void {
  const createSocket = options.createSocket ?? browserSocket;
  const schedule = options.schedule ?? ((run: () => void, delayMs: number) => {
    setTimeout(run, delayMs);
  });
  const random = options.random ?? Math.random;
  const maxAttempts = options.maxAttempts ?? MAX_SOCKET_ATTEMPTS;

  let attempt = 0;
  let socket: RunSocket | null = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    const current = socket;
    socket = null;
    try {
      current?.close();
    } catch {
      // A socket that refuses to close is already gone.
    }
  };

  const retire = (current: RunSocket, reason: string) => {
    // Guarded by identity, so an error immediately followed by a close (what a
    // real browser does) only costs one reconnect, not two.
    if (stopped || socket !== current) return;
    socket = null;
    try {
      current.close();
    } catch {
      // Ignore: the connection is being abandoned either way.
    }

    // Fall back immediately rather than after the retry ladder. A user must
    // never watch a frozen graph while a socket that may never come back is
    // being retried in the background.
    options.onDown(reason);
    if (attempt >= maxAttempts) return;
    const delayMs = retryDelayMs(attempt, random);
    attempt += 1;
    schedule(() => {
      if (!stopped) connect();
    }, delayMs);
  };

  const connect = () => {
    if (stopped) return;
    let current: RunSocket;
    try {
      current = createSocket(runSocketUrl(options.url, options.runId));
    } catch (error) {
      // A malformed NEXT_PUBLIC_TELEMETRY_WS_URL lands here. Report it through
      // the same path as a dropped socket so the run still renders over SSE.
      options.onDown(error instanceof Error ? error.message : "socket unavailable");
      return;
    }

    socket = current;
    current.onopen = () => {
      if (stopped || socket !== current) return;
      attempt = 0;
      options.onOpen();
    };
    current.onmessage = (message) => {
      if (stopped || socket !== current) return;
      const frame = parseSocketMessage(message.data);
      if (frame) options.onFrame(frame);
    };
    current.onerror = () => retire(current, "socket error");
    current.onclose = () => retire(current, "socket closed");
  };

  options.signal.addEventListener("abort", stop, { once: true });
  connect();
  return stop;
}
