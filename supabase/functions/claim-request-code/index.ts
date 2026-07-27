// claim-request-code: issue a 6-digit store-ownership verification code and
// email it (via Resend) to the store's on-file address. The address is looked
// up server-side from community_private and is NEVER returned to the client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = "One for One <noreply@0nefor.one>";
const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

    const { data: community } = await admin.from("community")
      .select("id, owner").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner) return json({ error: "already_claimed" }, 409);

    const { data: priv } = await admin.from("community_private")
      .select("claim_email").eq("community", community_id).maybeSingle();
    if (!priv?.claim_email) return json({ status: "needs_manual_review" });

    // Rate-limit resends: a fresh code was issued less than the cooldown ago.
    const { data: existing } = await admin.from("community_claim")
      .select("code_expires_at").eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (existing?.code_expires_at &&
        Date.now() < new Date(existing.code_expires_at).getTime() - (CODE_TTL_MS - RESEND_COOLDOWN_MS)) {
      return json({ status: "rate_limited" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256(code);
    const code_expires_at = new Date(Date.now() + CODE_TTL_MS).toISOString();
    const { error: upErr } = await admin.from("community_claim").upsert(
      { community: community_id, claimer: user.id, code_hash, code_expires_at, code_attempts: 0 },
      { onConflict: "community,claimer" },
    );
    if (upErr) return json({ error: "db_error", detail: upErr.message }, 500);

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: priv.claim_email,
        subject: "Your One for One store verification code",
        text: `Your verification code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
      }),
    });
    if (!emailRes.ok) return json({ error: "email_failed", detail: await emailRes.text() }, 502);

    return json({ status: "sent" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
