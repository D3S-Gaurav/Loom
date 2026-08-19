export type BillingPlan = "free" | "pro";

function positiveInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Product entitlements live here so routes and UI do not invent plan rules. */
export function runAllowance(plan: BillingPlan) {
  return {
    limit:
      plan === "pro"
        ? positiveInt("LOOM_PRO_RUNS_PER_WINDOW", 100)
        : positiveInt("LOOM_FREE_RUNS_PER_WINDOW", 3),
    windowSeconds: positiveInt("LOOM_RUN_WINDOW_SECONDS", 3600),
  };
}

export function maxRunAllowance(plan: BillingPlan) {
  return {
    limit:
      plan === "pro"
        ? positiveInt("LOOM_PRO_MAX_RUNS_PER_WINDOW", 100)
        : positiveInt("LOOM_FREE_MAX_RUNS_PER_WINDOW", 1),
    windowSeconds: positiveInt("LOOM_RUN_WINDOW_SECONDS", 3600),
  };
}

export const PRO_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
