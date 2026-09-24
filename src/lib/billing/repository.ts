import type Stripe from "stripe";
import { database } from "../database";
import { PRO_SUBSCRIPTION_STATUSES, type BillingPlan } from "./plans";

interface BillingRow {
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: string;
  current_period_end: Date | null;
}

export interface BillingState {
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
  status: string;
  currentPeriodEnd: Date | null;
}

interface StripeEventInput {
  eventId: string;
  eventType: string;
  eventCreated: number;
  subscription: Stripe.Subscription;
  explicitUserId?: string;
}

function toState(row?: BillingRow): BillingState {
  return {
    customerId: row?.stripe_customer_id ?? null,
    subscriptionId: row?.stripe_subscription_id ?? null,
    priceId: row?.stripe_price_id ?? null,
    status: row?.status ?? "free",
    currentPeriodEnd: row?.current_period_end ?? null,
  };
}

export async function getBillingState(userId: string) {
  const result = await database.query<BillingRow>(
    `select stripe_customer_id, stripe_subscription_id, stripe_price_id, status, current_period_end
       from billing_subscription
      where user_id = $1`,
    [userId],
  );
  return toState(result.rows[0]);
}

export async function getUserPlan(userId: string): Promise<BillingPlan> {
  const state = await getBillingState(userId);
  return hasProAccess(state, process.env.STRIPE_PRO_PRICE_ID) ? "pro" : "free";
}

export function hasProAccess(
  state: BillingState,
  configuredPrice = process.env.STRIPE_PRO_PRICE_ID,
  now = new Date(),
) {
  if (!configuredPrice || !state.currentPeriodEnd) return false;
  return (
    PRO_SUBSCRIPTION_STATUSES.has(state.status) &&
    state.priceId === configuredPrice &&
    state.currentPeriodEnd > now
  );
}

export async function saveStripeCustomer(userId: string, customerId: string) {
  const result = await database.query(
    `insert into billing_subscription (user_id, stripe_customer_id)
     values ($1, $2)
     on conflict (user_id) do update
       set stripe_customer_id = excluded.stripe_customer_id,
           updated_at = now()
       where billing_subscription.stripe_customer_id is null
          or billing_subscription.stripe_customer_id = excluded.stripe_customer_id`,
    [userId, customerId],
  );
  if (result.rowCount !== 1) throw new Error("Unable to bind the Stripe customer.");
}

function customerId(customer: string | Stripe.Customer | Stripe.DeletedCustomer) {
  return typeof customer === "string" ? customer : customer.id;
}

function periodEnd(subscription: Stripe.Subscription) {
  const timestamps = subscription.items.data.map((item) => item.current_period_end);
  return timestamps.length > 0 ? new Date(Math.max(...timestamps) * 1000) : null;
}

/**
 * Stripe is the source of truth. This table is a local entitlement projection
 * used for fast request-time authorization. One transaction deduplicates each
 * Stripe event and prevents an older event from overwriting newer entitlement
 * state when webhook deliveries arrive out of order.
 */
export async function syncStripeEvent(input: StripeEventInput) {
  const { subscription } = input;
  const stripeCustomerId = customerId(subscription.customer);
  const client = await database.connect();

  try {
    await client.query("begin");
    const claimed = await client.query(
      `insert into stripe_webhook_event (event_id, event_type, event_created)
       values ($1, $2, to_timestamp($3))
       on conflict (event_id) do nothing`,
      [input.eventId, input.eventType, input.eventCreated],
    );
    if (claimed.rowCount === 0) {
      await client.query("rollback");
      return false;
    }

    const ownership = await client.query<{ user_id: string; stripe_customer_id: string | null }>(
      `select user_id, stripe_customer_id
         from billing_subscription
        where user_id = $1 or stripe_customer_id = $2
        for update`,
      [input.explicitUserId ?? "", stripeCustomerId],
    );
    const customerOwner = ownership.rows.find(
      (row) => row.stripe_customer_id === stripeCustomerId,
    );
    const explicitOwner = input.explicitUserId
      ? ownership.rows.find((row) => row.user_id === input.explicitUserId)
      : undefined;

    if (input.explicitUserId && customerOwner && customerOwner.user_id !== input.explicitUserId) {
      throw new Error(`Stripe customer ${stripeCustomerId} belongs to another Loom user.`);
    }
    if (
      input.explicitUserId &&
      explicitOwner?.stripe_customer_id &&
      explicitOwner.stripe_customer_id !== stripeCustomerId
    ) {
      throw new Error(`Loom user ${input.explicitUserId} is bound to another Stripe customer.`);
    }

    const userId = input.explicitUserId ?? customerOwner?.user_id;
    if (!userId) throw new Error(`No Loom user owns Stripe customer ${stripeCustomerId}.`);

    await client.query(
      `insert into billing_subscription (
         user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
         status, current_period_end, last_stripe_event_created
       ) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id) do update set
         stripe_customer_id = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         stripe_price_id = excluded.stripe_price_id,
         status = excluded.status,
         current_period_end = excluded.current_period_end,
         last_stripe_event_created = excluded.last_stripe_event_created,
         updated_at = now()
       where billing_subscription.last_stripe_event_created < excluded.last_stripe_event_created
          or (
            billing_subscription.last_stripe_event_created = excluded.last_stripe_event_created
            and case when excluded.status in ('active', 'trialing') then 0 else 1 end
                > case when billing_subscription.status in ('active', 'trialing') then 0 else 1 end
          )`,
      [
        userId,
        stripeCustomerId,
        subscription.id,
        subscription.items.data[0]?.price.id ?? null,
        subscription.status,
        periodEnd(subscription),
        input.eventCreated,
      ],
    );
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
