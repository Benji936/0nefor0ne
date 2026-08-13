// claim-cancel: schedule an owner's community subscription to end at the close
// of the period they have already paid for, or undo that while it is still
// pending. Only the current owner may do either.
//
// This function deliberately writes NOTHING to community_claim. It asks Stripe
// to flip cancel_at_period_end and stops there; Stripe answers with a
// customer.subscription.updated event, and stripe-webhook mirrors the result
// onto the claim row the way it mirrors every other billing fact. That keeps
// the invariant stated at the top of stripe-webhook - it is the only writer of
// subscription state - which is worth more than the second or two this costs.
// A function that wrote the row itself would be a second source of truth, and
// the two would disagree the first time a Stripe call succeeded and the local
// write did not.
//
// Cancelling never deletes anything. What happens at period end is decided by
// claim.origin in stripe-webhook: a claimed store reverts to unclaimed, a
// self-created community keeps its owner and loses only the badge. Content
// survives both.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17.7.0?target=deno";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { community_id, action } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);
    if (action !== "cancel" && action !== "reactivate") {
      return json({ error: "bad_action" }, 400);
    }

    // Same ownership gate as claim-portal, for the same reason: the claim row is
    // keyed on the claimer, but what is being spent or kept belongs to whoever
    // owns the community now.
    const { data: community } = await admin.from("community")
      .select("id, owner").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner !== user.id) return json({ error: "not_owner" }, 403);

    const { data: claim } = await admin.from("community_claim")
      .select("stripe_subscription_id").eq("community", community_id).eq("claimer", user.id).maybeSingle();
    // Distinct from claim-portal's no_customer: a community paid for by a
    // Discord Guild Subscription has no Stripe subscription to schedule, and
    // the only place to stop it is Discord's own settings. The caller needs to
    // tell those two apart to say anything useful.
    if (!claim?.stripe_subscription_id) return json({ error: "no_subscription" }, 409);

    const sub = await stripe.subscriptions.update(claim.stripe_subscription_id, {
      cancel_at_period_end: action === "cancel",
    });

    // Echoed back so the caller can settle immediately rather than waiting for
    // the webhook round trip. The row is still the webhook's to write; this is
    // what the UI shows in the meantime.
    return json({
      ok: true,
      cancel_at_period_end: sub.cancel_at_period_end === true,
      current_period_end: sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null,
    });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
