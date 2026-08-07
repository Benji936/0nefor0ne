// admin-review: the other end of the manual review queue.
//
// Everything a reviewer can do lives here rather than in RLS policies, because
// the app has no notion of staff and inventing one in the schema would mean a
// permissions system to maintain for an audience of one. The allowlist is a
// secret: ADMIN_USER_IDS, comma-separated user ids. Nothing in the browser
// decides who is a reviewer, and nothing in the database has to know.
//
// Approving does NOT set verified. It sets identity_verified_at, the same
// stamp the domain code and the Discord routes leave, and the owner continues
// to checkout like everyone else. Manual review is a different way to prove
// yourself, not a free door.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_USER_IDS = Deno.env.get("ADMIN_USER_IDS") ?? "";

const MAX_NOTE = 500; // matches the CHECK on community_claim.review_note

// An unset or empty secret means nobody is a reviewer, never everybody. A
// missing environment variable must fail closed.
const ADMINS = new Set(
  ADMIN_USER_IDS.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return json({ error: "not_authenticated" }, 401);
    if (!ADMINS.has(user.id.toLowerCase())) return json({ error: "not_admin" }, 403);

    const { action, claim_id, report_id, decision, note, status } = await req.json();

    // ── The queue ───────────────────────────────────────────────────────────
    if (action === "list") {
      const { data: claims, error: claimErr } = await admin.from("community_claim")
        .select("id, community, claimer, manual_review_at, manual_review_reason, origin, proof_method, community!inner(id, slug, name, kind, kinds, website, city, country, owner)")
        .not("manual_review_at", "is", null)
        .is("reviewed_at", null)
        .order("manual_review_at", { ascending: true });
      if (claimErr) return json({ error: "db_error", detail: claimErr.message }, 500);

      const { data: reports, error: reportErr } = await admin.from("community_report")
        .select("id, reason, status, created_at, community!inner(id, slug, name)")
        .eq("status", "open")
        .order("created_at", { ascending: true });
      if (reportErr) return json({ error: "db_error", detail: reportErr.message }, 500);

      return json({ claims: claims ?? [], reports: reports ?? [] });
    }

    // ── Deciding a review ───────────────────────────────────────────────────
    if (action === "decide") {
      if (!claim_id) return json({ error: "missing_claim_id" }, 400);
      if (decision !== "approve" && decision !== "decline") {
        return json({ error: "bad_decision" }, 400);
      }
      const text = String(note ?? "").trim();
      if (text.length > MAX_NOTE) return json({ error: "note_too_long" }, 400);
      // Declining without saying why leaves the owner staring at a refusal they
      // cannot act on, and they paid nothing to deserve that.
      if (decision === "decline" && !text) return json({ error: "missing_note" }, 400);

      const { data: claim } = await admin.from("community_claim")
        .select("id, reviewed_at, identity_verified_at").eq("id", claim_id).maybeSingle();
      if (!claim) return json({ error: "not_found" }, 404);
      // Two reviewers, one queue, one refresh apart: the second one should be
      // told rather than silently overwrite the first.
      if (claim.reviewed_at) return json({ error: "already_reviewed" }, 409);

      const patch: Record<string, unknown> = {
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        review_note: text || null,
      };
      if (decision === "approve") patch.identity_verified_at = new Date().toISOString();

      const { error } = await admin.from("community_claim").update(patch).eq("id", claim_id);
      if (error) return json({ error: "db_error", detail: error.message }, 500);
      return json({ ok: true, decision });
    }

    // ── Reports ─────────────────────────────────────────────────────────────
    if (action === "resolve") {
      if (!report_id) return json({ error: "missing_report_id" }, 400);
      // 'reviewed', not 'resolved': the CHECK on community_report.status allows
      // open / reviewed / dismissed and nothing else.
      if (status !== "reviewed" && status !== "dismissed") {
        return json({ error: "bad_status" }, 400);
      }
      const { error } = await admin.from("community_report")
        .update({ status }).eq("id", report_id);
      if (error) return json({ error: "db_error", detail: error.message }, 500);
      return json({ ok: true, status });
    }

    return json({ error: "bad_action" }, 400);
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
