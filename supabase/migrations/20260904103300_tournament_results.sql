-- Arena, part 3b: reporting a result, and agreeing on it.
--
-- The rule this whole file exists to enforce: a winner is never inferred from
-- life points. A physical game ends by deck-out, by concession, by a slow-play
-- ruling, by somebody dropping their hand on the floor. The Activity's life
-- counter is a convenience for the people playing, not evidence, and nothing
-- here reads it.
--
-- The confirmation shape is lifted from confirm_trade_agreement in
-- 20260828132059_staged_binder_trade_workflow.sql, because the problem is the
-- same one: two people have to agree on a record neither of them can write
-- alone. One side reports, the other confirms or disputes, and the row is taken
-- FOR UPDATE so a confirmation cannot land against a result that has since
-- changed under it.

-- ── Is this a score a match could actually have ended on ──────────────────────
-- IMMUTABLE and standalone so the website can be shown to apply the same rule
-- (frontend/src/lib/tournaments.js) rather than a similar one.
--
-- A match that ran out of time at 1–1 is real and legal, so a decided winner is
-- not required — only that nobody won more games than the format allows and
-- that something was played.
CREATE OR REPLACE FUNCTION tournament_score_is_legal(
  p_match_format smallint, p_score_a smallint, p_score_b smallint, p_draws smallint
) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_score_a >= 0 AND p_score_b >= 0 AND p_draws >= 0
     AND (p_score_a + p_score_b + p_draws) BETWEEN 1 AND p_match_format
     AND greatest(p_score_a, p_score_b) <= (floor(p_match_format / 2) + 1);
$$;

-- Which entrant row the caller is in this match, or NULL if they are not in it.
CREATE OR REPLACE FUNCTION tournament_entrant_in_match(p_match bigint, p_uid uuid DEFAULT auth.uid())
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT tp.id
    FROM tournament_match m
    JOIN tournament_player tp
      ON tp.id IN (m.player_a, m.player_b)
   WHERE m.id = p_match AND tp.player = p_uid AND p_uid IS NOT NULL
   LIMIT 1;
$$;

-- ── Submit ────────────────────────────────────────────────────────────────────
-- Either player reports the games. The result is not yet a fact: it moves the
-- match to awaiting_confirmation and waits for the other side.
--
-- Re-submitting is allowed, but only by the player who reported. Correcting
-- your own typo before your opponent has acted is ordinary; letting the
-- opponent answer a report by overwriting it would be a dispute pretending to
-- be an edit, and there is a function for that below.
CREATE OR REPLACE FUNCTION tournament_submit_result(
  p_match   bigint,
  p_score_a smallint,
  p_score_b smallint,
  p_draws   smallint DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me       uuid := auth.uid();
  v_me     bigint;
  m        tournament_match%ROWTYPE;
  t        tournament%ROWTYPE;
  v_winner bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO m FROM tournament_match WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;

  v_me := tournament_entrant_in_match(p_match, me);
  IF v_me IS NULL THEN RAISE EXCEPTION 'you are not playing this match'; END IF;
  IF m.player_b IS NULL THEN RAISE EXCEPTION 'a bye has no result to report'; END IF;

  IF m.status = 'completed' THEN
    RAISE EXCEPTION 'this result is final; ask the organizer to change it';
  END IF;
  IF m.status = 'disputed' THEN
    RAISE EXCEPTION 'this match is disputed; the organizer decides it';
  END IF;
  IF m.status = 'awaiting_confirmation' AND m.reported_by IS DISTINCT FROM v_me THEN
    RAISE EXCEPTION 'your opponent reported a result; confirm it or dispute it';
  END IF;

  SELECT * INTO t FROM tournament WHERE id = m.tournament;
  IF t.status <> 'active' THEN RAISE EXCEPTION 'the tournament is %', t.status; END IF;

  IF NOT tournament_score_is_legal(t.match_format, p_score_a, p_score_b, p_draws) THEN
    RAISE EXCEPTION 'not a legal score for a best of %', t.match_format;
  END IF;

  -- Equal games is a draw, and a draw has no winner. `winner` must never be
  -- read without `status`, which is why it is left NULL rather than given a
  -- sentinel: there is no such player.
  v_winner := CASE
                WHEN p_score_a > p_score_b THEN m.player_a
                WHEN p_score_b > p_score_a THEN m.player_b
                ELSE NULL
              END;

  UPDATE tournament_match
     SET score_a = p_score_a, score_b = p_score_b, draws = p_draws,
         winner = v_winner,
         status = 'awaiting_confirmation',
         reported_by = v_me, reported_at = now(),
         started_at = coalesce(started_at, now())
   WHERE id = p_match;

  RETURN jsonb_build_object(
    'status', 'awaiting_confirmation',
    'reported_by', v_me,
    'awaiting', CASE WHEN v_me = m.player_a THEN m.player_b ELSE m.player_a END
  );
END;
$$;

-- ── Confirm ───────────────────────────────────────────────────────────────────
-- The other side agrees. This is the moment the result becomes a fact: the
-- match completes, points are posted, and the round closes if it was the last
-- one open. From here it is immutable to both players.
CREATE OR REPLACE FUNCTION tournament_confirm_result(p_match bigint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me   uuid := auth.uid();
  v_me bigint;
  m    tournament_match%ROWTYPE;
  v_round_done boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO m FROM tournament_match WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF m.status = 'completed' THEN
    RETURN jsonb_build_object('status', 'completed', 'already', true);
  END IF;
  IF m.status <> 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'there is no reported result to confirm';
  END IF;

  v_me := tournament_entrant_in_match(p_match, me);
  IF v_me IS NULL THEN RAISE EXCEPTION 'you are not playing this match'; END IF;
  -- Confirming your own report would make the second signature worthless.
  IF v_me = m.reported_by THEN
    RAISE EXCEPTION 'your opponent has to confirm this result';
  END IF;

  UPDATE tournament_match SET confirmed_at = now() WHERE id = p_match;
  PERFORM tournament_settle_match(p_match);

  SELECT status = 'completed' INTO v_round_done FROM tournament_round WHERE id = m.round;

  RETURN jsonb_build_object('status', 'completed', 'already', false, 'round_complete', coalesce(v_round_done, false));
END;
$$;

-- ── Dispute ───────────────────────────────────────────────────────────────────
-- The other side does not agree. Nothing is scored and nothing is decided; the
-- match parks until an organizer rules on it. Deliberately cheap to do: a
-- player who is unsure should dispute rather than confirm something wrong,
-- because a confirmed result costs a judge far more to unwind.
CREATE OR REPLACE FUNCTION tournament_dispute_result(p_match bigint, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  me   uuid := auth.uid();
  v_me bigint;
  m    tournament_match%ROWTYPE;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'; END IF;

  SELECT * INTO m FROM tournament_match WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF m.status = 'completed' THEN
    RAISE EXCEPTION 'this result is final; ask the organizer to change it';
  END IF;
  IF m.status <> 'awaiting_confirmation' THEN
    RAISE EXCEPTION 'there is no reported result to dispute';
  END IF;

  v_me := tournament_entrant_in_match(p_match, me);
  IF v_me IS NULL THEN RAISE EXCEPTION 'you are not playing this match'; END IF;
  IF v_me = m.reported_by THEN
    RAISE EXCEPTION 'change your own report instead of disputing it';
  END IF;

  UPDATE tournament_match
     SET status = 'disputed', disputed_at = now(), disputed_by = v_me,
         dispute_reason = left(nullif(btrim(p_reason), ''), 500)
   WHERE id = p_match;

  RETURN jsonb_build_object('status', 'disputed');
END;
$$;

-- ── Resolve ───────────────────────────────────────────────────────────────────
-- The organizer's ruling, and the only way a completed result ever changes.
--
-- Works on any match in the tournament, not only a disputed one: a table that
-- never reported because both players left, a result both sides confirmed and
-- then noticed was backwards. That is the same authority in all three cases and
-- splitting it into three functions would only mean three places to get the
-- points accounting wrong.
--
-- Overturning something already scored reverses its ledger rows first, so the
-- correction is visible as a correction. Nothing is edited in place, and a
-- player can be shown why their total moved.
CREATE OR REPLACE FUNCTION tournament_resolve_match(
  p_match   bigint,
  p_score_a smallint,
  p_score_b smallint,
  p_draws   smallint DEFAULT 0,
  p_note    text     DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  m        tournament_match%ROWTYPE;
  t        tournament%ROWTYPE;
  v_winner bigint;
  v_reopened boolean := false;
BEGIN
  SELECT * INTO m FROM tournament_match WHERE id = p_match FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;

  IF NOT tournament_is_organizer(m.tournament) THEN
    RAISE EXCEPTION 'only the organizer can resolve a match';
  END IF;
  IF m.player_b IS NULL THEN RAISE EXCEPTION 'a bye has no result to resolve'; END IF;

  SELECT * INTO t FROM tournament WHERE id = m.tournament;
  IF NOT tournament_score_is_legal(t.match_format, p_score_a, p_score_b, p_draws) THEN
    RAISE EXCEPTION 'not a legal score for a best of %', t.match_format;
  END IF;

  -- Already scored: take the points back before writing the new result, so the
  -- ledger reads as posted-then-reversed-then-reposted rather than as a number
  -- that changed for no recorded reason.
  IF m.status = 'completed' THEN
    PERFORM tournament_reverse_points(p_match, 'overturned by the organizer');
    UPDATE tournament_round SET status = 'active', completed_at = NULL
     WHERE id = m.round AND status = 'completed';
    v_reopened := true;
  END IF;

  v_winner := CASE
                WHEN p_score_a > p_score_b THEN m.player_a
                WHEN p_score_b > p_score_a THEN m.player_b
                ELSE NULL
              END;

  UPDATE tournament_match
     SET score_a = p_score_a, score_b = p_score_b, draws = p_draws,
         winner = v_winner,
         status = 'awaiting_confirmation',   -- settle_match takes it from here
         resolved_by = auth.uid(),
         resolution_note = left(nullif(btrim(p_note), ''), 500),
         completed_at = NULL
   WHERE id = p_match;

  PERFORM tournament_settle_match(p_match);

  RETURN jsonb_build_object('status', 'completed', 'reopened', v_reopened, 'winner', v_winner);
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION tournament_score_is_legal(smallint, smallint, smallint, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tournament_score_is_legal(smallint, smallint, smallint, smallint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION tournament_entrant_in_match(bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tournament_entrant_in_match(bigint, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION tournament_submit_result(bigint, smallint, smallint, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tournament_confirm_result(bigint)                               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tournament_dispute_result(bigint, text)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION tournament_resolve_match(bigint, smallint, smallint, smallint, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION tournament_submit_result(bigint, smallint, smallint, smallint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tournament_confirm_result(bigint)                               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tournament_dispute_result(bigint, text)                         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tournament_resolve_match(bigint, smallint, smallint, smallint, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
