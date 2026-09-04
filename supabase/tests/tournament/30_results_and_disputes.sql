\set ON_ERROR_STOP on
\echo '── 8. Reporting a result, and who may do what ──'
DO $$
DECLARE m RECORD; v_a uuid; v_b uuid; v_out uuid;
BEGIN
  SELECT id, player_a, player_b INTO m FROM tournament_match WHERE round = 1 AND player_b IS NOT NULL ORDER BY table_number LIMIT 1;
  SELECT player INTO v_a FROM tournament_player WHERE id = m.player_a;
  SELECT player INTO v_b FROM tournament_player WHERE id = m.player_b;
  -- Somebody in the tournament but not in this match.
  SELECT tp.player INTO v_out FROM tournament_player tp
   WHERE tp.tournament = 1 AND tp.id NOT IN (m.player_a, m.player_b) LIMIT 1;

  PERFORM act_as(v_out);
  BEGIN
    PERFORM tournament_submit_result(m.id, 2::smallint, 0::smallint, 0::smallint);
    RAISE EXCEPTION 'FAILED: an outsider reported a result';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%not playing this match%' THEN PERFORM ok(true, 'a player from another table cannot report this one');
    ELSE RAISE; END IF;
  END;

  PERFORM act_as(v_a);
  BEGIN
    PERFORM tournament_submit_result(m.id, 3::smallint, 0::smallint, 0::smallint);
    RAISE EXCEPTION 'FAILED: 3-0 accepted in a best of three';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%legal score%' THEN PERFORM ok(true, '3-0 is refused in a best of three');
    ELSE RAISE; END IF;
  END;

  PERFORM tournament_submit_result(m.id, 2::smallint, 1::smallint, 0::smallint);
  PERFORM ok((SELECT status FROM tournament_match WHERE id = m.id) = 'awaiting_confirmation',
             'a reported result waits for the opponent');
  PERFORM ok((SELECT winner FROM tournament_match WHERE id = m.id) = m.player_a, 'the winner is the side with more games');

  BEGIN
    PERFORM tournament_confirm_result(m.id);
    RAISE EXCEPTION 'FAILED: the reporter confirmed their own result';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%opponent has to confirm%' THEN PERFORM ok(true, 'you cannot confirm your own report');
    ELSE RAISE; END IF;
  END;

  -- The reporter may correct themselves while it is still unconfirmed.
  PERFORM tournament_submit_result(m.id, 2::smallint, 0::smallint, 0::smallint);
  PERFORM ok((SELECT score_b FROM tournament_match WHERE id = m.id) = 0, 'the reporter can correct their own report');

  PERFORM act_as(v_b);
  BEGIN
    PERFORM tournament_submit_result(m.id, 0::smallint, 2::smallint, 0::smallint);
    RAISE EXCEPTION 'FAILED: the opponent overwrote a pending report';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%confirm it or dispute it%' THEN PERFORM ok(true, 'the opponent must confirm or dispute, not overwrite');
    ELSE RAISE; END IF;
  END;

  PERFORM tournament_confirm_result(m.id);
  PERFORM ok((SELECT status FROM tournament_match WHERE id = m.id) = 'completed', 'confirming completes the match');
  PERFORM ok((SELECT count(*) FROM point_ledger WHERE match = m.id) = 2, 'two ledger rows, one per player');
  PERFORM ok((SELECT sum(amount) FROM point_ledger WHERE match = m.id) = 3, 'a decisive match paid out 3 + 0');

  BEGIN
    PERFORM act_as(v_a);
    PERFORM tournament_submit_result(m.id, 0::smallint, 2::smallint, 0::smallint);
    RAISE EXCEPTION 'FAILED: a completed result was rewritten by a player';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%final%' THEN PERFORM ok(true, 'a confirmed result is immutable to players');
    ELSE RAISE; END IF;
  END;
  PERFORM as_postgres();
END $$;

\echo ''
\echo '── 9. A dispute parks the match until the organizer rules ──'
DO $$
DECLARE m RECORD; v_a uuid; v_b uuid;
BEGIN
  SELECT id, player_a, player_b INTO m FROM tournament_match
   WHERE round = 1 AND player_b IS NOT NULL AND status = 'pending' ORDER BY table_number LIMIT 1;
  SELECT player INTO v_a FROM tournament_player WHERE id = m.player_a;
  SELECT player INTO v_b FROM tournament_player WHERE id = m.player_b;

  PERFORM act_as(v_a);
  PERFORM tournament_submit_result(m.id, 2::smallint, 0::smallint, 0::smallint);
  PERFORM act_as(v_b);
  PERFORM tournament_dispute_result(m.id, 'I won 2-1, he reported the wrong way round');
  PERFORM ok((SELECT status FROM tournament_match WHERE id = m.id) = 'disputed', 'the match is disputed');
  PERFORM ok((SELECT count(*) FROM point_ledger WHERE match = m.id) = 0, 'a disputed match scores nothing');
  PERFORM ok((SELECT dispute_reason FROM tournament_match WHERE id = m.id) LIKE 'I won 2-1%', 'the complaint is kept in the player''s words');

  BEGIN
    PERFORM tournament_confirm_result(m.id);
    RAISE EXCEPTION 'FAILED: confirmed a disputed match';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%no reported result to confirm%' THEN PERFORM ok(true, 'a disputed match cannot be confirmed away');
    ELSE RAISE; END IF;
  END;

  BEGIN
    PERFORM tournament_resolve_match(m.id, 1::smallint, 2::smallint, 0::smallint, 'nope');
    RAISE EXCEPTION 'FAILED: a player resolved their own dispute';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%only the organizer%' THEN PERFORM ok(true, 'a player cannot resolve their own dispute');
    ELSE RAISE; END IF;
  END;

  PERFORM act_as('00000000-0000-0000-0000-0000000000aa');
  PERFORM tournament_resolve_match(m.id, 1::smallint, 2::smallint, 0::smallint, 'Checked the recording: B took games 2 and 3.');
  PERFORM ok((SELECT status FROM tournament_match WHERE id = m.id) = 'completed', 'the organizer''s ruling completes the match');
  PERFORM ok((SELECT winner FROM tournament_match WHERE id = m.id) = m.player_b, 'and it went the other way');
  PERFORM ok((SELECT count(*) FROM point_ledger WHERE match = m.id) = 2, 'the ruling posted points');
  PERFORM as_postgres();
END $$;
