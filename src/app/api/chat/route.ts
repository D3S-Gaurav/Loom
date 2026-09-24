import { getRequestSession } from "@/lib/auth";
import { getUserPlan } from "@/lib/billing/repository";
import { maxRunAllowance, runAllowance } from "@/lib/billing/plans";
import {
  ChatRequestError,
  MAX_CHAT_REQUEST_BYTES,
  parseChatRequest,
} from "@/lib/chat/request";
import { hasTrustedOrigin, readJsonBody, requestErrorResponse } from "@/lib/http/request";
import { runText } from "@/lib/swarm/run";
import { enforceRunRateLimit, rateLimitKey, RateLimitError } from "@/lib/swarm/rateLimit";
import { approximateTokens, boundContext } from "@/lib/swarm/tokenBudget";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getRequestSession(request);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!hasTrustedOrigin(request)) return Response.json({ error: "Origin not allowed." }, { status: 403 });

  let input;
  try {
    input = parseChatRequest(await readJsonBody(request, MAX_CHAT_REQUEST_BYTES));
  } catch (error) {
    const response = requestErrorResponse(error);
    if (response) return response;
    if (error instanceof ChatRequestError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return Response.json({ error: "Invalid chat request." }, { status: 400 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: "Chat is not configured on the server." }, { status: 503 });
  }

  try {
    const plan = await getUserPlan(session.user.id);
    const allowance = runAllowance(plan);
    await enforceRunRateLimit({
      totalKey: rateLimitKey("runs", session.user.id),
      totalLimit: allowance.limit,
      maxKey: rateLimitKey("runs:max", session.user.id),
      maxLimit: maxRunAllowance(plan).limit,
      isMax: false,
      windowSeconds: allowance.windowSeconds,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return Response.json(
        { error: error.message, retryAfterSeconds: error.retryAfterSeconds },
        { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } },
      );
    }
    return Response.json({ error: "Rate limiter unavailable." }, { status: 503 });
  }

  const transcript = boundContext(
    input.messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n"),
    24_000,
  );
  const encoder = new TextEncoder();
  const controller = new AbortController();
  const signal = AbortSignal.any([request.signal, controller.signal, AbortSignal.timeout(55_000)]);
  const startedAt = Date.now();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      try {
        const result = await runText("worker", {
          system:
            "You are Loom Chat, a concise technical collaborator. Answer the latest user message using the supplied conversation as context. Use clean Markdown, make assumptions explicit, and never claim to have run a multi-agent swarm.",
          prompt: transcript,
          maxOutputTokens: 800,
          signal,
          onDelta(delta) {
            if (!cancelled) {
              streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ kind: "delta", delta })}\n\n`));
            }
          },
        });
        if (!cancelled) {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify({
            kind: "done",
            tokensIn: approximateTokens(transcript),
            tokensOut: approximateTokens(result.text),
            ms: Date.now() - startedAt,
          })}\n\n`));
        }
      } catch (error) {
        console.error("Loom chat generation failed", error);
        if (!cancelled) {
          streamController.enqueue(encoder.encode(`data: ${JSON.stringify({ kind: "error", message: "Chat could not complete this response." })}\n\n`));
        }
      } finally {
        if (!cancelled) streamController.close();
      }
    },
    cancel() {
      cancelled = true;
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
