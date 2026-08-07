// community-verify-manual: the group path, and the honest one.
//
// A playgroup has no domain to receive mail at and no server to hold a
// permission in. There is nothing to check automatically, so the owner writes
// down what they are and a person reads it.
//
// This exists as a function rather than a plain client update for one reason:
// origin and manual_review_at are both frozen against client writes by the
// column guard, and the webhook's lapse branch depends on origin being right.
//
// It also serves the claim flow's fallback, a seeded shop with no email on
// file. That path used to write manual_review_reason straight from the browser,
// which the guard allows, while manual_review_at stayed NULL because the guard
// does not. Those requests were invisible to any queue keyed on the timestamp,
// which is to say invisible.
//
// admin-review reads what this writes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_REASON = 500; // matches the CHECK on community_claim.manual_review_reason

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "not_authenticated" }, 401);

    const { community_id, reason } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);
    const text = String(reason ?? "").trim();
    if (!text) return json({ error: "missing_reason" }, 400);
    if (text.length > MAX_REASON) return json({ error: "reason_too_long" }, 400);

    const { data: community } = await admin.from("community")
      .select("id, owner, verified").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    // Two callers, both legitimate: the owner of a community they made, and a
    // claimer of a seeded shop with no email on file. Someone else's community
    // is refused in both cases.
    if (community.owner && community.owner !== user.id) return json({ error: "not_owner" }, 403);
    if (community.verified) return json({ error: "already_verified" }, 409);

    // origin is frozen once set, so an existing row keeps whatever it was.
    // Otherwise: owning it means you made it, not owning it means you are
    // claiming it.
    const { data: existing } = await admin.from("community_claim")
      .select("origin").eq("community", community_id).eq("claimer", user.id).maybeSingle();
    const origin = existing?.origin ?? (community.owner === user.id ? "self" : "claim");

    const { error: upErr } = await admin.from("community_claim").upsert({
      community: community_id,
      claimer: user.id,
      manual_review_reason: text,
      manual_review_at: new Date().toISOString(),
      origin,
      proof_method: "manual",
    }, { onConflict: "community,claimer" });
    if (upErr) return json({ error: "db_error", detail: upErr.message }, 500);

    return json({ status: "submitted" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
