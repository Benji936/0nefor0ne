\set ON_ERROR_STOP on
\echo '── 22. The Activity resolves a table from the player, not from a channel ──'
SELECT as_postgres();

DO $$
DECLARE r RECORD; v_match bigint;
BEGIN
  -- Benji is in round 2 of tournament 1 (see the earlier files).
  SELECT * INTO r FROM activity_match_for_discord_user('100000000000000001');

  IF r.match_id IS NULL THEN
    -- Round 2 may have handed Benji the bye, which has nothing to play.
    PERFORM ok(EXISTS (
      SELECT 1 FROM tournament_match m
      JOIN tournament_player p ON p.id = m.player_a
      WHERE m.round = 2 AND m.player_b IS NULL AND p.discord_user_id = '100000000000000001'
    ), 'no match resolved, and that is because this player has the bye');
  ELSE
    PERFORM ok(r.round_number = 2, 'the current round, not an earlier one');
    PERFORM ok(r.best_of = 3, 'the format comes from the tournament');
    PERFORM ok(r.player_b IS NOT NULL, 'a bye is never returned — there is nothing to play');
    PERFORM ok(r.a_discord IS NOT NULL AND r.b_discord IS NOT NULL,
               'both seats carry a Discord id, so the client can map its uids to entrants');
    PERFORM ok(r.community_slug = 'geneva-card-bar', 'and it names the store running it');
  END IF;

  PERFORM ok((SELECT count(*) FROM activity_match_for_discord_user('000000000000000000')) = 0,
             'an unlinked Discord account resolves to nothing rather than erroring');
END $$;

\echo ''
\echo '── 23. A settled match is not something the Activity is handed ──'
DO $$
DECLARE v_uid text; v_before int;
BEGIN
  -- Whoever played in round 1 has a completed match; it must not come back.
  SELECT p.discord_user_id INTO v_uid
    FROM tournament_match m
    JOIN tournament_player p ON p.id = m.player_a
   WHERE m.round = 1 AND m.status = 'completed' AND m.player_b IS NOT NULL
   LIMIT 1;

  SELECT count(*) INTO v_before FROM activity_match_for_discord_user(v_uid);
  PERFORM ok(v_before = 0 OR (SELECT match_status FROM activity_match_for_discord_user(v_uid)) <> 'completed',
             'a completed match is never returned as the one to play');
END $$;

\echo ''
\echo '── 24. Filing from the Activity goes through the ordinary rules ──'
DO $$
DECLARE m RECORD; v_a text; v_b text; v_out jsonb;
BEGIN
  SELECT tm.id, tm.player_a, tm.player_b INTO m
    FROM tournament_match tm
   WHERE tm.round = 2 AND tm.player_b IS NOT NULL AND tm.status = 'pending'
   LIMIT 1;
  SELECT discord_user_id INTO v_a FROM tournament_player WHERE id = m.player_a;
  SELECT discord_user_id INTO v_b FROM tournament_player WHERE id = m.player_b;

  -- Somebody at another table cannot file this one.
  BEGIN
    PERFORM activity_submit_result(m.id, '900000000000000000', 2::smallint, 0::smallint, 0::smallint);
    RAISE EXCEPTION 'FAILED: an outsider filed a result from the Activity';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%not playing this match%' THEN
      PERFORM ok(true, 'somebody not at the table cannot file its result');
    ELSE RAISE; END IF;
  END;

  -- Nor can a legal-looking but impossible score get through.
  BEGIN
    PERFORM activity_submit_result(m.id, v_a, 3::smallint, 0::smallint, 0::smallint);
    RAISE EXCEPTION 'FAILED: 3-0 accepted in a best of three';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%legal score%' THEN PERFORM ok(true, 'the format is still enforced');
    ELSE RAISE; END IF;
  END;

  v_out := activity_submit_result(m.id, v_a, 2::smallint, 1::smallint, 0::smallint);
  PERFORM ok(v_out ->> 'status' = 'awaiting_confirmation',
             'a result filed from the Activity waits for the opponent like any other');
  PERFORM ok((SELECT count(*) FROM point_ledger WHERE match = m.id) = 0,
             'and scores nothing until they confirm');
  PERFORM ok((SELECT reported_by FROM tournament_match WHERE id = m.id) = m.player_a,
             'the reporter is recorded, so the opponent knows who to argue with');

  -- The opponent confirms from wherever they like; the row does not care.
  PERFORM discord_act_as(v_b);
  PERFORM tournament_confirm_result(m.id);
  PERFORM ok((SELECT status FROM tournament_match WHERE id = m.id) = 'completed',
             'confirming completes it — the Activity skipped no step');
  PERFORM ok((SELECT count(*) FROM point_ledger WHERE match = m.id) = 2, 'and the points post');
  PERFORM as_postgres();
END $$;

\echo ''
\echo '── 25. Neither Activity function is reachable with the anon key ──'
DO $$
DECLARE fn text; leaked text := '';
BEGIN
  FOREACH fn IN ARRAY ARRAY['activity_match_for_discord_user', 'activity_submit_result'] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
        AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ) THEN leaked := leaked || fn || ' '; END IF;
  END LOOP;
  PERFORM ok(leaked = '', 'the Worker holds the anon key and can reach neither: ' || coalesce(nullif(leaked, ''), 'none'));
END $$;
