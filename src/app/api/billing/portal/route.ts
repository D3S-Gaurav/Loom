import { getRequestSession } from "@/lib/auth";
import { BillingNotFoundError, createBillingPortal } from "@/lib/billing/service";
import { hasTrustedOrigin } from "@/lib/http/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await getRequestSession(req);
  if (!session) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!hasTrustedOrigin(req)) return Response.json({ error: "Origin not allowed." }, { status: 403 });

  try {
    return Response.json({ url: await createBillingPortal(session.user.id) });
  } catch (error) {
    if (error instanceof BillingNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    console.error("Unable to create Stripe Customer Portal session", error);
    return Response.json({ error: "Billing is temporarily unavailable." }, { status: 503 });
  }
}
