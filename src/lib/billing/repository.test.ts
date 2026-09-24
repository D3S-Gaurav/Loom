import { describe, expect, it } from "vitest";
import { hasProAccess, type BillingState } from "./repository";

function state(overrides: Partial<BillingState> = {}): BillingState {
  return {
    customerId: "cus_test",
    subscriptionId: "sub_test",
    priceId: "price_pro",
    status: "active",
    currentPeriodEnd: new Date("2030-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("hasProAccess", () => {
  it("requires an active/trialing expected subscription", () => {
    expect(hasProAccess(state(), "price_pro", new Date("2029-01-01T00:00:00Z"))).toBe(true);
    expect(hasProAccess(state({ status: "past_due" }), "price_pro")).toBe(false);
    expect(hasProAccess(state({ priceId: "price_other" }), "price_pro")).toBe(false);
  });

  it("fails closed when billing configuration or period data is missing", () => {
    expect(hasProAccess(state(), "", new Date("2029-01-01T00:00:00Z"))).toBe(false);
    expect(
      hasProAccess(
        state({ currentPeriodEnd: null }),
        "price_pro",
        new Date("2029-01-01T00:00:00Z"),
      ),
    ).toBe(false);
  });

  it("denies a stale entitlement even if its last status was active", () => {
    expect(
      hasProAccess(
        state({ currentPeriodEnd: new Date("2028-01-01T00:00:00Z") }),
        "price_pro",
        new Date("2029-01-01T00:00:00Z"),
      ),
    ).toBe(false);
  });
});
