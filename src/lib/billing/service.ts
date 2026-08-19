import type Stripe from "stripe";
import {
  getBillingState,
  hasProAccess,
  saveStripeCustomer,
  syncStripeEvent,
} from "./repository";
import { PRO_SUBSCRIPTION_STATUSES } from "./plans";
import { getAppUrl, getProPriceId, getStripe } from "./stripe";

export class BillingNotFoundError extends Error {}

interface BillingUser {
  id: string;
  email: string;
  name: string;
}

export function verifyStripeWebhook(payload: string, signature: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}

export async function startProCheckout(user: BillingUser) {
  const stripe = getStripe();
  const billing = await getBillingState(user.id);
  const priceId = getProPriceId();
  if (hasProAccess(billing, priceId) || PRO_SUBSCRIPTION_STATUSES.has(billing.status)) {
    return createBillingPortal(user.id);
  }

  let customerId = billing.customerId;
  if (!customerId) {
    const customer = await stripe.customers.create(
      {
        email: user.email,
        name: user.name,
        metadata: { loomUserId: user.id },
      },
      { idempotencyKey: `loom-customer-${user.id}` },
    );
    customerId = customer.id;
    await saveStripeCustomer(user.id, customerId);
  }

  const appUrl = getAppUrl();
  const checkout = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      metadata: { loomUserId: user.id },
      subscription_data: { metadata: { loomUserId: user.id } },
      success_url: `${appUrl}/?billing=success`,
      cancel_url: `${appUrl}/?billing=cancelled`,
    },
    {
      idempotencyKey: `loom-checkout-${user.id}-${new Date().toISOString().slice(0, 13)}`,
    },
  );

  if (!checkout.url) throw new Error("Stripe did not return a Checkout URL.");
  return checkout.url;
}

function customerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer) {
  return typeof customer === "string" ? customer : customer.id;
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  return Math.max(0, ...subscription.items.data.map((item) => item.current_period_end));
}

async function currentSubscription(fallback: Stripe.Subscription) {
  const subscriptions = await getStripe().subscriptions.list({
    customer: customerId(fallback.customer),
    status: "all",
    limit: 100,
  });
  const priceId = getProPriceId();
  const now = Math.floor(Date.now() / 1000);
  const eligible = subscriptions.data
    .filter(
      (subscription) =>
        PRO_SUBSCRIPTION_STATUSES.has(subscription.status) &&
        subscription.items.data.some((item) => item.price.id === priceId) &&
        subscriptionPeriodEnd(subscription) > now,
    )
    .sort((left, right) => subscriptionPeriodEnd(right) - subscriptionPeriodEnd(left));

  return (
    eligible[0] ??
    subscriptions.data.find((subscription) => subscription.id === fallback.id) ??
    subscriptions.data.sort((left, right) => right.created - left.created)[0] ??
    fallback
  );
}

export async function createBillingPortal(userId: string) {
  const billing = await getBillingState(userId);
  if (!billing.customerId) throw new BillingNotFoundError("No billing account exists yet.");

  const portal = await getStripe().billingPortal.sessions.create({
    customer: billing.customerId,
    return_url: getAppUrl(),
    configuration: process.env.STRIPE_PORTAL_CONFIGURATION_ID || undefined,
  });
  return portal.url;
}

async function syncCheckout(event: Stripe.CheckoutSessionCompletedEvent) {
  const session = event.data.object;
  if (!session.subscription) return;
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription.id;
  const subscription = await currentSubscription(
    await getStripe().subscriptions.retrieve(subscriptionId),
  );
  const userId = session.client_reference_id ?? session.metadata?.loomUserId;
  await syncStripeEvent({
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    subscription,
    explicitUserId: userId ?? undefined,
  });
}

async function syncSubscription(
  event:
    | Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent
    | Stripe.CustomerSubscriptionDeletedEvent,
) {
  // Reconcile from Stripe's current customer state instead of trusting event
  // delivery order. An older webhook delivered after a cancellation therefore
  // cannot re-grant access from its stale embedded object.
  const subscription = await currentSubscription(event.data.object);
  await syncStripeEvent({
    eventId: event.id,
    eventType: event.type,
    eventCreated: event.created,
    subscription,
    explicitUserId:
      subscription.metadata.loomUserId || event.data.object.metadata.loomUserId || undefined,
  });
}

export async function processStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      await syncCheckout(event);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event);
      break;
    default:
      // Acknowledge unrelated events so Stripe does not retry them forever.
      break;
  }
}
