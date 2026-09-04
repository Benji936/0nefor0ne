-- Arena, part 2 of 3: getting into a tournament, and the standings table.
--
-- Every function here is SECURITY DEFINER with an explicit permission check as
-- its first act, following create_trade_proposal and confirm_trade_agreement.
-- The pattern matters more than any one function: a definer function bypasses
-- RLS, so the check it does itself IS the access control, and there is no
-- second line of defence behind it. Each one therefore names who may call it
-- before it touches a row.

-- ── Who is the organizer ──────────────────────────────────────────────────────
-- The owner of the community running the tournament, and nobody else. Kept as
-- one function so "organizer" is defined once; when judges arrive as a separate
-- role, this is the single place that learns about them.
CREATE OR REPLACE FUNCTION tournament_is_organizer(p_tournament bigint, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM tournament t
    JOIN community c ON c.id = t.community
    WHERE t.id = p_tournament AND c.owner = p_uid AND p_uid IS NOT NULL
  );
$$;

-- ── Standings ─────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: it reads through the SELECT policies rather than
-- around them, so a draft tournament's standings are visible to exactly the
-- people its rows are.
--
-- Tie breakers are deliberately thin. Points, then wins, then name — enough to
-- render a stable, explicable table. Opponent match-win percentage is the
-- obvious next one and is not here, because a tie breaker nobody has asked for
-- yet is a rule to maintain and explain for no benefit.
--
-- Only completed matches count. A match awaiting confirmation has not happened
-- yet as far as a standing is concerned, which is the point of confirmation.
CREATE OR REPLACE FUNCTION tournament_standings(p_tournament bigint)
RETURNS TABLE (
  entrant_id   bigint,
  player       uuid,
  display_name text,
  discord_user_id text,
  dropped      boolean,
  played       integer,
  wins         integer,
  draws        integer,
  losses       integer,
  byes         integer,
  points       integer,
  rank         integer
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  WITH cfg AS (
    SELECT points_win, points_draw, points_loss, points_bye
    FROM tournament WHERE id = p_tournament
  ),
  -- One row per player per completed match, from whichever side they were on.
  results AS (
    SELECT tp.id AS entrant_id,
           CASE
             WHEN m.player_b IS NULL              THEN 'bye'
             WHEN m.winner IS NULL                THEN 'draw'
             WHEN m.winner = tp.id                THEN 'win'
             ELSE                                      'loss'
           END AS outcome
    FROM tournament_player tp
    JOIN tournament_match m
      ON m.tournament = tp.tournament
     AND m.status = 'completed'
     AND (m.player_a = tp.id OR m.player_b = tp.id)
    WHERE tp.tournament = p_tournament
  ),
  tally AS (
    SELECT tp.id AS entrant_id,
           count(r.outcome) FILTER (WHERE r.outcome IS NOT NULL)::int AS played,
           count(*) FILTER (WHERE r.outcome = 'win')::int  AS wins,
           count(*) FILTER (WHERE r.outcome = 'draw')::int AS draws,
           count(*) FILTER (WHERE r.outcome = 'loss')::int AS losses,
           count(*) FILTER (WHERE r.outcome = 'bye')::int  AS byes
    FROM tournament_player tp
    LEFT JOIN results r ON r.entrant_id = tp.id
    WHERE tp.tournament = p_tournament
    GROUP BY tp.id
  )
  SELECT tp.id,
         tp.player,
         tp.display_name,
         tp.discord_user_id,
         tp.dropped_at IS NOT NULL,
         t.played, t.wins, t.draws, t.losses, t.byes,
         (t.wins * cfg.points_win + t.draws * cfg.points_draw
          + t.losses * cfg.points_loss + t.byes * cfg.points_bye)::int AS points,
         rank() OVER (
           ORDER BY (t.wins * cfg.points_win + t.draws * cfg.points_draw
                     + t.losses * cfg.points_loss + t.byes * cfg.points_bye) DESC,
                    t.wins DESC,
                    lower(tp.display_name) ASC
         )::int
  FROM tournament_player tp
  JOIN tally t ON t.entrant_id = tp.id
  CROSS JOIN cfg
  WHERE tp.tournament = p_tournament
  ORDER BY points DESC, t.wins DESC, lower(tp.display_name) ASC;
$$;

-- ── Register ──────────────────────────────────────────────────────────────────
-- Self-registration. The display name and Discord id are read from the caller's
-- own Trader row rather than accepted as arguments, so a registrant cannot
-- enter under somebody else's name or claim somebody else's Discord account.
--
-- Re-registering after dropping clears the drop rather than failing: a player
-- who dropped by accident should be able to come back, and UNIQUE(tournament,
-- player) means there is exactly one row to bring back.
CREATE OR REPLACE FUNCTION tournament_register(p_tournament bigint)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := auth.uid();
  t tournament%ROWTYPE;
  v_name text;
  v_discord text;
  v_count integer;
  v_id bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO t FROM tournament WHERE id = p_tournament FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF t.status NOT IN ('registration', 'check_in') THEN
    RAISE EXCEPTION 'registration is closed';
  END IF;

  SELECT coalesce(nullif(btrim("Name"), ''), 'Duelist'), discord_id
    INTO v_name, v_discord
    FROM "Trader" WHERE id = me;
  IF v_name IS NULL THEN v_name := 'Duelist'; END IF;

  -- Counted inside the same locked transaction as the insert, so two people
  -- taking the last seat at once cannot both get it.
  IF t.max_players IS NOT NULL THEN
    SELECT count(*) INTO v_count
      FROM tournament_player
     WHERE tournament = p_tournament AND dropped_at IS NULL AND player <> me;
    IF v_count >= t.max_players THEN RAISE EXCEPTION 'tournament is full'; END IF;
  END IF;

  INSERT INTO tournament_player (tournament, player, discord_user_id, display_name)
  VALUES (p_tournament, me, v_discord, left(v_name, 80))
  ON CONFLICT (tournament, player) DO UPDATE
    SET dropped_at      = NULL,
        display_name    = excluded.display_name,
        discord_user_id = excluded.discord_user_id
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── Withdraw / drop ───────────────────────────────────────────────────────────
-- A player drops themselves; an organizer may drop anyone. Dropping never
-- deletes the row: matches already played reference it, and a result that
-- vanishes when somebody leaves is a corrupted record of a round that happened.
--
-- Before the tournament starts, a drop is just a withdrawal. After it starts it
-- means "plays no further rounds", and the pairing engine skips them.
CREATE OR REPLACE FUNCTION tournament_drop(p_tournament bigint, p_player uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := auth.uid();
  v_target uuid := coalesce(p_player, auth.uid());
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  IF v_target <> me AND NOT tournament_is_organizer(p_tournament, me) THEN
    RAISE EXCEPTION 'only the organizer can drop another player';
  END IF;

  UPDATE tournament_player
     SET dropped_at = now()
   WHERE tournament = p_tournament AND player = v_target AND dropped_at IS NULL;
END;
$$;

-- ── Check-in ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tournament_check_in(p_tournament bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me uuid := auth.uid();
  v_status text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;
  SELECT status INTO v_status FROM tournament WHERE id = p_tournament;
  IF v_status IS NULL THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF v_status <> 'check_in' THEN RAISE EXCEPTION 'check-in is not open'; END IF;

  UPDATE tournament_player SET checked_in = true
   WHERE tournament = p_tournament AND player = me AND dropped_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'you are not registered'; END IF;
END;
$$;

-- ── Status transitions ────────────────────────────────────────────────────────
-- The organizer's controls: open registration, open check-in, cancel. Kept as
-- one function with an explicit transition table rather than four, because the
-- legal moves are the thing worth writing down in one place.
--
-- 'active' is absent on purpose: starting is tournament_start below, which has
-- work to do beyond setting a column.
CREATE OR REPLACE FUNCTION tournament_set_status(p_tournament bigint, p_status text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t tournament%ROWTYPE;
  v_ok boolean;
BEGIN
  IF NOT tournament_is_organizer(p_tournament) THEN
    RAISE EXCEPTION 'only the organizer can change a tournament';
  END IF;

  SELECT * INTO t FROM tournament WHERE id = p_tournament FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;

  v_ok := CASE
    WHEN p_status = 'registration' THEN t.status IN ('draft', 'check_in')
    WHEN p_status = 'check_in'     THEN t.status IN ('registration')
    WHEN p_status = 'draft'        THEN t.status IN ('registration', 'check_in')
    -- Cancelling is allowed from anywhere that is not already finished. It
    -- leaves every round and result in place: a cancelled tournament is a
    -- record of what was played before it stopped, not an erasure of it.
    WHEN p_status = 'cancelled'    THEN t.status <> 'completed'
    ELSE false
  END;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'cannot go from % to %', t.status, p_status;
  END IF;

  UPDATE tournament SET status = p_status WHERE id = p_tournament;
  RETURN p_status;
END;
$$;

-- ── Start ─────────────────────────────────────────────────────────────────────
-- Locks the field and works out how many rounds it should take. Does NOT pair
-- round one: an organizer who has just closed registration often wants a moment
-- before the first pairing goes out, and tournament_generate_round is one call
-- away when they are ready.
--
-- total_rounds is advisory, not a cap. Swiss says ceil(log2(n)) rounds settles a
-- field; a store running four rounds for six players because that is their
-- league night is not wrong, so nothing here refuses them.
CREATE OR REPLACE FUNCTION tournament_start(p_tournament bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t tournament%ROWTYPE;
  v_players integer;
  v_rounds smallint;
BEGIN
  IF NOT tournament_is_organizer(p_tournament) THEN
    RAISE EXCEPTION 'only the organizer can start a tournament';
  END IF;

  SELECT * INTO t FROM tournament WHERE id = p_tournament FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  -- Idempotent: starting an already-started tournament is a no-op that returns
  -- the same answer, so a double-clicked button cannot reshuffle anything.
  IF t.status = 'active' THEN
    RETURN jsonb_build_object('status', 'active', 'total_rounds', t.total_rounds,
                              'current_round', t.current_round, 'already_started', true);
  END IF;
  IF t.status NOT IN ('registration', 'check_in') THEN
    RAISE EXCEPTION 'cannot start a tournament that is %', t.status;
  END IF;

  -- During check-in, only players who checked in are in the field. Everyone
  -- else is dropped now rather than paired into a round they will not play.
  IF t.status = 'check_in' THEN
    UPDATE tournament_player SET dropped_at = now()
     WHERE tournament = p_tournament AND dropped_at IS NULL AND NOT checked_in;
  END IF;

  SELECT count(*) INTO v_players
    FROM tournament_player WHERE tournament = p_tournament AND dropped_at IS NULL;
  IF v_players < 2 THEN RAISE EXCEPTION 'need at least 2 players to start'; END IF;

  v_rounds := greatest(1, least(20, ceil(log(2, v_players))::int));

  -- The seed is the field's order at the moment it locked. Nothing pairs on it
  -- today — round one is paired at random — but it is what a later structure
  -- (single elimination, a cut to top 8) would bracket on, and it cannot be
  -- reconstructed after the fact.
  WITH ordered AS (
    SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
    FROM tournament_player WHERE tournament = p_tournament AND dropped_at IS NULL
  )
  UPDATE tournament_player tp SET seed = ordered.n
    FROM ordered WHERE tp.id = ordered.id;

  UPDATE tournament
     SET status = 'active', total_rounds = v_rounds, current_round = 0
   WHERE id = p_tournament;

  RETURN jsonb_build_object('status', 'active', 'total_rounds', v_rounds,
                            'players', v_players, 'current_round', 0, 'already_started', false);
END;
$$;

-- ── Finish ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tournament_finish(p_tournament bigint)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t tournament%ROWTYPE;
  v_open integer;
BEGIN
  IF NOT tournament_is_organizer(p_tournament) THEN
    RAISE EXCEPTION 'only the organizer can finish a tournament';
  END IF;

  SELECT * INTO t FROM tournament WHERE id = p_tournament FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF t.status = 'completed' THEN RETURN 'completed'; END IF;
  IF t.status <> 'active' THEN RAISE EXCEPTION 'cannot finish a tournament that is %', t.status; END IF;

  SELECT count(*) INTO v_open
    FROM tournament_match WHERE tournament = p_tournament AND status <> 'completed';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'still % unfinished match(es)', v_open;
  END IF;

  UPDATE tournament SET status = 'completed' WHERE id = p_tournament;
  RETURN 'completed';
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Supabase's default privileges grant EXECUTE on every new function in this
-- schema to anon and authenticated DIRECTLY, and a direct grant survives a
-- REVOKE aimed at PUBLIC. So each revoke names the roles as well — the same
-- correction 20260809_discord_event_posts.sql documents.
REVOKE ALL ON FUNCTION tournament_is_organizer(bigint, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tournament_is_organizer(bigint, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION tournament_standings(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tournament_standings(bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION tournament_register(bigint)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tournament_drop(bigint, uuid)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tournament_check_in(bigint)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tournament_set_status(bigint, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tournament_start(bigint)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tournament_finish(bigint)              FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION tournament_register(bigint)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tournament_drop(bigint, uuid)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tournament_check_in(bigint)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tournament_set_status(bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tournament_start(bigint)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tournament_finish(bigint)           TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
