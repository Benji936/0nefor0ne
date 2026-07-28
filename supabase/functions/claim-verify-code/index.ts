// claim-verify-code: check the 6-digit code against the stored hash and, on a
// match, mark identity verified. Ownership is NOT granted here (Plan 2) — the
// Stripe webhook grants it once a subscription becomes trialing/active. This
// function only proves the claimer controls the store's on-file email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAX_ATTEMPTS = 5;

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

    const { community_id, code } = await req.json();
    if (!community_id || !/^[0-9]{6}$/.test(code ?? "")) return json({ error: "bad_input" }, 400);

    const { data: claim } = await admin.from("community_claim")
      .select("id, code_hash, code_expires_at, code_attempts")
      .eq("community", community_id).eq("claimer", user.id).maybeSingle();
    if (!claim?.code_hash) return json({ status: "expired" });
    if (Date.now() > new Date(claim.code_expires_at).getTime()) return json({ status: "expired" });
    if (claim.code_attempts >= MAX_ATTEMPTS) return json({ status: "expired" });

    if (await sha256(code) !== claim.code_hash) {
      const attempts = claim.code_attempts + 1;
      await admin.from("community_claim").update({ code_attempts: attempts }).eq("id", claim.id);
      return json({ status: "invalid", attempts_left: Math.max(0, MAX_ATTEMPTS - attempts) });
    }

    // Correct code: clear the code and mark identity verified. Ownership is NOT
    // granted here anymore (Plan 2) — it is granted only by stripe-webhook once
    // a subscription becomes trialing/active. The client now proceeds to the
    // paid Checkout step.
    await admin.from("community_claim").update({
      identity_verified_at: new Date().toISOString(), code_hash: null, code_expires_at: null,
    }).eq("id", claim.id);

    return json({ status: "verified" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
