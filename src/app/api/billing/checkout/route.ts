import { getRequestSession } from "@/lib/auth";
import { startProCheckout } from "@/lib/billing/service";
import { hasTrustedOrigin } from "@/lib/http/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getRequestSession(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!hasTrustedOrigin(req)) return Response.json({ error: "Origin not allowed." }, { status: 403 });

  try {
    return Response.json({ url: await startProCheckout(session.user) });
  } catch (error) {
    console.error("Unable to create Stripe Checkout session", error);
    return Response.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
  }
}
