-- Arena, part 3a: settling a match, and pairing a round.
--
-- Settlement lives here rather than with the result functions because a bye is
-- settled the moment it is created, during pairing, and the two paths must post
-- points the same way. One function, called from four places, is the only way
-- that stays true.

-- ── Posting points for a settled match ────────────────────────────────────────
-- Append-only. Reversal rows are written by the dispute-resolution path when a
-- completed match is overturned; nothing here ever updates or deletes a row,
-- so a balance is always SUM(amount) and always explicable.
CREATE OR REPLACE FUNCTION tournament_post_points(p_match bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m tournament_match%ROWTYPE;
  t tournament%ROWTYPE;
  r RECORD;
BEGIN
  SELECT * INTO m FROM tournament_match WHERE id = p_match;
  IF NOT FOUND OR m.status <> 'completed' THEN RETURN; END IF;
  SELECT * INTO t FROM tournament WHERE id = m.tournament;

  FOR r IN
    SELECT tp.id AS entrant_id, tp.player,
           CASE
             WHEN m.player_b IS NULL THEN 'match_bye'
             WHEN m.winner IS NULL   THEN 'match_draw'
             WHEN m.winner = tp.id   THEN 'match_win'
             ELSE                         'match_loss'
           END AS reason
    FROM tournament_player tp
    WHERE tp.id = m.player_a OR tp.id = m.player_b
  LOOP
    INSERT INTO point_ledger (player, community, tournament, match, amount, reason, created_by)
    VALUES (
      r.player, t.community, t.id, m.id,
      CASE r.reason
        WHEN 'match_bye'  THEN t.points_bye
        WHEN 'match_win'  THEN t.points_win
        WHEN 'match_draw' THEN t.points_draw
        ELSE                   t.points_loss
      END,
      r.reason, auth.uid()
    );
  END LOOP;
END;
$$;

-- ── Reversing a settled match ─────────────────────────────────────────────────
-- Used when a judge overturns a completed result. Posts the negation of every
-- row this match has produced so far, so the balance returns to what it was
-- before the match without any row being rewritten.
--
-- Both players get a reversal row even when one of them nets zero — a loss is
-- worth 0 points by default, so filtering those out would leave a ruling that
-- appears to have touched only the winner's record. The point of the ledger is
-- that a player can be shown what happened to their result, and "nothing, because
-- the arithmetic cancelled" is still something that happened to it.
--
-- The sum covers EVERY row for the match, earlier reversals included, so it is
-- the running balance that gets negated. Excluding prior reversals would make a
-- second overturn re-reverse the first posting and send the total negative.
CREATE OR REPLACE FUNCTION tournament_reverse_points(p_match bigint, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO point_ledger (player, community, tournament, match, amount, reason, note, created_by)
  SELECT player, community, tournament, match, -sum(amount), 'reversal', left(p_note, 200), auth.uid()
    FROM point_ledger
   WHERE match = p_match
   GROUP BY player, community, tournament, match;
END;
$$;

-- ── Settling a match ──────────────────────────────────────────────────────────
-- Marks it completed, posts its points, and closes the round if it was the last
-- one outstanding. The round closing is here rather than in a trigger so the
-- whole transition happens inside one transaction with the caller's lock: a
-- round can never be observed complete while one of its matches is not.
CREATE OR REPLACE FUNCTION tournament_settle_match(p_match bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m tournament_match%ROWTYPE;
  v_open integer;
BEGIN
  UPDATE tournament_match
     SET status = 'completed', completed_at = coalesce(completed_at, now())
   WHERE id = p_match AND status <> 'completed'
  RETURNING * INTO m;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM tournament_post_points(p_match);

  SELECT count(*) INTO v_open
    FROM tournament_match WHERE round = m.round AND status <> 'completed';
  IF v_open = 0 THEN
    UPDATE tournament_round
       SET status = 'completed', completed_at = now()
     WHERE id = m.round AND status <> 'completed';
  END IF;
END;
$$;

-- ── Pairing a round ───────────────────────────────────────────────────────────
--
-- Swiss, kept as simple as Swiss gets: sort the field by points, pair down the
-- list, skip a rematch where one is available, give the bye to whoever has not
-- had one. Everything past that — accelerated pairings, opponent match-win
-- tie breakers, avoiding same-store pairings — is absent on purpose. None of it
-- has been asked for, and each one is a rule that has to be explained to a
-- player who does not like the pairing they got.
--
-- The engine is one branch on tournament.structure. Adding single elimination
-- later means another branch and another CHECK value, not a rewrite of the
-- callers, which is the only kind of modularity worth paying for right now.
--
-- Idempotency, which the brief calls out specifically: the tournament row is
-- taken FOR UPDATE before anything is read, so two organizers clicking at the
-- same moment serialize rather than interleave. The second one then finds
-- current_round already advanced and returns the round the first one made.
-- UNIQUE (tournament, round_number) is the backstop underneath that, so even a
-- caller that somehow skipped the lock cannot produce a second set of pairings.
CREATE OR REPLACE FUNCTION tournament_generate_round(p_tournament bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  t             tournament%ROWTYPE;
  v_round_no    smallint;
  v_round       bigint;
  v_existing    bigint;
  v_open        integer;
  v_ids         bigint[];
  v_taken       boolean[];
  v_bye         bigint;
  v_n           integer;
  i             integer;
  j             integer;
  v_partner     integer;
  v_table       smallint := 1;
  v_win_score   smallint;
  v_match       bigint;
  v_pairs       integer := 0;
BEGIN
  IF NOT tournament_is_organizer(p_tournament) THEN
    RAISE EXCEPTION 'only the organizer can start a round';
  END IF;

  SELECT * INTO t FROM tournament WHERE id = p_tournament FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF t.status <> 'active' THEN
    RAISE EXCEPTION 'cannot pair a tournament that is %', t.status;
  END IF;

  -- A round is only over when every match in it is settled. Pairing the next
  -- one before that would mean standings that change under a pairing already
  -- published, which is the one thing an organizer can never take back.
  SELECT count(*) INTO v_open
    FROM tournament_match WHERE tournament = p_tournament AND status <> 'completed';
  IF v_open > 0 THEN
    RAISE EXCEPTION 'round % still has % unfinished match(es)', t.current_round, v_open;
  END IF;

  v_round_no := (t.current_round + 1)::smallint;

  -- The double-click case. Reached only if current_round somehow lags the rows,
  -- which the lock above should prevent; answered rather than raised, because
  -- the caller asked for a round to exist and it does.
  SELECT id INTO v_existing
    FROM tournament_round WHERE tournament = p_tournament AND round_number = v_round_no;
  IF FOUND THEN
    UPDATE tournament SET current_round = v_round_no WHERE id = p_tournament;
    RETURN jsonb_build_object('round_id', v_existing, 'round_number', v_round_no, 'created', false);
  END IF;

  -- The field, best first, shuffled inside each score bracket. Round one has no
  -- points yet, so this is a pure random draw — which is what it should be.
  SELECT array_agg(s.entrant_id ORDER BY s.points DESC, random())
    INTO v_ids
    FROM tournament_standings(p_tournament) s
   WHERE NOT s.dropped;

  v_n := coalesce(array_length(v_ids, 1), 0);
  IF v_n < 2 THEN RAISE EXCEPTION 'need at least 2 active players to pair a round'; END IF;

  INSERT INTO tournament_round (tournament, round_number)
  VALUES (p_tournament, v_round_no)
  RETURNING id INTO v_round;

  -- Odd field: the bye goes to the lowest-ranked player who has not had one,
  -- because a second bye is worth more than a first and handing it to the same
  -- person twice is the complaint every organizer gets.
  IF v_n % 2 = 1 THEN
    FOR i IN REVERSE v_n..1 LOOP
      IF NOT EXISTS (
        SELECT 1 FROM tournament_match m
         WHERE m.tournament = p_tournament AND m.player_b IS NULL AND m.player_a = v_ids[i]
      ) THEN
        v_bye := v_ids[i];
        EXIT;
      END IF;
    END LOOP;
    -- Everyone has had one. Somebody still has to sit out.
    IF v_bye IS NULL THEN v_bye := v_ids[v_n]; END IF;

    v_ids := array_remove(v_ids, v_bye);
    v_n := v_n - 1;
  END IF;

  -- Games needed to take the match: 1 of 1, 2 of 3, 3 of 5. Same arithmetic as
  -- roundsToWin() in the Activity's duelReducer.
  v_win_score := (floor(t.match_format / 2) + 1)::smallint;

  v_taken := array_fill(false, ARRAY[greatest(v_n, 1)]);

  i := 1;
  WHILE i <= v_n LOOP
    IF v_taken[i] THEN i := i + 1; CONTINUE; END IF;

    v_partner := NULL;
    -- Nearest opponent down the list they have not already played.
    FOR j IN (i + 1)..v_n LOOP
      IF NOT v_taken[j] AND NOT EXISTS (
        SELECT 1 FROM tournament_match m
         WHERE m.tournament = p_tournament
           AND ((m.player_a = v_ids[i] AND m.player_b = v_ids[j])
             OR (m.player_a = v_ids[j] AND m.player_b = v_ids[i]))
      ) THEN
        v_partner := j;
        EXIT;
      END IF;
    END LOOP;

    -- In a small field run long enough, everyone left has met everyone left.
    -- A rematch beats refusing to pair the round.
    IF v_partner IS NULL THEN
      FOR j IN (i + 1)..v_n LOOP
        IF NOT v_taken[j] THEN v_partner := j; EXIT; END IF;
      END LOOP;
    END IF;

    EXIT WHEN v_partner IS NULL;

    INSERT INTO tournament_match (tournament, round, table_number, player_a, player_b, status)
    VALUES (p_tournament, v_round, v_table, v_ids[i], v_ids[v_partner], 'pending');

    v_taken[i] := true;
    v_taken[v_partner] := true;
    v_table := v_table + 1;
    v_pairs := v_pairs + 1;
    i := i + 1;
  END LOOP;

  -- The bye is a real, completed match at a real table number, so it appears in
  -- the round, counts towards the record, and is accounted for when the round
  -- is checked for completion.
  IF v_bye IS NOT NULL THEN
    INSERT INTO tournament_match (tournament, round, table_number, player_a, player_b,
                                  score_a, score_b, winner, status, completed_at)
    VALUES (p_tournament, v_round, v_table, v_bye, NULL,
            v_win_score, 0, v_bye, 'completed', now())
    RETURNING id INTO v_match;
    PERFORM tournament_post_points(v_match);
  END IF;

  UPDATE tournament SET current_round = v_round_no WHERE id = p_tournament;

  RETURN jsonb_build_object(
    'round_id', v_round, 'round_number', v_round_no, 'created', true,
    'matches', v_pairs, 'bye', v_bye
  );
END;
$$;

REVOKE ALL ON FUNCTION tournament_post_points(bigint)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tournament_reverse_points(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION tournament_settle_match(bigint)         FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tournament_post_points(bigint)          TO service_role;
GRANT EXECUTE ON FUNCTION tournament_reverse_points(bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION tournament_settle_match(bigint)         TO service_role;

REVOKE ALL ON FUNCTION tournament_generate_round(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tournament_generate_round(bigint) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
