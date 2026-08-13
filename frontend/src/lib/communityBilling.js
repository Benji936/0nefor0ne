/**
 * What to tell an owner about the money side of their community.
 *
 * Pure: takes a claim-source row and returns a state plus the date that state
 * refers to. No network, no clock beyond the one passed in, so the whole matrix
 * below is testable without a browser.
 *
 * The reason this file exists rather than a couple of ternaries in the template:
 * Stripe's `status` alone cannot describe a subscription. It stays 'active'
 * through a scheduled cancellation and only turns 'canceled' once the period is
 * actually over, so `status` says what is true today and `cancel_at_period_end`
 * says what happens next. Both are needed to label a date, and getting it wrong
 * means promising a renewal to somebody who has cancelled - the one mistake a
 * billing panel must not make.
 *
 * The database is authoritative for all of it (stripe-webhook is the only
 * writer, see supabase/migrations/20260813_claim_cancel_at_period_end.sql);
 * everything here is presentation.
 */

/** Billing states, in rough order of how reassuring they are. */
export const BILLING_STATE = {
  /** Paying, renewing, nothing scheduled. */
  ACTIVE: "active",
  /** Inside the free period; still renews into a paid one. */
  TRIALING: "trialing",
  /** Paid up to a date, then it stops. Reversible until then. */
  CANCELLING: "cancelling",
  /** Stripe is retrying a payment. Access continues while it does. */
  PAST_DUE: "past_due",
  /** Over: cancelled and the period ran out, or never recovered. */
  LAPSED: "lapsed",
  /** Paid inside Discord. There is no Stripe customer to manage here. */
  DISCORD: "discord",
  /** No subscription of any kind on this community. */
  NONE: "none",
};

/** Statuses Stripe reports for a subscription that is over. */
const ENDED = new Set(["canceled", "unpaid", "incomplete_expired"]);

/** The Stripe states that mean somebody is currently being kept paid up. A
 *  cancelling subscription belongs here: it is paid until the date it names. */
const STRIPE_PAYING = new Set([
  BILLING_STATE.ACTIVE,
  BILLING_STATE.TRIALING,
  BILLING_STATE.CANCELLING,
  BILLING_STATE.PAST_DUE,
]);

/** What Stripe alone would say about this claim, ignoring Discord entirely. */
function stripeState(claim) {
  if (!claim?.stripe) return BILLING_STATE.NONE;
  const status = claim.subscription_status ?? null;
  if (ENDED.has(status)) return BILLING_STATE.LAPSED;
  // Past due outranks a pending cancellation: the money problem is the thing
  // the owner has to act on, and it is happening now rather than at period end.
  if (status === "past_due") return BILLING_STATE.PAST_DUE;
  // Checked before plain active/trialing because it is a modifier on top of
  // them, not a state of its own - Stripe reports a cancelling subscription as
  // active or trialing right up until it ends.
  if (claim.cancel_at_period_end === true) return BILLING_STATE.CANCELLING;
  if (status === "trialing") return BILLING_STATE.TRIALING;
  if (status === "active") return BILLING_STATE.ACTIVE;
  // incomplete, paused, or a status Stripe added after this was written. Saying
  // nothing is better than guessing which side of paid it falls on.
  return BILLING_STATE.NONE;
}

/**
 * Classify one community's billing, across both ways of paying for it.
 *
 * There are two doors - a Stripe subscription taken on the site, and a Guild
 * Subscription bought inside Discord for the bot - and `verified` has been
 * derived from either of them since 20260809_discord_entitlement_verifies.sql.
 * This has to agree with that function or the page contradicts the badge next
 * to it.
 *
 * Stripe is consulted first, but only wins while it is actually paying.
 * Otherwise Discord is the fallback. That ordering is the whole point:
 * `stripe_subscription_id` is never cleared - stripe-webhook writes it on every
 * event including the cancellation - so `claim.stripe` stays true forever once
 * somebody has ever subscribed. Checking "has Stripe" before "is paying" told
 * an owner who cancelled by card and now pays through Discord that their
 * subscription had ended, while their community sat there verified.
 *
 * @param {object|null} claim  { stripe, discord, discord_entitlement_at,
 *                               subscription_status, current_period_end,
 *                               billing_interval, cancel_at_period_end }
 * @returns {{ state: string, date: string|null, interval: string|null,
 *             since: string|null }}
 *   `date` is a period end and belongs to the Stripe states. `since` is when
 *   the Discord entitlement was granted, and is set only on DISCORD.
 */
export function billingState(claim) {
  const none = { state: BILLING_STATE.NONE, date: null, interval: null, since: null };
  if (!claim) return none;

  const interval = claim.billing_interval ?? null;
  const date = claim.current_period_end ?? null;
  const state = stripeState(claim);

  if (STRIPE_PAYING.has(state)) {
    return { state, date, interval, since: null };
  }
  if (claim.discord) {
    return {
      state: BILLING_STATE.DISCORD,
      date: null,
      interval: null,
      // Written once on the transition into the entitlement and nulled when it
      // ends (see syncGuildEntitlement in discord-bot/index.js), so this is the
      // date it started, not a freshness stamp. The copy says "since" for that
      // reason.
      since: claim.discord_entitlement_at ?? null,
    };
  }
  return { state, date, interval, since: null };
}

/** Whether the owner can schedule a cancellation from our pages right now. */
export function canCancel(claim) {
  const { state } = billingState(claim);
  return state === BILLING_STATE.ACTIVE
      || state === BILLING_STATE.TRIALING
      || state === BILLING_STATE.PAST_DUE;
}

/** Whether there is a scheduled cancellation still waiting to be undone. */
export function canReactivate(claim) {
  return billingState(claim).state === BILLING_STATE.CANCELLING;
}

/**
 * Whether to offer the Stripe Customer Portal for this community.
 *
 * Two conditions, and the second is a product decision rather than a technical
 * one.
 *
 * A customer id, because that is what claim-portal passes to Stripe - it
 * answers `no_customer` when stripe_customer_id is null, whatever the
 * subscription says. Gating on `stripe` instead put the button in front of
 * anyone who had ever held a subscription, which is a near-miss rather than a
 * match: a checkout abandoned after the customer was created has one and not
 * the other.
 *
 * And NOT on the Discord state. A community paid for through a Guild
 * Subscription has nothing in the portal worth the trip - whatever Stripe
 * record exists belongs to a subscription that is over - and opening it invites
 * an owner to look for controls over a subscription Stripe no longer runs. The
 * cost is that old invoices from a previous card subscription stop being
 * reachable from this page; they remain in Stripe, and reaching them was never
 * what this button was for.
 *
 * The comment on fetchMyClaimSources has said since it was written that one
 * extra read is cheaper than a button that fails. This keeps that true.
 */
export function hasPortal(claim) {
  if (!claim?.customer) return false;
  return billingState(claim).state !== BILLING_STATE.DISCORD;
}

/**
 * The date, written the way the reader's language writes it.
 *
 * Mirrors formatPrice in communityPricing.js: the value belongs to the
 * subscription, the wording belongs to the reader. Returns null rather than a
 * broken string when there is no date, so callers can drop the whole line
 * instead of rendering "Renews on ".
 */
export function formatBillingDate(iso, locale = "en") {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric", month: "long", day: "numeric",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
