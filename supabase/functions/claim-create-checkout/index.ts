// claim-create-checkout: create a subscription-mode Stripe Checkout Session for
// an already identity-verified claimer. First year free (365-day trial, card on
// file), billed yearly in the store's local currency. Ownership is granted later
// by stripe-webhook, not here. Success/cancel return to the community profile.
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
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID")!;
const SITE = "https://0nefor.one";

const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

// Mirror of frontend/src/lib/communityPricing.js — location to presentment
// currency. Fixed round figures; USD fallback. Kept in sync by hand (small set).
const EUROZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);
function currencyFor(countryCode: string | null): string {
  const cc = (countryCode || "").trim().toUpperCase();
  if (cc === "GB") return "gbp";
  if (EUROZONE.has(cc)) return "eur";
  return "usd";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { community_id } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);

    // Two callers reach this. A claimer taking over a seeded store, where the
    // store must still be unowned; and the owner of a community they created
    // themselves, subscribing to verify it, where they are already the owner.
    // Someone ELSE's community is refused in both cases.
    const { data: community } = await admin.from("community")
      .select("id, owner, slug, country_code").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner && community.owner !== user.id) {
      return json({ error: "already_claimed" }, 409);
    }

    const { data: claim } = await admin.from("community_claim")
      .select("id, identity_verified_at, stripe_customer_id, origin")
      .eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (!claim?.identity_verified_at) return json({ error: "not_verified" }, 403);

    const currency = currencyFor(community.country_code);
    // Send each flow back where it came from: a claim resumes on the community
    // page, self-verification resumes on the verify route that owns its state.
    const returnBase = claim.origin === "self"
      ? `${SITE}/en/community/${community.slug}/verify`
      : `${SITE}/en/community/${community.slug}`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      currency,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        trial_period_days: 365,
        metadata: { community_id: String(community_id), claimer: user.id },
      },
      // Reuse the caller's Stripe customer if we already have one; else prefill
      // their email so Checkout creates one.
      ...(claim.stripe_customer_id
        ? { customer: claim.stripe_customer_id }
        : { customer_email: user.email ?? undefined }),
      client_reference_id: String(claim.id),
      success_url: `${returnBase}?claim=success`,
      cancel_url: `${returnBase}?claim=cancel`,
    });

    if (!session.url) return json({ error: "no_session_url" }, 502);
    return json({ url: session.url });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
