\set ON_ERROR_STOP on
\echo '── 4. Open registration; seven players register ──'
SELECT act_as('00000000-0000-0000-0000-0000000000aa');
SELECT tournament_set_status(1, 'registration');

SELECT act_as('00000000-0000-0000-0000-000000000001'); SELECT tournament_register(1);
SELECT act_as('00000000-0000-0000-0000-000000000002'); SELECT tournament_register(1);
SELECT act_as('00000000-0000-0000-0000-000000000003'); SELECT tournament_register(1);
SELECT act_as('00000000-0000-0000-0000-000000000004'); SELECT tournament_register(1);
SELECT act_as('00000000-0000-0000-0000-000000000005'); SELECT tournament_register(1);
SELECT act_as('00000000-0000-0000-0000-000000000006'); SELECT tournament_register(1);
SELECT act_as('00000000-0000-0000-0000-000000000007'); SELECT tournament_register(1);
-- Registering twice must not produce a second entrant.
SELECT tournament_register(1);

SELECT ok(count(*) = 7, 'seven entrants, and a double registration did not add an eighth') FROM tournament_player WHERE tournament = 1;
SELECT ok(bool_and(discord_user_id IS NOT NULL), 'every entrant carries the Discord id the bot will need') FROM tournament_player WHERE tournament = 1;
SELECT ok(display_name = 'Yuki', 'the display name came from Trader, not from the caller') FROM tournament_player WHERE player = '00000000-0000-0000-0000-000000000007';

\echo ''
\echo '── 5. Only the organizer may start ──'
DO $$ BEGIN
  PERFORM tournament_start(1);
  RAISE EXCEPTION 'FAILED: a player started the tournament';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%only the organizer%' THEN RAISE NOTICE '  ok  a player cannot start the tournament';
  ELSE RAISE; END IF;
END $$;

SELECT act_as('00000000-0000-0000-0000-0000000000aa');
SELECT ok((tournament_start(1) ->> 'total_rounds')::int = 3, 'seven players -> three rounds');
SELECT ok((tournament_start(1) ->> 'already_started')::boolean, 'starting twice is a no-op, not a reshuffle');

\echo ''
\echo '── 6. Round 1: three tables and a bye ──'
SELECT ok((tournament_generate_round(1) ->> 'created')::boolean, 'round 1 was created');
SELECT ok(count(*) = 4, 'round 1 has four match rows (three tables + one bye)') FROM tournament_match WHERE round = 1;
SELECT ok(count(*) = 1, 'exactly one bye')                                      FROM tournament_match WHERE round = 1 AND player_b IS NULL;
SELECT ok(count(*) = 1, 'the bye is already completed')                         FROM tournament_match WHERE round = 1 AND player_b IS NULL AND status = 'completed';
SELECT ok(array_agg(table_number ORDER BY table_number) = ARRAY[1,2,3,4]::smallint[], 'table numbers are 1..4 with no gaps') FROM tournament_match WHERE round = 1;
SELECT ok(count(DISTINCT p) = 7, 'all seven players appear exactly once in round 1')
  FROM (SELECT player_a AS p FROM tournament_match WHERE round = 1
        UNION ALL SELECT player_b FROM tournament_match WHERE round = 1 AND player_b IS NOT NULL) x;
SELECT ok((SELECT points FROM tournament_standings(1) WHERE entrant_id = (SELECT player_a FROM tournament_match WHERE round = 1 AND player_b IS NULL)) = 3,
          'the bye scored 3 points immediately');

\echo ''
\echo '── 7. Round 2 is refused while round 1 is unfinished ──'
DO $$ BEGIN
  PERFORM tournament_generate_round(1);
  RAISE EXCEPTION 'FAILED: paired round 2 over an open round 1';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%unfinished match%' THEN RAISE NOTICE '  ok  an unfinished round blocks the next pairing';
  ELSE RAISE; END IF;
END $$;
SELECT ok(count(*) = 1, 'and no second round row was created') FROM tournament_round WHERE tournament = 1;
