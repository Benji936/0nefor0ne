// claim-portal: open a Stripe Customer Portal session for the owner of a claimed
// community so they can update their card or cancel (cancel_at_period_end; the
// store reverts at period end via stripe-webhook). Only the current owner may open it.
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
const SITE = "https://0nefor.one";

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

    const { community_id, locale } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);

    // Whitelisted, not interpolated: return_url goes into a redirect Stripe
    // performs, so an unchecked value from the request body would be an open
    // redirect with our own domain in front of it.
    const lang = ["en", "fr", "de", "it"].includes(locale) ? locale : "en";

    const { data: community } = await admin.from("community")
      .select("id, owner, slug").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner !== user.id) return json({ error: "not_owner" }, 403);

    const { data: claim } = await admin.from("community_claim")
      .select("stripe_customer_id").eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (!claim?.stripe_customer_id) return json({ error: "no_customer" }, 409);

    const portal = await stripe.billingPortal.sessions.create({
      customer: claim.stripe_customer_id,
      return_url: `${SITE}/${lang}/community/${community.slug}`,
    });
    return json({ url: portal.url });
  } catch (e) {
    // Logged as well as returned. The detail was only ever in the response body,
    // so a failure here was invisible in function_logs and could not be
    // diagnosed without asking the person it happened to to open DevTools.
    console.error("claim-portal failed", String(e));
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
