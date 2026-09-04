-- Arena, part 5: what the Discord Activity is allowed to ask.
--
-- Two questions, both asked by an Edge Function holding the service role, never
-- by the Activity or its Worker. The Worker holds the anon key and serves the
-- SPA from the same origin, so anything it can call is effectively public;
-- "which match is Discord user X playing" keyed on a snowflake is not something
-- to hand out that way, because every Discord user id is public.
--
-- So the Edge Function is the trust boundary. It verifies the caller's Discord
-- access token against Discord itself, which is the only way to establish that
-- the person asking really is that snowflake, and only then asks these.
--
-- Both follow discord_act_as (20260904142050): resolve the snowflake to the
-- account that owns it, become that account for the length of the transaction,
-- and call the ordinary function. There is no separate privileged path.

-- ── Which match is this player at right now ───────────────────────────────────
--
-- The link between a voice channel and a tournament table is deliberately NOT a
-- channel id. The bot posts one pairing sheet to one channel; it does not create
-- sixteen voice channels a round, and asking it to would need Manage Channels
-- and leave a wake of dead channels behind every event.
--
-- The player is the link instead. Whoever opens the Activity is someone the
-- Worker has just verified with Discord, and a player is in at most one
-- unfinished match at a time. That answer needs no channel plumbing and works in
-- whatever voice channel the two of them happen to be standing in.
CREATE OR REPLACE FUNCTION activity_match_for_discord_user(p_discord_user_id text)
RETURNS TABLE (
  match_id        bigint,
  tournament_id   bigint,
  tournament_name text,
  round_number    smallint,
  table_number    smallint,
  best_of         smallint,
  match_status    text,
  community_name  text,
  community_slug  text,
  player_a        bigint,
  player_b        bigint,
  a_name          text,
  b_name          text,
  a_discord       text,
  b_discord       text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.id, t.id, t.name, r.round_number, m.table_number, t.match_format, m.status,
         c.name, c.slug,
         m.player_a, m.player_b,
         pa.display_name, pb.display_name,
         pa.discord_user_id, pb.discord_user_id
  FROM "Trader" tr
  JOIN tournament_player me ON me.player = tr.id AND me.dropped_at IS NULL
  JOIN tournament_match m   ON (m.player_a = me.id OR m.player_b = me.id)
  JOIN tournament_round r   ON r.id = m.round
  JOIN tournament t         ON t.id = m.tournament
  JOIN community c          ON c.id = t.community
  JOIN tournament_player pa ON pa.id = m.player_a
  -- A bye has nobody on the other side, and nothing to play in an Activity.
  JOIN tournament_player pb ON pb.id = m.player_b
  WHERE tr.discord_id = p_discord_user_id
    AND t.status = 'active'
    AND c.verified
    AND c.status = 'published'
    -- Completed and disputed are both settled as far as the duel client is
    -- concerned: there is nothing left for the two players to play or report.
    AND m.status IN ('pending', 'active', 'awaiting_confirmation')
  ORDER BY r.round_number DESC, m.id DESC
  LIMIT 1;
$$;

-- ── Filing the result ─────────────────────────────────────────────────────────
--
-- A thin wrapper, and thin is the point. Everything that decides whether this is
-- allowed — that the caller is one of the two players, that the score is
-- possible in this format, that the tournament is still running, that a
-- confirmed result is immutable — already lives in tournament_submit_result and
-- is reached here by becoming the caller rather than by being restated.
--
-- The result lands as awaiting_confirmation with the reporter set, exactly as a
-- report typed on the website does. A match decided in the Activity does not
-- skip the opponent's confirmation: life points are not evidence, and the
-- Activity's counter is a convenience for the two people playing.
CREATE OR REPLACE FUNCTION activity_submit_result(
  p_match           bigint,
  p_discord_user_id text,
  p_score_a         smallint,
  p_score_b         smallint,
  p_draws           smallint DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM discord_act_as(p_discord_user_id);
  RETURN tournament_submit_result(p_match, p_score_a, p_score_b, p_draws);
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Service role only. Both take a Discord snowflake and act as whoever owns it,
-- so anything able to call them with an arbitrary snowflake could impersonate
-- anybody — and the anon key sits in a browser and in the Activity's Worker.
--
-- Revoking from PUBLIC is not sufficient: Supabase's default privileges grant
-- EXECUTE to anon and authenticated DIRECTLY on every new function in this
-- schema, and a direct grant survives a revoke aimed at PUBLIC.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'activity_match_for_discord_user(text)',
    'activity_submit_result(bigint, text, smallint, smallint, smallint)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
