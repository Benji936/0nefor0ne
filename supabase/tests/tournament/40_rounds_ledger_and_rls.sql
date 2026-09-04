\set ON_ERROR_STOP on
\echo '── 10. Finishing the round, and standings ──'
DO $$
DECLARE m RECORD; v_a uuid; v_b uuid;
BEGIN
  SELECT id, player_a, player_b INTO m FROM tournament_match
   WHERE round = 1 AND player_b IS NOT NULL AND status = 'pending' LIMIT 1;
  SELECT player INTO v_a FROM tournament_player WHERE id = m.player_a;
  SELECT player INTO v_b FROM tournament_player WHERE id = m.player_b;

  PERFORM ok((SELECT status FROM tournament_round WHERE id = 1) = 'active', 'the round is still open with one table out');

  PERFORM act_as(v_a);
  -- A match that ran out of time at one game each.
  PERFORM tournament_submit_result(m.id, 1::smallint, 1::smallint, 1::smallint);
  PERFORM act_as(v_b);
  PERFORM tournament_confirm_result(m.id);
  PERFORM ok((SELECT winner FROM tournament_match WHERE id = m.id) IS NULL, 'a drawn match has no winner');
  PERFORM ok((SELECT sum(amount) FROM point_ledger WHERE match = m.id) = 2, 'a draw paid 1 + 1');
  PERFORM as_postgres();
END $$;

SELECT ok(status = 'completed' AND completed_at IS NOT NULL, 'the round closed by itself when the last table came in') FROM tournament_round WHERE id = 1;
SELECT ok(count(*) = 7, 'standings list every entrant')                     FROM tournament_standings(1);
SELECT ok(sum(played) = 7, 'seven player-results across four matches')      FROM tournament_standings(1);
SELECT ok(sum(points) = (SELECT sum(amount) FROM point_ledger WHERE tournament = 1),
          'standings points equal the ledger balance')                      FROM tournament_standings(1);
SELECT ok(count(*) = 2, 'two players are on 1 point after the draw')        FROM tournament_standings(1) WHERE points = 1;
SELECT ok(min(rank) = 1, 'the table is ranked from 1')                      FROM tournament_standings(1);

\echo ''
\echo '── 11. Round 2 pairs, avoids rematches, and moves the bye ──'
SELECT act_as('00000000-0000-0000-0000-0000000000aa');
SELECT ok((tournament_generate_round(1) ->> 'round_number')::int = 2, 'round 2 was created');
SELECT ok(count(*) = 4, 'round 2 also has four match rows')        FROM tournament_match WHERE round = 2;
SELECT ok(count(*) = 1, 'and one bye')                             FROM tournament_match WHERE round = 2 AND player_b IS NULL;
SELECT ok(count(DISTINCT p) = 7, 'all seven players appear exactly once in round 2')
  FROM (SELECT player_a AS p FROM tournament_match WHERE round = 2
        UNION ALL SELECT player_b FROM tournament_match WHERE round = 2 AND player_b IS NOT NULL) x;
SELECT ok(NOT EXISTS (
  SELECT 1 FROM tournament_match r2
  JOIN tournament_match r1
    ON r1.round = 1 AND r1.player_b IS NOT NULL
   AND ((r1.player_a = r2.player_a AND r1.player_b = r2.player_b)
     OR (r1.player_a = r2.player_b AND r1.player_b = r2.player_a))
  WHERE r2.round = 2 AND r2.player_b IS NOT NULL
), 'nobody was paired against the same opponent twice');
SELECT ok((SELECT player_a FROM tournament_match WHERE round = 2 AND player_b IS NULL)
       <> (SELECT player_a FROM tournament_match WHERE round = 1 AND player_b IS NULL),
          'the bye went to somebody who had not had one');
SELECT ok(current_round = 2, 'the tournament advanced to round 2') FROM tournament WHERE id = 1;
SELECT ok(count(*) = 2, 'round 1 was left intact — still exactly four matches, and two rounds exist')
  FROM tournament_round WHERE tournament = 1;
SELECT ok(count(*) = 4, 'round 1 still has exactly its four matches') FROM tournament_match WHERE round = 1;

\echo ''
\echo '── 12. Overturning a completed result reverses its points ──'
DO $$
DECLARE m RECORD; v_before integer; v_after integer; v_loser_player uuid;
BEGIN
  SELECT tm.id, tm.player_a, tm.player_b, tm.winner INTO m
    FROM tournament_match tm WHERE tm.round = 1 AND tm.status = 'completed' AND tm.winner IS NOT NULL
     AND tm.player_b IS NOT NULL LIMIT 1;
  SELECT player INTO v_loser_player FROM tournament_player
   WHERE id = CASE WHEN m.winner = m.player_a THEN m.player_b ELSE m.player_a END;

  SELECT coalesce(sum(amount), 0) INTO v_before FROM point_ledger WHERE player = v_loser_player;

  PERFORM act_as('00000000-0000-0000-0000-0000000000aa');
  PERFORM tournament_resolve_match(
    m.id,
    CASE WHEN m.winner = m.player_a THEN 0 ELSE 2 END::smallint,
    CASE WHEN m.winner = m.player_a THEN 2 ELSE 0 END::smallint,
    0::smallint, 'Reversed on appeal.');

  SELECT coalesce(sum(amount), 0) INTO v_after FROM point_ledger WHERE player = v_loser_player;
  PERFORM ok(v_after = v_before + 3, 'the overturned loser gained exactly the 3 points of a win');
  PERFORM ok((SELECT count(*) FROM point_ledger WHERE match = m.id AND reason = 'reversal') = 2,
             'both original postings were reversed rather than edited');
  PERFORM ok((SELECT count(*) FROM point_ledger WHERE match = m.id) = 6,
             'the ledger reads posted, reversed, reposted — six rows, nothing deleted');
  PERFORM ok((SELECT sum(points) FROM tournament_standings(1)) = (SELECT sum(amount) FROM point_ledger WHERE tournament = 1),
             'standings still equal the ledger after the reversal');
  PERFORM ok((SELECT status FROM tournament_round WHERE id = 1) = 'completed', 'the reopened round closed again');
  PERFORM as_postgres();
END $$;

\echo ''
\echo '── 13. Overturning the same match twice stays arithmetically sane ──'
DO $$
DECLARE m RECORD; v_a uuid; v_b uuid; v_sa integer; v_sb integer;
BEGIN
  SELECT tm.id, tm.player_a, tm.player_b INTO m
    FROM tournament_match tm WHERE tm.round = 1 AND tm.status = 'completed'
     AND tm.player_b IS NOT NULL AND tm.resolution_note = 'Reversed on appeal.' LIMIT 1;
  SELECT player INTO v_a FROM tournament_player WHERE id = m.player_a;
  SELECT player INTO v_b FROM tournament_player WHERE id = m.player_b;

  PERFORM act_as('00000000-0000-0000-0000-0000000000aa');
  -- Put it back the way it was originally reported.
  PERFORM tournament_resolve_match(m.id, 2::smallint, 0::smallint, 0::smallint, 'Appeal withdrawn.');

  SELECT coalesce(sum(amount), 0) INTO v_sa FROM point_ledger WHERE match = m.id AND player = v_a;
  SELECT coalesce(sum(amount), 0) INTO v_sb FROM point_ledger WHERE match = m.id AND player = v_b;
  PERFORM ok(v_sa = 3, 'after two overturns the winner is on exactly 3 for this match');
  PERFORM ok(v_sb = 0, 'and the loser on exactly 0 — no drift, no negative balance');
  PERFORM ok((SELECT sum(points) FROM tournament_standings(1)) = (SELECT sum(amount) FROM point_ledger WHERE tournament = 1),
             'standings still equal the ledger');
  PERFORM as_postgres();
END $$;

\echo ''
\echo '── 14. Nothing writes a result except through the functions ──'
DO $$ BEGIN
  PERFORM act_as('00000000-0000-0000-0000-000000000001');
  BEGIN
    INSERT INTO tournament_match (tournament, round, table_number, player_a, player_b, status)
    VALUES (1, 2, 99, 1, 2, 'completed');
    RAISE EXCEPTION 'FAILED: a player inserted a match';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM ok(true, 'no INSERT policy on tournament_match — a fabricated match is refused');
  END;
  BEGIN
    UPDATE tournament_match SET winner = 1, status = 'completed' WHERE round = 2;
    IF FOUND THEN RAISE EXCEPTION 'FAILED: a player updated a match'; END IF;
    PERFORM ok(true, 'no UPDATE policy on tournament_match — a rewritten result changes nothing');
  EXCEPTION WHEN insufficient_privilege THEN PERFORM ok(true, 'no UPDATE policy on tournament_match — a rewritten result is refused');
  END;
  BEGIN
    INSERT INTO point_ledger (player, community, tournament, amount, reason)
    VALUES ('00000000-0000-0000-0000-000000000001', 1, 1, 999, 'adjustment');
    RAISE EXCEPTION 'FAILED: a player granted themselves points';
  EXCEPTION WHEN insufficient_privilege THEN PERFORM ok(true, 'no INSERT policy on point_ledger — a player cannot pay themselves');
  END;
  BEGIN
    UPDATE tournament SET status = 'completed', current_round = 9 WHERE id = 1;
    PERFORM ok((SELECT status FROM tournament WHERE id = 1) = 'active',
               'RLS refuses a non-owner UPDATE on the tournament itself');
  EXCEPTION WHEN insufficient_privilege THEN PERFORM ok(true, 'RLS refuses a non-owner UPDATE on the tournament itself');
  END;
  -- The owner can edit their own tournament, but not its state machine.
  PERFORM act_as('00000000-0000-0000-0000-0000000000aa');
  UPDATE tournament SET name = 'Thursday Night Swiss (renamed)', status = 'completed', current_round = 9 WHERE id = 1;
  PERFORM ok((SELECT name FROM tournament WHERE id = 1) = 'Thursday Night Swiss (renamed)', 'the owner can rename their tournament');
  PERFORM ok((SELECT status FROM tournament WHERE id = 1) = 'active', 'but the guard held status at active');
  PERFORM ok((SELECT current_round FROM tournament WHERE id = 1) = 2, 'and current_round at 2');
  PERFORM as_postgres();
END $$;
