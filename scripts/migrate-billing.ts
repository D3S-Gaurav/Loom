import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function migrate() {
  const { database } = await import("../src/lib/database");
  const migrationLock = await database.connect();
  try {
    await migrationLock.query("select pg_advisory_lock(hashtext($1))", [
      "loom:release-migrations",
    ]);
    await database.query(`
      create table if not exists billing_subscription (
        user_id text primary key references "user" (id) on delete cascade,
        stripe_customer_id text unique,
        stripe_subscription_id text unique,
        stripe_price_id text,
        status text not null default 'free',
        current_period_end timestamptz,
        last_stripe_event_created bigint not null default 0,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists billing_subscription_status_idx
        on billing_subscription (status);

      alter table billing_subscription
        add column if not exists last_stripe_event_created bigint not null default 0;

      create table if not exists stripe_webhook_event (
        event_id text primary key,
        event_type text not null,
        event_created timestamptz not null,
        processed_at timestamptz not null default now()
      );

      create index if not exists stripe_webhook_event_processed_at_idx
        on stripe_webhook_event (processed_at);
    `);
    console.log("Billing migration is up to date.");
  } finally {
    await migrationLock
      .query("select pg_advisory_unlock(hashtext($1))", ["loom:release-migrations"])
      .catch(() => undefined);
    migrationLock.release();
    await database.end();
  }
}

migrate().catch((error) => {
  console.error("Billing migration failed:", error);
  process.exitCode = 1;
});
