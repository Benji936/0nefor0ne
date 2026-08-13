import { describe, it, expect } from "vitest";
import {
  billingState, canCancel, canReactivate, hasPortal,
  formatBillingDate, BILLING_STATE,
} from "@/lib/communityBilling";

// The shape fetchMyClaimSources() returns, with sensible defaults per test.
const claim = (over = {}) => ({
  stripe: true,
  customer: true,
  discord: false,
  subscription_status: "active",
  current_period_end: "2026-09-12T00:00:00.000Z",
  billing_interval: "year",
  cancel_at_period_end: false,
  ...over,
});

describe("billingState", () => {
  // The reason this module exists. Stripe does not change `status` when
  // somebody cancels - it stays 'active' until the period is actually over - so
  // code that reads status alone tells an owner mid-cancellation that their
  // plan renews. Both rows below carry status 'active'.
  it("separates a renewing subscription from a cancelling one", () => {
    expect(billingState(claim()).state).toBe(BILLING_STATE.ACTIVE);
    expect(billingState(claim({ cancel_at_period_end: true })).state)
      .toBe(BILLING_STATE.CANCELLING);
  });

  it("treats a cancelling trial as cancelling, not trialing", () => {
    const s = billingState(claim({ subscription_status: "trialing", cancel_at_period_end: true }));
    expect(s.state).toBe(BILLING_STATE.CANCELLING);
  });

  it("reports a trial that is not cancelling as trialing", () => {
    expect(billingState(claim({ subscription_status: "trialing" })).state)
      .toBe(BILLING_STATE.TRIALING);
  });

  // Past due outranks a pending cancellation: the failed payment is happening
  // now, the cancellation is not happening until period end.
  it("puts a failed payment ahead of a scheduled cancellation", () => {
    const s = billingState(claim({ subscription_status: "past_due", cancel_at_period_end: true }));
    expect(s.state).toBe(BILLING_STATE.PAST_DUE);
  });

  it.each(["canceled", "unpaid", "incomplete_expired"])(
    "treats %s as lapsed",
    (status) => {
      expect(billingState(claim({ subscription_status: status })).state)
        .toBe(BILLING_STATE.LAPSED);
    },
  );

  // The case that matters most, and the one an earlier version of this file got
  // wrong by testing `stripe: false` - which never actually happens.
  // stripe_subscription_id is never cleared on cancellation, so `stripe` stays
  // true forever once somebody has ever subscribed. An owner who cancelled
  // their card and now pays through a Guild Subscription was being told their
  // subscription had ended, while recompute_community_verified kept the badge
  // lit from the Discord side. The page contradicted the badge beside it.
  it("falls back to Discord when a real, never-cleared Stripe row has lapsed", () => {
    const s = billingState(claim({
      stripe: true,                       // as it always is after a first subscription
      subscription_status: "canceled",
      discord: true,
      discord_entitlement_at: "2026-07-01T00:00:00.000Z",
    }));
    expect(s.state).toBe(BILLING_STATE.DISCORD);
    expect(s.since).toBe("2026-07-01T00:00:00.000Z");
  });

  it("reports Discord for a community that has never touched Stripe", () => {
    const s = billingState({
      stripe: false, discord: true, discord_entitlement_at: "2026-07-01T00:00:00.000Z",
    });
    expect(s.state).toBe(BILLING_STATE.DISCORD);
  });

  // The fallback must not fire while Stripe is still doing its job, or an owner
  // paying by card loses the dates and the cancel button they need.
  it.each([
    ["active",    { subscription_status: "active" },                          BILLING_STATE.ACTIVE],
    ["trialing",  { subscription_status: "trialing" },                        BILLING_STATE.TRIALING],
    ["cancelling",{ cancel_at_period_end: true },                             BILLING_STATE.CANCELLING],
    ["past due",  { subscription_status: "past_due" },                        BILLING_STATE.PAST_DUE],
  ])("keeps a paying Stripe subscription ahead of Discord (%s)", (_label, over, expected) => {
    const s = billingState(claim({ ...over, discord: true, discord_entitlement_at: "2026-07-01T00:00:00.000Z" }));
    expect(s.state).toBe(expected);
    // Period end still comes from Stripe, and `since` stays clear so no caller
    // can print a Discord date next to a Stripe plan.
    expect(s.date).toBe("2026-09-12T00:00:00.000Z");
    expect(s.since).toBeNull();
  });

  // Lapsed on both sides is still lapsed - the fallback adds a source, it does
  // not invent one.
  it("stays lapsed when neither side is paying", () => {
    expect(billingState(claim({ subscription_status: "canceled", discord: false })).state)
      .toBe(BILLING_STATE.LAPSED);
  });

  it("returns none for a community with no subscription at all", () => {
    expect(billingState({ stripe: false, discord: false }).state).toBe(BILLING_STATE.NONE);
    expect(billingState(null).state).toBe(BILLING_STATE.NONE);
  });

  // A status Stripe adds later must not be guessed onto the paid side.
  it("does not claim an unknown status is active", () => {
    expect(billingState(claim({ subscription_status: "paused" })).state)
      .toBe(BILLING_STATE.NONE);
  });

  it("carries the date and interval through", () => {
    const s = billingState(claim({ billing_interval: "month" }));
    expect(s.interval).toBe("month");
    expect(s.date).toBe("2026-09-12T00:00:00.000Z");
  });
});

describe("action availability", () => {
  it("offers cancel only where there is something to cancel", () => {
    expect(canCancel(claim())).toBe(true);
    expect(canCancel(claim({ subscription_status: "trialing" }))).toBe(true);
    expect(canCancel(claim({ subscription_status: "past_due" }))).toBe(true);
    expect(canCancel(claim({ cancel_at_period_end: true }))).toBe(false);
    expect(canCancel(claim({ subscription_status: "canceled" }))).toBe(false);
  });

  // Criterion 3: cancelling must be reversible right up to the date shown.
  it("offers reactivate exactly while a cancellation is pending", () => {
    expect(canReactivate(claim({ cancel_at_period_end: true }))).toBe(true);
    expect(canReactivate(claim())).toBe(false);
    // Once it has actually ended there is nothing left to reactivate - that is
    // a new checkout, not an undo.
    expect(canReactivate(claim({ subscription_status: "canceled", cancel_at_period_end: true })))
      .toBe(false);
  });

  // Criterion 5: a Discord-paid community must show no Stripe controls at all.
  it("shows no Stripe actions for a Discord-paid community", () => {
    const discord = { stripe: false, discord: true };
    expect(canCancel(discord)).toBe(false);
    expect(canReactivate(discord)).toBe(false);
    expect(hasPortal(discord)).toBe(false);
  });
});

describe("hasPortal", () => {
  it("follows the customer, not the subscription", () => {
    expect(hasPortal(claim())).toBe(true);
    // Checkout abandoned after Stripe created the customer: a portal to open,
    // no subscription behind it.
    expect(hasPortal({ customer: true, stripe: false })).toBe(true);
    // The inverse should not happen, but gating on `stripe` would have offered
    // a button that claim-portal answers with 409 no_customer.
    expect(hasPortal({ customer: false, stripe: true })).toBe(false);
  });

  // A Guild Subscription is not run by Stripe, so the portal has nothing to
  // offer even when an old Stripe customer is still on the row. Opening it
  // invited an owner to look for controls over a subscription that is over -
  // which in practice answered with a 500 and an error box.
  it("is withheld from a Discord-paid community that still has a Stripe customer", () => {
    expect(hasPortal(claim({
      customer: true,
      stripe: true,
      subscription_status: "canceled",
      discord: true,
      discord_entitlement_at: "2026-08-09T21:16:23.688Z",
    }))).toBe(false);
  });

  // The withholding is about the Discord state, not about Discord existing. An
  // owner paying by card whose guild also happens to hold an entitlement still
  // has a live Stripe subscription to manage.
  it("still offers the portal while Stripe is the one being paid", () => {
    expect(hasPortal(claim({
      customer: true, discord: true, discord_entitlement_at: "2026-08-09T21:16:23.688Z",
    }))).toBe(true);
  });
});

describe("formatBillingDate", () => {
  it("writes the date the way the reader's language does", () => {
    const iso = "2026-09-12T00:00:00.000Z";
    expect(formatBillingDate(iso, "en")).toContain("September");
    expect(formatBillingDate(iso, "fr")).toContain("septembre");
  });

  // Returning null rather than a partial string lets the caller drop the whole
  // line instead of rendering "Renews on ".
  it("returns null rather than a broken line", () => {
    expect(formatBillingDate(null)).toBeNull();
    expect(formatBillingDate("")).toBeNull();
    expect(formatBillingDate("not a date")).toBeNull();
  });
});
