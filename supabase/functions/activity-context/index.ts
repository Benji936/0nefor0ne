// activity-context: which tournament match, if any, the caller is playing.
//
// This function exists because of one gap. The Activity's Worker holds the anon
// key and serves the SPA from the same origin, so anything the Worker can call
// is effectively public — and "which match is Discord user X playing", keyed on
// a snowflake, is not something to expose that way. Every Discord user id is
// public; the set is not guessable, it is published.
//
// So the identity check happens here, against Discord, with a service-role
// client behind it. The caller proves who they are by holding an access token
// Discord issued to them; nothing about the request body is trusted, including
// the user id, which is read from Discord's answer rather than from the caller.
//
// The anon key in the Authorization header is not the credential that matters.
// It gets the request past the gateway. The Discord token is what decides
// whether this function does anything at all.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  // "No match" is the ordinary answer, not a failure: most duels are casual and
  // complete without one. Every path below that cannot establish a match
  // returns the same empty shape rather than an error the client has to branch
  // on, because there is nothing the client could usefully do differently.
  const none = () => json({ match: null });

  try {
    let accessToken: string | undefined;
    try {
      ({ access_token: accessToken } = await req.json());
    } catch {
      return json({ error: "invalid_body" }, 400);
    }
    if (!accessToken) return none();

    // Who is holding this token? Discord's answer, never the caller's claim.
    const me = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return none();
    const user = await me.json();
    if (!user?.id) return none();

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("activity_match_for_discord_user", {
      p_discord_user_id: String(user.id),
    });
    if (error) {
      console.error("activity_match_for_discord_user failed", error);
      return none();
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return none();

    // The seat map is what lets the duel client turn its own uids into entrant
    // ids without a second round trip. A Durable Object uid IS the Discord user
    // id, so this maps directly onto what the room already knows.
    return json({
      match: {
        matchId: row.match_id,
        tournamentId: row.tournament_id,
        tournamentName: row.tournament_name,
        roundNumber: row.round_number,
        tableNumber: row.table_number,
        bestOf: row.best_of,
        status: row.match_status,
        community: { name: row.community_name, slug: row.community_slug },
        playerA: row.player_a,
        playerB: row.player_b,
        names: { [row.player_a]: row.a_name, [row.player_b]: row.b_name },
        seats: {
          ...(row.a_discord ? { [row.a_discord]: row.player_a } : {}),
          ...(row.b_discord ? { [row.b_discord]: row.player_b } : {}),
        },
      },
    });
  } catch (e) {
    console.error("activity-context failed", e);
    return json({ error: "unavailable" }, 503);
  }
});
