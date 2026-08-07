// community-verify-discord: prove a self-created DISCORD community by showing
// you manage the server it points at.
//
// The invite link on the community is public, so it proves nothing by itself.
// What proves something is holding Manage Server on the guild that invite leads
// to. We resolve the invite to a guild id, then read the caller's own guild list
// from Discord and look for that id with the permission set.
//
// The provider token is the caller's Discord access token, forwarded from the
// browser for the length of this request and never written down. It is minted
// with the `guilds` scope, which is read-only over the server list.
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

const MANAGE_GUILD = 1n << 5n; // 0x20, same bit the bot checks via PermissionFlagsBits

// discord.gg/abc, discord.com/invite/abc, with or without scheme, query, or
// trailing slash. Anything else is not an invite we can resolve.
export function inviteCode(url: string): string | null {
  const m = String(url ?? "").trim()
    .match(/(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]+)/i);
  return m ? m[1] : null;
}

export function canManage(guild: { permissions?: string; owner?: boolean }): boolean {
  if (guild.owner) return true;
  try {
    return (BigInt(guild.permissions ?? "0") & MANAGE_GUILD) === MANAGE_GUILD;
  } catch {
    return false;
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

    const { community_id, provider_token } = await req.json();
    if (!community_id) return json({ error: "missing_community_id" }, 400);
    if (typeof provider_token !== "string" || !provider_token) {
      return json({ error: "missing_provider_token" }, 400);
    }

    const { data: community } = await admin.from("community")
      .select("id, owner, kind, kinds, discord_url, verified").eq("id", community_id).maybeSingle();
    if (!community) return json({ error: "not_found" }, 404);
    if (community.owner !== user.id) return json({ error: "not_owner" }, 403);
    if (community.verified) return json({ error: "already_verified" }, 409);
    // Only when Discord is the whole story; see community-verify-bot-token.
    if (strictestKind(community) !== "discord") return json({ error: "wrong_kind" }, 400);

    const code = inviteCode(community.discord_url ?? "");
    if (!code) return json({ status: "needs_invite" });

    // Resolve the invite. An expired or single-use link is the common failure
    // here and it is fixable by the owner, so it gets its own status.
    const inviteRes = await fetch(`https://discord.com/api/v10/invites/${code}`);
    if (!inviteRes.ok) return json({ status: "invite_unresolvable" });
    const invite = await inviteRes.json();
    const guildId: string | undefined = invite?.guild?.id;
    if (!guildId) return json({ status: "invite_unresolvable" });

    const guildsRes = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${provider_token}` },
    });
    // 401 means the token expired between sign-in and here, which is a retry,
    // not a refusal. Keep it distinct from "you don't manage this server".
    if (guildsRes.status === 401) return json({ status: "token_expired" });
    if (!guildsRes.ok) return json({ error: "discord_error", detail: await guildsRes.text() }, 502);

    const guilds = await guildsRes.json();
    const match = Array.isArray(guilds) ? guilds.find((g) => g?.id === guildId) : null;
    if (!match) return json({ status: "not_a_member" });
    if (!canManage(match)) return json({ status: "not_a_manager" });

    const { error: upErr } = await admin.from("community_claim").upsert({
      community: community_id,
      claimer: user.id,
      identity_verified_at: new Date().toISOString(),
      origin: "self",
      proof_method: "discord_oauth",
      discord_guild_id: guildId,
      code_hash: null,
      code_expires_at: null,
    }, { onConflict: "community,claimer" });
    if (upErr) return json({ error: "db_error", detail: upErr.message }, 500);

    return json({ status: "verified" });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
