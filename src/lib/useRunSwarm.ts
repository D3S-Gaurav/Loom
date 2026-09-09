"use client";

import { useCallback, useRef } from "react";
import { useSwarm } from "./store";
import { consumeRunStream } from "./swarm/runStream";
import { configuredWebSocketUrl } from "./swarm/wsTransport";
import type { SwarmAttachment, SwarmMode } from "./swarm/request";

/**
 * Starts a run and feeds every event into the store.
 *
 * Starting stays an HTTP POST: it carries the auth session, consumes the rate
 * limit and validates the body. Only the live event stream is transport-agnostic
 * — `consumeRunStream` prefers the telemetry WebSocket and falls back to the SSE
 * response, feeding both into the same store reducer.
 */
export function useRunSwarm() {
  const reset = useSwarm((s) => s.reset);
  const setRunId = useSwarm((s) => s.setRunId);
  const setTransport = useSwarm((s) => s.setTransport);
  const apply = useSwarm((s) => s.apply);
  const abortRef = useRef<AbortController | null>(null);

  return useCallback(
    async (goal: string, attachments: SwarmAttachment[] = [], mode: SwarmMode = "auto") => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      reset(goal);

      let res: Response;
      try {
        res = await fetch("/api/swarm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ goal, attachments, mode }),
          signal: ctrl.signal,
        });
      } catch (e) {
        apply({ kind: "error", message: (e as Error).message });
        return;
      }

      if (!res.ok || !res.body) {
        const msg = await res.json().catch(() => ({ error: "Request failed" }));
        apply({ kind: "error", message: msg.error ?? `HTTP ${res.status}` });
        return;
      }

      const runId = res.headers.get("x-loom-run-id");
      if (runId) setRunId(runId);

      await consumeRunStream({
        runId,
        body: res.body,
        apply,
        onTransport: setTransport,
        websocketUrl: configuredWebSocketUrl(),
        signal: ctrl.signal,
      });
    },
    [reset, setRunId, setTransport, apply],
  );
}
