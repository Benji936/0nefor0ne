// community-release: give up a community you own.
//
// Two different acts wear one button in the UI, and they are not the same thing:
//
//   delete  — a community you created. It only ever existed because you made it,
//             so it leaves with you. Cascades take the events, follows, claims
//             and reports with it.
//   release — a seeded directory entry you claimed. It was a real shop before
//             you arrived and stays one after you go, so the row survives with
//             owner and verified cleared, free for the next person to claim.
//
// Which one applies is decided here from created_by, never from the request. The
// caller still has to say which it expects, so a UI bug cannot turn "hand it
// back" into "destroy it".
//
// This is a function rather than a client write for one reason: the Stripe
// subscription. Clearing owner in the browser would leave a live subscription
// billing someone for a community they no longer have.
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

// Cancelling something Stripe no longer has is a success, not a failure: the end
// state we want is "no live subscription", and that is already true. Anything
// else has to surface, or we would clear ownership while the card keeps being
// charged.
async function cancelSubscription(id: string): Promise<void> {
  try {
    await stripe.subscriptions.cancel(id);
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "resource_missing") return;
    const msg = String((e as Error)?.message ?? e);
    if (msg.includes("canceled subscription")) return;
    throw e;
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

    const { community_id, intent } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);
    if (intent !== "release" && intent !== "delete") return json({ error: "bad_intent" }, 400);

    const { data: community } = await admin.from("community")
      .select("id, owner, created_by, slug").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner !== user.id) return json({ error: "not_owner" }, 403);

    const mine = community.created_by === user.id;
    const expected = mine ? "delete" : "release";
    if (intent !== expected) return json({ error: "wrong_intent", expected }, 409);

    // Stripe first. If cancelling throws we stop here with ownership intact,
    // which is the recoverable failure: the user still has their community and
    // can try again. The other order would strand a paying subscription.
    const { data: claim } = await admin.from("community_claim")
      .select("id, stripe_subscription_id")
      .eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (claim?.stripe_subscription_id) await cancelSubscription(claim.stripe_subscription_id);

    if (mine) {
      const { error } = await admin.from("community").delete().eq("id", community_id);
      if (error) return json({ error: "delete_failed", detail: error.message }, 500);
      return json({ ok: true, mode: "delete" });
    }

    // A released store keeps its past, loses its future. Events that already
    // happened are a record and harm nobody; events still to come are promises
    // an unowned community cannot keep, and with no owner left, nobody would be
    // able to take them down.
    await admin.from("community_event").delete()
      .eq("community", community_id).gte("starts_at", new Date().toISOString());

    // Proof does not survive the handover. Whoever claims this next, including
    // the same person, starts from the email code again.
    if (claim?.id) await admin.from("community_claim").delete().eq("id", claim.id);

    const { error } = await admin.from("community")
      .update({ owner: null, verified: false }).eq("id", community_id);
    if (error) return json({ error: "release_failed", detail: error.message }, 500);

    return json({ ok: true, mode: "release" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
