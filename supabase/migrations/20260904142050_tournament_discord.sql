-- Arena, part 4: what the Discord bot is allowed to ask.
--
-- The bot holds a service-role key, so it bypasses RLS and auth.uid() is NULL
-- inside anything it calls. That is a problem for tournament_register and the
-- rest, which are written around "whoever is calling this". Rewriting them to
-- take a user id would mean two implementations of every permission check and,
-- eventually, two different answers.
--
-- So instead: each function here resolves a Discord snowflake to the account
-- that owns it, puts that account into request.jwt.claims for the length of the
-- transaction, and calls the ordinary function. The bot impersonates a user it
-- has verified rather than getting its own privileged path, and every rule in
-- the previous three migrations applies to it unchanged.
--
-- What makes that safe is where the snowflake comes from. Discord signs the
-- interaction; the bot reads the user id off it and never off anything a user
-- typed. And every function here is service-role only, so a browser holding the
-- anon key cannot reach them to impersonate anybody.
--
-- The Trader.discord_id link these depend on already exists and is maintained by
-- two auth triggers (20260706_discord_link.sql).

-- ── Impersonation, for the length of one transaction ──────────────────────────
-- set_config with is_local = true is bounded by the transaction, and a function
-- call is always in one, so the claim cannot leak into a later request on the
-- same pooled connection.
--
-- Note this deliberately does NOT change current_user: tournament_guard reads
-- current_user to decide whether a write is a direct client write, and it must
-- keep seeing the definer. See the long comment on that trigger.
CREATE OR REPLACE FUNCTION discord_act_as(p_discord_user_id text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM "Trader" WHERE discord_id = p_discord_user_id;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no_account' USING
      HINT = 'This Discord account is not linked to a 0nefor.one account yet.';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
  RETURN v_uid;
END;
$$;

-- ── What is running in this server ────────────────────────────────────────────
-- The guild → community link is community_claim.discord_guild_id, joined on
-- claimer = owner for the reason every other consumer does it: a shop that
-- changed hands holds a claim row per claimer, and only the current owner's
-- server is theirs.
CREATE OR REPLACE FUNCTION discord_tournaments_for_guild(p_guild_id text)
RETURNS TABLE (
  tournament_id bigint, name text, status text,
  current_round smallint, total_rounds smallint, match_format smallint,
  starts_at timestamptz, community_slug text, community_name text,
  players integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT t.id, t.name, t.status, t.current_round, t.total_rounds, t.match_format,
         t.starts_at, c.slug, c.name,
         (SELECT count(*)::int FROM tournament_player tp
           WHERE tp.tournament = t.id AND tp.dropped_at IS NULL)
  FROM tournament t
  JOIN community c        ON c.id = t.community
  JOIN community_claim cc ON cc.community = c.id AND cc.claimer = c.owner
  WHERE cc.discord_guild_id = p_guild_id
    AND c.verified AND c.status = 'published'
    AND t.status IN ('registration', 'check_in', 'active')
  ORDER BY t.starts_at NULLS LAST, t.id;
$$;

-- ── The player loop, from Discord ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION discord_tournament_register(p_tournament bigint, p_discord_user_id text)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM discord_act_as(p_discord_user_id);
  RETURN tournament_register(p_tournament);
END;
$$;

CREATE OR REPLACE FUNCTION discord_tournament_drop(p_tournament bigint, p_discord_user_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM discord_act_as(p_discord_user_id);
  PERFORM tournament_drop(p_tournament, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION discord_tournament_check_in(p_tournament bigint, p_discord_user_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM discord_act_as(p_discord_user_id);
  PERFORM tournament_check_in(p_tournament);
END;
$$;

-- Starting the next round is the one organizer action worth having in Discord:
-- it is repeated every round, it needs no form, and the organizer is standing in
-- the room rather than at a laptop. Setup stays on the website, where the form
-- is. tournament_generate_round does the permission check itself, against the
-- impersonated account.
CREATE OR REPLACE FUNCTION discord_tournament_generate_round(p_tournament bigint, p_discord_user_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM discord_act_as(p_discord_user_id);
  RETURN tournament_generate_round(p_tournament);
END;
$$;

-- ── "Where am I playing" ──────────────────────────────────────────────────────
-- The single most-asked question at a tournament, answered without the player
-- leaving Discord. Returns nothing when they are not in the current round.
CREATE OR REPLACE FUNCTION discord_my_pairing(p_tournament bigint, p_discord_user_id text)
RETURNS TABLE (
  match_id bigint, round_number smallint, table_number smallint,
  me text, opponent text, opponent_discord_id text,
  status text, score_me smallint, score_them smallint, is_bye boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid;
  v_entrant bigint;
BEGIN
  SELECT id INTO v_uid FROM "Trader" WHERE discord_id = p_discord_user_id;
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT tp.id INTO v_entrant
    FROM tournament_player tp
   WHERE tp.tournament = p_tournament AND tp.player = v_uid;
  IF v_entrant IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT m.id, r.round_number, m.table_number,
         me.display_name,
         opp.display_name,
         opp.discord_user_id,
         m.status,
         CASE WHEN m.player_a = v_entrant THEN m.score_a ELSE m.score_b END,
         CASE WHEN m.player_a = v_entrant THEN m.score_b ELSE m.score_a END,
         m.player_b IS NULL
    FROM tournament_match m
    JOIN tournament_round r  ON r.id = m.round
    JOIN tournament_player me ON me.id = v_entrant
    LEFT JOIN tournament_player opp
      ON opp.id = CASE WHEN m.player_a = v_entrant THEN m.player_b ELSE m.player_a END
   WHERE m.tournament = p_tournament
     AND (m.player_a = v_entrant OR m.player_b = v_entrant)
   ORDER BY r.round_number DESC
   LIMIT 1;
END;
$$;

-- ── Round announcements ───────────────────────────────────────────────────────
--
-- Same ledger shape as community_event_post: the primary key is the idempotency
-- guarantee, so two bot instances racing produce one failed insert rather than
-- two pairing sheets in the same channel.
--
-- Unlike the event ledger there is deliberately NO retraction. An event that is
-- no longer happening must come down, because it is an invitation. A round
-- announcement is a pairing sheet — a record of what was played — and players
-- scroll back to it. If a tournament is cancelled the bot says so in a new
-- message rather than deleting the history of the rounds that did happen.
CREATE TABLE IF NOT EXISTS tournament_round_post (
  round      bigint PRIMARY KEY,
  tournament bigint,
  guild_id   text NOT NULL,
  channel_id text,
  message_id text,
  posted_at  timestamptz NOT NULL DEFAULT now(),
  -- A permanent failure (no such channel, no permission). The row exists so the
  -- bot stops retrying every minute forever, and so the reason survives for
  -- whoever asks why nothing appeared.
  error      text
);

-- Nobody but the bot touches this. RLS on with no policies means exactly that.
ALTER TABLE tournament_round_post ENABLE ROW LEVEL SECURITY;

-- What the bot should announce next: a round that exists, in a guild run by the
-- verified community that owns the tournament, with nothing posted for it yet.
--
-- The pairings come back as jsonb rather than a second query, because the bot
-- renders the whole sheet in one message and a per-table round trip would make
-- a sixteen-table round sixteen queries.
CREATE OR REPLACE FUNCTION discord_pending_round_posts(p_limit integer DEFAULT 5)
RETURNS TABLE (
  round_id bigint, tournament_id bigint, guild_id text,
  tournament_name text, round_number smallint, total_rounds smallint,
  community_name text, community_slug text,
  pairings jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT r.id, t.id, cc.discord_guild_id,
         t.name, r.round_number, t.total_rounds,
         c.name, c.slug,
         (
           SELECT coalesce(jsonb_agg(x ORDER BY x->>'table'), '[]'::jsonb)
           FROM (
             SELECT jsonb_build_object(
                      'table', m.table_number,
                      'a',     pa.display_name,
                      'b',     pb.display_name,
                      'a_discord', pa.discord_user_id,
                      'b_discord', pb.discord_user_id,
                      'bye',   m.player_b IS NULL
                    ) AS x
             FROM tournament_match m
             JOIN tournament_player pa ON pa.id = m.player_a
             LEFT JOIN tournament_player pb ON pb.id = m.player_b
             WHERE m.round = r.id
           ) s
         )
  FROM tournament_round r
  JOIN tournament t       ON t.id = r.tournament
  JOIN community c        ON c.id = t.community
  JOIN community_claim cc ON cc.community = c.id AND cc.claimer = c.owner
  LEFT JOIN tournament_round_post p ON p.round = r.id
  WHERE c.verified
    AND c.status = 'published'
    AND t.status = 'active'
    AND cc.discord_guild_id IS NOT NULL
    AND p.round IS NULL
  ORDER BY r.started_at
  LIMIT least(greatest(p_limit, 1), 20);
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Every function above is service-role only, and that is the whole security
-- story: they take a Discord id as an argument and act as whoever owns it, so
-- anything that could call them with an arbitrary snowflake could impersonate
-- anybody. The anon key sits in the browser and in the Activity's Worker.
--
-- Revoking from PUBLIC is not sufficient. Supabase's default privileges grant
-- EXECUTE to anon and authenticated DIRECTLY on every new function in this
-- schema, and a direct grant survives a revoke aimed at PUBLIC — the correction
-- 20260809_discord_event_posts.sql documents.
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'discord_act_as(text)',
    'discord_tournaments_for_guild(text)',
    'discord_tournament_register(bigint, text)',
    'discord_tournament_drop(bigint, text)',
    'discord_tournament_check_in(bigint, text)',
    'discord_tournament_generate_round(bigint, text)',
    'discord_my_pairing(bigint, text)',
    'discord_pending_round_posts(integer)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
