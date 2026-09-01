// claim-create-checkout: create a subscription-mode Stripe Checkout Session for
// an already identity-verified claimer. Two plans: yearly with the first six
// months free, or monthly with the first month free, both with a card on file
// and both billed in the store's local currency. Ownership is granted later by
// stripe-webhook, not here. Success/cancel return to the community profile.
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
const STRIPE_PRICE_ID_MONTHLY = Deno.env.get("STRIPE_PRICE_ID_MONTHLY") ?? "";
const SITE = "https://0nefor.one";

const stripe = new Stripe(STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient() });

// Mirror of frontend/src/lib/communityPricing.js — location to presentment
// currency. Fixed round figures; USD fallback. Kept in sync by hand (small set).
const EUROZONE = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);
const SWISS = new Set(["CH", "LI"]);
function currencyFor(countryCode: string | null): string {
  const cc = (countryCode || "").trim().toUpperCase();
  if (SWISS.has(cc)) return "chf";
  if (cc === "GB") return "gbp";
  if (EUROZONE.has(cc)) return "eur";
  return "usd";
}

// Mirror of FREE_DAYS. 182 is six months to the nearest day; 30 is a month. A Map rather than
// an object literal so that membership is membership: `"constructor" in {}` is
// true, and that is not the kind of thing to leave in the path that decides how
// long somebody goes unbilled.
const TRIAL_DAYS = new Map<string, number>([["year", 182], ["month", 30]]);

/**
 * The stored customer id, but only if Stripe still has it. Returns null when
 * the id is absent, unknown to Stripe, or names a deleted customer, so the
 * caller can let Checkout create a fresh one instead of failing.
 */
async function usableCustomer(id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  try {
    const customer = await stripe.customers.retrieve(id);
    // A deleted customer still retrieves, as { id, deleted: true }.
    return (customer as { deleted?: boolean })?.deleted ? null : id;
  } catch (e) {
    if ((e as { code?: string })?.code === "resource_missing") return null;
    throw e; // a network or auth failure is not "no customer"
  }
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

    const { community_id, interval: rawInterval } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);

    // Absent means yearly: a client cached from before monthly existed sends no
    // interval at all, and it should still get the plan it was built to buy.
    // A value we do not recognise is a different thing entirely, and defaulting
    // it would charge someone on a plan they did not pick.
    const interval = rawInterval === undefined || rawInterval === null ? "year" : String(rawInterval);
    if (!TRIAL_DAYS.has(interval)) return json({ error: "bad_interval" }, 400);

    const priceId = interval === "month" ? STRIPE_PRICE_ID_MONTHLY : STRIPE_PRICE_ID;
    // Monthly is configured in Stripe separately from this deploy. Say so rather
    // than quietly falling back to yearly, which would take a card for a plan
    // the owner did not choose.
    if (!priceId) return json({ error: "interval_unavailable" }, 503);

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

    // One community per account, checked before Stripe rather than after. The
    // unique index would refuse the grant anyway, but by then there would be a
    // card on file for a community they were never going to get.
    const { count: ownedElsewhere } = await admin.from("community")
      .select("id", { count: "exact", head: true })
      .eq("owner", user.id).neq("id", community_id);
    if ((ownedElsewhere ?? 0) > 0) return json({ error: "already_own_one" }, 409);

    const { data: claim } = await admin.from("community_claim")
      .select("id, identity_verified_at, stripe_customer_id, origin")
      .eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (!claim?.identity_verified_at) return json({ error: "not_verified" }, 403);

    // A community's country is optional and easy to skip, and skipping it used
    // to mean the USD default no matter where anyone involved actually was.
    // Fall back to the buyer's own country, which is whose card this is. The
    // community's own country still wins, and communityPricing applies the same
    // rule so the figure on screen is the figure Checkout charges.
    let countryCode = community.country_code;
    if (!countryCode) {
      const { data: trader } = await admin.from("Trader")
        .select("country_code").eq("id", user.id).maybeSingle();
      countryCode = trader?.country_code ?? null;
    }
    const currency = currencyFor(countryCode);
    // Send each flow back where it came from: a claim resumes on the community
    // page, self-verification resumes on the verify route that owns its state.
    const returnBase = claim.origin === "self"
      ? `${SITE}/en/community/${community.slug}/verify`
      : `${SITE}/en/community/${community.slug}`;

    // Reuse the caller's Stripe customer if we still have a real one. The id on
    // the claim row can outlive the customer it names: deleting a customer in
    // the dashboard, or clearing out test data, leaves the row pointing at
    // nothing and Checkout answers "No such customer" for a person who did
    // nothing wrong. Confirm it exists, and fall back to their email if not.
    const customer = await usableCustomer(claim.stripe_customer_id);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      currency,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: TRIAL_DAYS.get(interval),
        // interval is what was asked for. stripe-webhook records what was
        // actually billed, read off the subscription itself.
        metadata: { community_id: String(community_id), claimer: user.id, interval },
      },
      ...(customer ? { customer } : { customer_email: user.email ?? undefined }),
      client_reference_id: String(claim.id),
      success_url: `${returnBase}?claim=success`,
      cancel_url: `${returnBase}?claim=cancel`,
    });

    if (!session.url) return json({ error: "no_session_url" }, 502);
    return json({ url: session.url });
  } catch (e) {
    // A 500 nobody can read is a 500 nobody can fix. The message and the inputs
    // that produced it go to the logs; the caller gets the same body as before.
    const err = e as { message?: string; code?: string; param?: string };
    console.error("claim-create-checkout failed", JSON.stringify({
      message: err?.message ?? String(e),
      code: err?.code ?? null,
      param: err?.param ?? null,
    }));
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
