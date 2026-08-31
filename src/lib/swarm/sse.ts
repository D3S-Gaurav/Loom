import { getRunEventsAfter, getRunSession, type SwarmEventEnvelope } from "./session";

const POLL_MS = 150;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Bridges durable Redis events back to browser SSE. This lets the Temporal
 * worker live outside the HTTP process and continue after a browser disconnect.
 */
export async function* readDurableEvents(
  runId: string,
  ownerId: string,
  signal: AbortSignal,
): AsyncGenerator<SwarmEventEnvelope> {
  let sequence = 0;

  while (!signal.aborted) {
    const envelopes = await getRunEventsAfter(runId, sequence);
    for (const envelope of envelopes) {
      if (envelope.ownerId !== ownerId) throw new Error("Run ownership mismatch.");
      sequence = envelope.sequence;
      yield envelope;
    }

    const session = await getRunSession(runId);
    if (!session || session.ownerId !== ownerId) throw new Error("Run session unavailable.");
    if (session.status !== "running" && envelopes.length === 0) return;
    await wait(POLL_MS, signal);
  }
}
