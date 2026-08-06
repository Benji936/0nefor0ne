// community-verify-bot-token: issue the one-time token for the Discord bot
// route, the second of the two ways a Discord community can prove itself.
//
// Why two routes at all. The OAuth route needs no bot install but asks the
// owner to grant the `guilds` scope. This one needs no new scope but asks them
// to have the bot in the server. Most owners already do, since the bot is what
// posts their announces, so for them this is the shorter path.
//
// The token is short and typed by a human into a Discord message box, so it
// trades entropy for legibility: 8 characters from a 32-symbol alphabet is
// ~40 bits, one-time, and dead after 15 minutes. Only the hash is stored.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Mirror of frontend/src/lib/communityKinds.js, kept by hand like currencyFor in
// claim-create-checkout. Proof gets harder down this list and a community has to
// pass the hardest one it claims: a shop that also runs a Discord server does
// not get to prove the server instead of the shop.
const STRICTNESS = ["store", "group", "discord"];

function kindsOf(c: { kinds?: string[] | null; kind?: string | null }): string[] {
  const list = Array.isArray(c?.kinds) ? c.kinds.filter((k) => STRICTNESS.includes(k)) : [];
  return list.length ? list : (c?.kind ? [c.kind] : []);
}

function strictestKind(c: { kinds?: string[] | null; kind?: string | null }): string | null {
  const list = kindsOf(c);
  return STRICTNESS.find((k) => list.includes(k)) ?? null;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN_TTL_MS = 15 * 60 * 1000;

// No I, O, 0, 1: this gets read off a screen and typed into Discord.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
}

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
      .select("id, owner, kind, kinds, verified").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner !== user.id) return json({ error: "not_owner" }, 403);
    if (community.verified) return json({ error: "already_verified" }, 409);
    // Only when Discord is the whole story. A community that also calls itself
    // a store or a group has a harder proof to pass first.
    if (strictestKind(community) !== "discord") return json({ error: "wrong_kind" }, 400);

    const plain = newToken();
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    const { error: upErr } = await admin.from("community_claim").upsert({
      community: community_id,
      claimer: user.id,
      link_token_hash: await sha256(plain),
      link_token_expires_at: expiresAt,
      origin: "self",
      proof_method: "discord_bot",
    }, { onConflict: "community,claimer" });
    if (upErr) return json({ error: "db_error", detail: upErr.message }, 500);

    return json({ status: "issued", token: plain, expires_at: expiresAt });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
