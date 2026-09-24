import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function run(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function requireProductionEnv(names: string[]) {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required Production environment variables: ${missing.join(", ")}`);
  }

  const redis = new URL(process.env.REDIS_URL!);
  if (redis.protocol !== "redis:" && redis.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://.");
  }

  for (const name of ["APP_URL", "BETTER_AUTH_URL"]) {
    const url = new URL(process.env[name]!);
    if (url.protocol !== "https:") throw new Error(`${name} must use https:// in Production.`);
  }
}

// Sensitive Vercel variables are intentionally unavailable through `env pull`
// but are present inside the Production build. Run idempotent release
// migrations there before producing the deployable Next.js artifact.
if (process.env.VERCEL_ENV === "production") {
  requireProductionEnv([
    "APP_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "DATABASE_URL",
    "KAFKA_BROKERS",
    "KAFKA_PASSWORD",
    "KAFKA_SASL_MECHANISM",
    "KAFKA_SSL",
    "KAFKA_SWARM_EVENTS_TOPIC",
    "KAFKA_USERNAME",
    "OPENROUTER_API_KEY",
    "REDIS_URL",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]);
  if (!["1", "true", "yes"].includes(process.env.KAFKA_SSL!.trim().toLowerCase())) {
    throw new Error("KAFKA_SSL must be enabled for Production Kafka connections.");
  }
  run("pnpm", ["db:migrate"]);
}

run(process.execPath, [require.resolve("next/dist/bin/next"), "build"]);
