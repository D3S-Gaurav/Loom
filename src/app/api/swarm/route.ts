import {
  assertInfrastructureReady,
  InfrastructureUnavailableError,
} from "@/lib/swarm/infrastructure";
import { enforceRunRateLimit, rateLimitKey, RateLimitError } from "@/lib/swarm/rateLimit";
import { getRequestSession } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/repository";
import { maxRunAllowance, runAllowance } from "@/lib/billing/plans";
import { launchSwarm } from "@/lib/swarm/launch";
import {
  hasTrustedOrigin,
  readJsonBody,
  requestErrorResponse,
} from "@/lib/http/request";
import {
  buildAttachmentContext,
  MAX_SWARM_REQUEST_BYTES,
  parseSwarmRequest,
  SwarmAttachmentError,
} from "@/lib/swarm/request";
import { ImageStorageUnavailableError, storeSwarmImage } from "@/lib/media/cloudinary";
import { describeSwarmImage } from "@/lib/swarm/run";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const authSession = await getRequestSession(req);
  if (!authSession) {
    return Response.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!hasTrustedOrigin(req)) {
    return Response.json({ error: "Origin not allowed." }, { status: 403 });
  }

  let input;
  try {
    input = parseSwarmRequest(await readJsonBody(req, MAX_SWARM_REQUEST_BYTES));
  } catch (error) {
    const response = requestErrorResponse(error);
    if (response) return response;
    if (error instanceof SwarmAttachmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: "Invalid swarm request." }, { status: 400 });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    // API keys stay server-side in Next.js route handlers. Never expose this
    // key from a client component.
    return new Response(JSON.stringify({ error: "OPENROUTER_API_KEY is not set on the server." }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  try {
    // Redis and Kafka are both part of the run contract. A launch is rejected
    // if either durable event dependency is unavailable.
    await assertInfrastructureReady();
  } catch (error) {
    const health = error instanceof InfrastructureUnavailableError ? error.health : undefined;
    return new Response(
      JSON.stringify({
        error: "Required swarm infrastructure is unavailable.",
        dependencies: health
          ? { kafka: health.kafka.ok ? "up" : "down", redis: health.redis.ok ? "up" : "down" }
          : undefined,
      }),
      {
        status: 503,
        headers: { "content-type": "application/json", "retry-after": "5" },
      },
    );
  }

  try {
    const plan = await getUserPlan(authSession.user.id);
    const allowance = runAllowance(plan);
    await enforceRunRateLimit({
      totalKey: rateLimitKey("runs", authSession.user.id),
      totalLimit: allowance.limit,
      maxKey: rateLimitKey("runs:max", authSession.user.id),
      maxLimit: maxRunAllowance(plan).limit,
      isMax: input.mode === "max",
      windowSeconds: allowance.windowSeconds,
    });
  } catch (e) {
    if (e instanceof RateLimitError) {
      return new Response(JSON.stringify({ error: e.message, retryAfterSeconds: e.retryAfterSeconds }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(e.retryAfterSeconds),
        },
      });
    }
    return new Response(JSON.stringify({ error: "Rate limiter unavailable." }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  }

  const runId = crypto.randomUUID();
  let attachmentContext: string | undefined;
  try {
    attachmentContext = await buildAttachmentContext(
      input.attachments,
      req.signal,
      async (image, signal) => {
        await storeSwarmImage({
          dataUrl: image.dataUrl,
          ownerId: authSession.user.id,
          runId,
        });
        return describeSwarmImage({
          name: image.name,
          mediaType: image.mediaType,
          dataUrl: image.dataUrl,
          signal,
        });
      },
    );
  } catch (error) {
    if (error instanceof SwarmAttachmentError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof ImageStorageUnavailableError) {
      return Response.json({ error: "Image storage is unavailable." }, { status: 503 });
    }
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error("Unable to prepare swarm attachments", error);
    return Response.json({ error: "Unable to prepare attachments." }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const streamAbort = new AbortController();
  const executionSignal = AbortSignal.any([req.signal, streamAbort.signal]);
  let running;
  try {
    running = await launchSwarm({
      runId,
      ownerId: authSession.user.id,
      goal: input.goal,
      context: attachmentContext,
      mode: input.mode,
      signal: executionSignal,
    });
  } catch (error) {
    console.error(`Unable to start swarm ${runId}`, error);
    return Response.json(
      { error: "Unable to start swarm. Please try again." },
      { status: 503, headers: { "retry-after": "5" } },
    );
  }

  let cancelled = false;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const envelope of running.events) {
          if (cancelled) break;
          // Server-Sent Events frame format. The blank line terminates one event.
          // The frame carries the run sequence because the browser may also be
          // reading the same run from the telemetry WebSocket; the sequence is
          // what lets it de-duplicate across the two transports.
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ sequence: envelope.sequence, event: envelope.event })}\n\n`,
            ),
          );
        }
      } catch (e) {
        console.error(`Swarm event stream ${runId} failed`, e);
        if (!cancelled) {
          // sequence 0 marks a frame that was never persisted, so the client
          // applies it without touching its de-duplication cursor.
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                sequence: 0,
                event: { kind: "error", message: "The live event stream was interrupted." },
              })}\n\n`,
            ),
          );
        }
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
      streamAbort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      // text/event-stream tells the browser/client this is a long-lived SSE stream.
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-loom-run-id": runId,
      "x-loom-execution-mode": running.mode,
    },
  });
}
