// stripe-webhook: the ONLY place community ownership is granted or revoked.
// Verifies the Stripe signature (async, Deno crypto), dedupes on event id, then
// maps subscription status to community state:
//   trialing | active  -> owner = claimer, verified = true, status = published
//   canceled | unpaid  -> drop verified; whether ownership also goes back depends
//                         on claim.origin (see below). Content is kept either way.
//   past_due           -> keep ownership (Stripe is dunning), just record status
//
// On lapse the two origins have to part company. A claimed store was owned
// BECAUSE of the subscription, so it reverts to unclaimed and becomes claimable
// again. A self-created community was owned before any subscription existed, so
// reverting would delete somebody's ownership of a place they made over a failed
// card. Those keep the owner and lose only the badge.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, STRIPE_WEBHOOK_SECRET, undefined, cryptoProvider);
  } catch (e) {
    return new Response(`bad signature: ${String(e)}`, { status: 400 });
  }

  // Idempotency: record the event id; a duplicate delivery hits the PK and we
  // acknowledge without reprocessing.
  const { error: dupErr } = await admin.from("stripe_webhook_event")
    .insert({ event_id: event.id, type: event.type });
  if (dupErr) {
    if (dupErr.code === "23505") return new Response("duplicate", { status: 200 });
    return new Response(`ledger error: ${dupErr.message}`, { status: 500 });
  }

  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    const communityId = Number(sub.metadata?.community_id);
    const claimer = sub.metadata?.claimer;
    if (!communityId || !claimer || !/^[0-9a-f-]{36}$/i.test(claimer)) {
      return new Response("no metadata", { status: 200 });
    }

    const status = sub.status; // trialing | active | past_due | canceled | unpaid | incomplete...
    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    // Which plan they are actually on, read off the subscription's own price
    // rather than the interval claim-create-checkout asked for. The two can
    // differ: switching plan in the customer portal changes the price and sends
    // an update event, and it is the price that decides what gets charged.
    // Metadata is the fallback for the same reason it is not the source.
    const billedInterval = sub.items?.data?.[0]?.price?.recurring?.interval ?? sub.metadata?.interval ?? null;
    const billingInterval = billedInterval === "month" || billedInterval === "year" ? billedInterval : null;

    try {
      // Mirror subscription state onto the claim row (service role bypasses guard).
      // Read origin back from the same write rather than a second round trip.
      // A missing claim row reads as null and falls through to 'claim', which is
      // the conservative branch: it never leaves a stranger owning a store.
      const { data: claimRow, error: mirrorErr } = await admin.from("community_claim").update({
        stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
        stripe_subscription_id: sub.id,
        subscription_status: status,
        current_period_end: periodEnd,
        // Omitted rather than nulled when unreadable, so an event that arrives
        // without a price cannot erase a plan we already recorded correctly.
        ...(billingInterval ? { billing_interval: billingInterval } : {}),
      }).eq("community", communityId).eq("claimer", claimer).select("origin").maybeSingle();
      if (mirrorErr) throw new Error(`mirror: ${mirrorErr.message}`);
      const selfCreated = claimRow?.origin === "self";

      if (status === "trialing" || status === "active") {
        // Grant ownership. WHERE guard: only if unclaimed, or already owned by this
        // same claimer (re-subscribe). First active subscription wins a race.
        const { error: grantErr } = await admin.from("community")
          .update({ owner: claimer, verified: true, status: "published", updated_at: new Date().toISOString() })
          .eq("id", communityId).or(`owner.is.null,owner.eq.${claimer}`);
        if (grantErr?.code === "23505") {
          // community_one_per_owner. claim-create-checkout refuses this up
          // front, so getting here means they took on another community while
          // this checkout was in flight. Retrying will never succeed, and the
          // only fair end is to stop charging for what we cannot grant.
          console.error(`grant refused, already own one: claimer=${claimer} community=${communityId}`);
          await stripe.subscriptions.cancel(sub.id).catch((e) => {
            console.error("cancel after refused grant failed", String(e));
          });
        } else if (grantErr) {
          throw new Error(`grant: ${grantErr.message}`);
        }
      } else if (status === "canceled" || status === "unpaid") {
        // Lapse. Either way keep the content, and either way only touch the row
        // if THIS claimer still owns it, so a later owner is never clobbered.
        const lapsed = selfCreated
          ? { verified: false }                 // they built it; it stays theirs
          : { owner: null, verified: false };   // granted by the subscription, so it goes back
        const { error: revertErr } = await admin.from("community")
          .update({ ...lapsed, status: "published", updated_at: new Date().toISOString() })
          .eq("id", communityId).eq("owner", claimer);
        if (revertErr) throw new Error(`revert: ${revertErr.message}`);
      }
      // past_due / incomplete: status recorded above; ownership untouched.
    } catch (e) {
      // Un-claim the ledger row so Stripe's retry is not deduped away, and
      // surface the failure so Stripe actually retries.
      await admin.from("stripe_webhook_event").delete().eq("event_id", event.id);
      console.error("stripe-webhook processing failed", String(e));
      return new Response(`processing error: ${String(e)}`, { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
});
