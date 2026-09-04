-- Pin the search_path on the four tournament functions that were missing it.
--
-- Caught by Supabase's own `function_search_path_mutable` advisor after the
-- Arena migrations were applied. It is a separate migration rather than an edit
-- to the four files that created these functions, because those have already
-- run: editing an applied migration leaves the repository describing a history
-- the database never had.
--
-- tournament_guard is the one that actually matters. It is a trigger that fires
-- on every insert and update of a tournament row and calls auth.uid(), so a
-- role-mutable search_path there is a real, if narrow, hardening gap — an
-- attacker who could get a schema ahead of `public` on the search path could
-- shadow what it resolves. The other three reference nothing outside the schema
-- and are pinned because it costs nothing and leaves the advisor with nothing
-- to say.
--
-- Each definition below is otherwise byte-identical to the one it replaces.
--
-- The grants at the bottom are belt and braces, not a fix: PostgreSQL preserves
-- ownership and privileges across CREATE OR REPLACE FUNCTION, so nothing here
-- reopens. They are restated so that this file read on its own still says what
-- the boundary is.

CREATE OR REPLACE FUNCTION tournament_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- The discriminator is current_user, NOT the role inside request.jwt.claims:
-- the privileged writer here is a SECURITY DEFINER function called BY the
-- owner, so the JWT still says "authenticated" all the way down. See the
-- original commentary in 20260904141735_tournament_schema.sql.
CREATE OR REPLACE FUNCTION tournament_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status        := 'draft';
    NEW.total_rounds  := NULL;
    NEW.current_round := 0;
    NEW.created_by    := auth.uid();
  ELSE
    NEW.community     := OLD.community;
    NEW.status        := OLD.status;
    NEW.total_rounds  := OLD.total_rounds;
    NEW.current_round := OLD.current_round;
    NEW.created_by    := OLD.created_by;
    IF OLD.current_round > 0 THEN
      NEW.points_win    := OLD.points_win;
      NEW.points_draw   := OLD.points_draw;
      NEW.points_loss   := OLD.points_loss;
      NEW.points_bye    := OLD.points_bye;
      NEW.match_format  := OLD.match_format;
      NEW.structure     := OLD.structure;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tournament_score_is_legal(
  p_match_format smallint, p_score_a smallint, p_score_b smallint, p_draws smallint
) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT p_score_a >= 0 AND p_score_b >= 0 AND p_draws >= 0
     AND (p_score_a + p_score_b + p_draws) BETWEEN 1 AND p_match_format
     AND greatest(p_score_a, p_score_b) <= (floor(p_match_format / 2) + 1);
$$;

CREATE OR REPLACE FUNCTION discord_pending_round_posts(p_limit integer DEFAULT 5)
RETURNS TABLE (
  round_id bigint, tournament_id bigint, guild_id text,
  tournament_name text, round_number smallint, total_rounds smallint,
  community_name text, community_slug text,
  pairings jsonb
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
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

REVOKE ALL ON FUNCTION tournament_score_is_legal(smallint, smallint, smallint, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tournament_score_is_legal(smallint, smallint, smallint, smallint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION discord_pending_round_posts(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION discord_pending_round_posts(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION discord_pending_round_posts(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
