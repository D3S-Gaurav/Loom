import type { SwarmEvent } from "./types";
import { publishSwarmEvent } from "./kafka";
import { finishRunSession, persistRunEvent, type RunStatus, type SwarmEventEnvelope } from "./session";

/**
 * Async event queue that lets many parallel agents push events while a single
 * consumer (the HTTP stream) drains them in order. This is what makes concurrent
 * agent token streams interleave live in the UI.
 *
 * The iterator yields envelopes rather than bare events so the HTTP stream can
 * label every frame with its sequence. The browser runs two transports over the
 * same run, and the sequence is what lets it switch between them without
 * replaying or skipping an event.
 */
export class EventBus implements AsyncIterable<SwarmEventEnvelope> {
  private queue: SwarmEventEnvelope[] = [];
  private waiters: {
    resolve: (result: IteratorResult<SwarmEventEnvelope>) => void;
    reject: (reason: Error) => void;
  }[] = [];
  private closing = false;
  private closed = false;
  private terminalError: Error | null = null;
  private sequence = 0;
  private delivery = Promise.resolve();
  private deliveryFailure: unknown;
  private closePromise: Promise<void> | null = null;

  constructor(
    private readonly runId: string,
    private readonly ownerId: string,
    private readonly options: { localDelivery?: boolean } = {},
  ) {}

  emit(event: SwarmEvent) {
    if (this.closing || this.closed) return;
    const envelope: SwarmEventEnvelope = {
      version: 1,
      id: `${this.runId}:${++this.sequence}`,
      runId: this.runId,
      sequence: this.sequence,
      occurredAt: Date.now(),
      ownerId: this.ownerId,
      event,
    };
    // Parallel workers can emit simultaneously; serial delivery preserves their
    // local emission order in both Redis and Kafka.
    this.delivery = this.delivery.catch(() => undefined).then(() => this.deliver(envelope));
    // If the HTTP stream is already waiting for the next event, resolve it
    // immediately. Otherwise, buffer the event until a reader asks for it.
    if (this.options.localDelivery !== false) {
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve({ value: envelope, done: false });
      else this.queue.push(envelope);
    }
  }

  close(status: Exclude<RunStatus, "running"> = "completed") {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = this.finish(status);
    return this.closePromise;
  }

  private async finish(status: Exclude<RunStatus, "running">) {
    try {
      await this.delivery;
      if (this.deliveryFailure) {
        await finishRunSession(this.runId, "failed");
        throw this.deliveryFailure;
      }
      await finishRunSession(this.runId, status);
    } catch (error) {
      this.terminalError = error instanceof Error ? error : new Error(String(error));
      console.error("Required durable swarm event delivery failed", this.terminalError);
    } finally {
      this.closed = true;
      // Keep SSE open until persistence and Kafka acknowledgement complete, then
      // wake pending readers. A durability error rejects the iterator so the API
      // can send a visible terminal error to the browser.
      let waiter;
      while ((waiter = this.waiters.shift())) {
        if (this.terminalError) waiter.reject(this.terminalError);
        else waiter.resolve({ value: undefined as never, done: true });
      }
    }
    if (this.terminalError) throw this.terminalError;
  }

  private async deliver(envelope: SwarmEventEnvelope) {
    let persisted: boolean;
    try {
      // Redis is the canonical recoverable record, so losing a write here is
      // genuinely terminal: the run's history would have a hole in it.
      persisted = await persistRunEvent(envelope);
    } catch (error) {
      this.deliveryFailure ??= error;
      console.error("Failed to persist swarm event", error);
      return;
    }

    // A retried Temporal Activity can replay an already-stored sequence.
    // Skip Kafka too, otherwise Redis would be idempotent while consumers
    // still received a duplicate event.
    if (!persisted) return;

    try {
      await publishSwarmEvent(envelope);
    } catch (error) {
      // Kafka mirrors events to downstream consumers; it is not the source of
      // truth. Redis has already accepted this event, so a broker outage must
      // not fail a run the user is watching succeed — it only costs telemetry.
      console.error("Kafka mirror publish failed; run unaffected", error);
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<SwarmEventEnvelope> {
    return {
      next: () => {
        // Drain already-buffered events first.
        if (this.queue.length) return Promise.resolve({ value: this.queue.shift()!, done: false });
        if (this.closed) {
          if (this.terminalError) return Promise.reject(this.terminalError);
          return Promise.resolve({ value: undefined as never, done: true });
        }
        // No event yet: suspend the reader until emit() resolves this promise.
        return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
      },
    };
  }
}
