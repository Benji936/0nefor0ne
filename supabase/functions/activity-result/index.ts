// activity-result: filing a tournament result from inside the duel client.
//
// Same trust boundary as activity-context, for the same reason: the caller
// proves who they are with a Discord access token, and this function reads the
// user id from Discord's answer rather than from the request.
//
// It is deliberately thin. Whether this person may file this result, whether
// the score is possible in this format, whether the tournament is still
// running, whether a confirmed result may be rewritten — none of that is
// decided here. activity_submit_result becomes the caller and calls the same
// tournament_submit_result the website calls, so there is one implementation of
// those rules and this is not a second one drifting away from it.
//
// The result lands as awaiting_confirmation. A match decided in the Activity
// does not skip the opponent: life points are not evidence, and a physical game
// ends for reasons no counter can see.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** A games count a match could plausibly carry. The database checks the real
 *  rule against the tournament's format; this only keeps nonsense out of it. */
const games = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_body" }, 400);
    }

    const accessToken = body.access_token as string | undefined;
    const matchId = Number(body.match_id);
    const scoreA = games(body.score_a);
    const scoreB = games(body.score_b);
    const draws = games(body.draws ?? 0);

    if (!accessToken) return json({ error: "not_authenticated" }, 401);
    if (!Number.isInteger(matchId) || matchId < 1) return json({ error: "invalid_match" }, 400);
    if (scoreA === null || scoreB === null || draws === null) return json({ error: "invalid_score" }, 400);

    const me = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!me.ok) return json({ error: "not_authenticated" }, 401);
    const user = await me.json();
    if (!user?.id) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin.rpc("activity_submit_result", {
      p_match: matchId,
      p_discord_user_id: String(user.id),
      p_score_a: scoreA,
      p_score_b: scoreB,
      p_draws: draws,
    });

    if (error) {
      // The database raises deliberate, specific messages — "not playing this
      // match", "this result is final", "not a legal score for a best of 3" —
      // and those are what the person filing needs to read. Passing the message
      // through beats replacing a precise refusal with a generic apology.
      console.error("activity_submit_result refused", error);
      return json({ error: "refused", message: error.message ?? "" }, 409);
    }

    return json({ ok: true, result: data });
  } catch (e) {
    console.error("activity-result failed", e);
    return json({ error: "unavailable" }, 503);
  }
});
