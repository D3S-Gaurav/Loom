import { processStripeEvent, verifyStripeWebhook } from "@/lib/billing/service";
import { readBodyBytes, requestErrorResponse } from "@/lib/http/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event;
  try {
    // Stripe signs the exact raw payload. Parsing JSON before verification would
    // change the bytes and remove the authenticity guarantee.
    const payload = await readBodyBytes(req, 1024 * 1024);
    event = verifyStripeWebhook(new TextDecoder("utf-8", { fatal: true }).decode(payload), signature);
  } catch (error) {
    const response = requestErrorResponse(error);
    if (response) return response;
    return Response.json({ error: "Invalid Stripe signature or payload." }, { status: 400 });
  }

  try {
    await processStripeEvent(event);
    return Response.json({ received: true });
  } catch (error) {
    console.error(`Stripe webhook ${event.id} failed`, error);
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
