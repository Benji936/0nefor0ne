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
// NOTE: nothing reads the resulting queue yet. The reviewing surface is a
// separate piece of work, and the copy on the page must not promise a
// turnaround that nobody is currently on the other end of.
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
    if (community.owner !== user.id) return json({ error: "not_owner" }, 403);
    if (community.verified) return json({ error: "already_verified" }, 409);

    const { error: upErr } = await admin.from("community_claim").upsert({
      community: community_id,
      claimer: user.id,
      manual_review_reason: text,
      manual_review_at: new Date().toISOString(),
      origin: "self",
      proof_method: "manual",
    }, { onConflict: "community,claimer" });
    if (upErr) return json({ error: "db_error", detail: upErr.message }, 500);

    return json({ status: "submitted" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
