// stripe-webhook: the ONLY place community ownership is granted or revoked.
// Verifies the Stripe signature (async, Deno crypto), dedupes on event id, then
// maps subscription status to community state:
//   trialing | active  -> owner = claimer, verified = true, status = published
//   canceled | unpaid  -> revert to unclaimed (owner NULL, verified false),
//                         keeping all owner-edited content
//   past_due           -> keep ownership (Stripe is dunning), just record status
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
    if (!communityId || !claimer) return new Response("no metadata", { status: 200 });

    const status = sub.status; // trialing | active | past_due | canceled | unpaid | incomplete...
    const periodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    // Mirror subscription state onto the claim row (service role bypasses guard).
    await admin.from("community_claim").update({
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
      stripe_subscription_id: sub.id,
      subscription_status: status,
      current_period_end: periodEnd,
    }).eq("community", communityId).eq("claimer", claimer);

    if (status === "trialing" || status === "active") {
      // Grant ownership. WHERE guard: only if unclaimed, or already owned by this
      // same claimer (re-subscribe). First active subscription wins a race.
      await admin.from("community")
        .update({ owner: claimer, verified: true, status: "published", updated_at: new Date().toISOString() })
        .eq("id", communityId).or(`owner.is.null,owner.eq.${claimer}`);
    } else if (status === "canceled" || status === "unpaid") {
      // Lapse: revert to unclaimed but keep content. Only if THIS claimer still
      // owns it (don't clobber a different current owner).
      await admin.from("community")
        .update({ owner: null, verified: false, status: "published", updated_at: new Date().toISOString() })
        .eq("id", communityId).eq("owner", claimer);
    }
    // past_due / incomplete: status recorded above; ownership untouched.
  }

  return new Response("ok", { status: 200 });
});
