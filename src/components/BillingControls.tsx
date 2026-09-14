"use client";

import { useState } from "react";
import type { BillingPlan } from "@/lib/billing/plans";
import { CreditCardIcon } from "./ui/Icons";

export function BillingControls({ plan }: { plan: BillingPlan }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function openBilling() {
    setLoading(true);
    setError("");
    try {
      const endpoint = plan === "pro" ? "/api/billing/portal" : "/api/billing/checkout";
      const response = await fetch(endpoint, { method: "POST" });
      const body = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !body.url) throw new Error(body.error ?? "Unable to open billing.");
      window.location.assign(body.url);
    } catch (billingError) {
      setError((billingError as Error).message);
      setLoading(false);
    }
  }

  return (
    <div className="loom-billing">
      <button
        className={`loom-billing-button is-${plan}`}
        onClick={openBilling}
        disabled={loading}
        aria-label={plan === "pro" ? "Manage Pro billing" : "Upgrade to Loom Pro"}
      >
        <CreditCardIcon size={16} />
        <span className="loom-plan">{plan === "pro" ? "Pro" : "Free"}</span>
        <span className="loom-plan-copy">{plan === "pro" ? "100 runs/hr" : "3 runs/hr · 1 Max"}</span>
        <strong>{loading ? "Opening…" : plan === "pro" ? "Manage" : "Upgrade"}</strong>
      </button>
      {error ? <span className="loom-billing-error" role="status">{error}</span> : null}
    </div>
  );
}
