import { getRunEventsAfter, getRunSession } from "@/lib/swarm/session";
import { getRequestSession } from "@/lib/auth";

export const runtime = "nodejs";

/** One page of the durable stream. A busy run emits a token event per chunk. */
const REPLAY_PAGE_SIZE = 1_000;

export async function GET(req: Request, context: { params: Promise<{ runId: string }> }) {
  const authSession = await getRequestSession(req);
  if (!authSession) return Response.json({ error: "Authentication required." }, { status: 401 });

  const { runId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return Response.json({ error: "Invalid run id." }, { status: 400 });
  }

  // `after` is the client's last applied sequence, so a browser reconciling a
  // live socket against this log asks only for the part it is missing instead of
  // re-reading a run from the beginning on every gap.
  const after = Number(new URL(req.url).searchParams.get("after") ?? "0");
  if (!Number.isInteger(after) || after < 0) {
    return Response.json({ error: "Invalid replay cursor." }, { status: 400 });
  }

  try {
    const session = await getRunSession(runId);
    if (!session || session.ownerId !== authSession.user.id) {
      return Response.json({ error: "Run not found or expired." }, { status: 404 });
    }
    return Response.json({
      session,
      events: await getRunEventsAfter(runId, after, REPLAY_PAGE_SIZE),
    });
  } catch {
    return Response.json(
      { error: "Required Redis session storage is unavailable." },
      { status: 503, headers: { "retry-after": "5" } },
    );
  }
}
