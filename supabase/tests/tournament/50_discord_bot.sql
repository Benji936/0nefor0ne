\set ON_ERROR_STOP on
\echo '── 15. The bot acts as a verified Discord user, not around the rules ──'
SELECT as_postgres();

-- Link the store's guild the way /verify does.
INSERT INTO community_claim (community, claimer, discord_guild_id)
VALUES (1, '00000000-0000-0000-0000-0000000000aa', '555000111222333444')
ON CONFLICT (community, claimer) DO UPDATE SET discord_guild_id = excluded.discord_guild_id;

-- A second tournament, so the bot's guild listing has something in registration.
-- Its id is captured rather than assumed: an identity sequence advances even on
-- an insert RLS refuses, and test 10 deliberately makes one of those.
SELECT act_as('00000000-0000-0000-0000-0000000000aa');
WITH ins AS (
  INSERT INTO tournament (community, name, match_format)
  VALUES (1, 'Friday Locals', 3) RETURNING id
)
INSERT INTO _t (k, v) SELECT 't2', id FROM ins
  ON CONFLICT (k) DO UPDATE SET v = excluded.v;
SELECT tournament_set_status((SELECT v FROM _t WHERE k = 't2'), 'registration');
SELECT as_postgres();

SELECT ok(count(*) = 2, 'the guild lists both live tournaments of its community')
  FROM discord_tournaments_for_guild('555000111222333444');
SELECT ok(count(*) = 0, 'an unrelated guild sees nothing')
  FROM discord_tournaments_for_guild('999999999999999999');
SELECT ok(players = 7, 'the listing carries the active head count')
  FROM discord_tournaments_for_guild('555000111222333444') WHERE tournament_id = 1;

\echo ''
\echo '── 16. Registering from Discord goes through the same rules ──'
DO $$
DECLARE v_entrant bigint;
BEGIN
  -- Yuki's Discord id, from the fixture.
  v_entrant := discord_tournament_register((SELECT v FROM _t WHERE k = 't2'), '100000000000000007');
  PERFORM ok(v_entrant IS NOT NULL, 'a linked Discord account can register');
  PERFORM ok((SELECT display_name FROM tournament_player WHERE id = v_entrant) = 'Yuki',
             'and lands as the right person');

  -- Registering twice is the same no-op it is on the website.
  PERFORM ok(discord_tournament_register((SELECT v FROM _t WHERE k = 't2'), '100000000000000007') = v_entrant,
             'registering twice from Discord does not make a second entrant');

  BEGIN
    PERFORM discord_tournament_register((SELECT v FROM _t WHERE k = 't2'), '000000000000000000');
    RAISE EXCEPTION 'FAILED: an unlinked snowflake registered';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%no_account%' THEN PERFORM ok(true, 'an unlinked Discord account is told to link, not registered');
    ELSE RAISE; END IF;
  END;
END $$;

\echo ''
\echo '── 17. The bot cannot hand a player the organizer''s authority ──'
DO $$ BEGIN
  BEGIN
    -- Benji is a player, not the store owner.
    PERFORM discord_tournament_generate_round(1, '100000000000000001');
    RAISE EXCEPTION 'FAILED: a player paired a round through the bot';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE '%only the organizer%' THEN PERFORM ok(true, 'impersonating a player gets the player''s permissions, not more');
    ELSE RAISE; END IF;
  END;
END $$;

\echo ''
\echo '── 18. The impersonated claim does not survive the call ──'
DO $$
DECLARE v_after text;
BEGIN
  PERFORM as_postgres();
  PERFORM discord_tournaments_for_guild('555000111222333444');
  v_after := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '(none)');
  PERFORM ok(v_after = '(none)', 'a read leaves no claim behind on the connection');
END $$;

\echo ''
\echo '── 19. "Where am I playing" ──'
DO $$
DECLARE r RECORD;
BEGIN
  SELECT * INTO r FROM discord_my_pairing(1, '100000000000000001');
  PERFORM ok(r.table_number IS NOT NULL, 'a player in the round gets a table number');
  PERFORM ok(r.round_number = 2, 'and it is the current round, not the first one');
  PERFORM ok(r.me = 'Benji', 'the row is written from their own seat');
  PERFORM ok(r.is_bye OR r.opponent IS NOT NULL, 'with an opponent, or a bye');

  PERFORM ok((SELECT count(*) FROM discord_my_pairing(1, '000000000000000000')) = 0,
             'an unlinked account is told nothing rather than erroring');
  PERFORM ok((SELECT count(*) FROM discord_my_pairing((SELECT v FROM _t WHERE k = 't2'), '100000000000000001')) = 0,
             'and a tournament they are not in returns nothing');
END $$;

\echo ''
\echo '── 20. Round announcements: one per round, ever ──'
SELECT ok(count(*) = 2, 'both played rounds are waiting to be announced')
  FROM discord_pending_round_posts(10) WHERE tournament_id = 1;

SELECT ok(jsonb_array_length(pairings) = 4, 'a round carries its four tables inline')
  FROM discord_pending_round_posts(10) WHERE round_id = 1;
SELECT ok(count(*) = 1, 'the bye is flagged so the bot can render it differently')
  FROM discord_pending_round_posts(10) r,
       jsonb_array_elements(r.pairings) p
 WHERE r.round_id = 1 AND (p->>'bye')::boolean;
SELECT ok(bool_and(p->>'a_discord' IS NOT NULL), 'every player carries a Discord id, so the bot can mention them')
  FROM discord_pending_round_posts(10) r, jsonb_array_elements(r.pairings) p
 WHERE r.round_id = 1;

-- The bot claims the round before it sends anything; the primary key is what
-- makes two instances racing produce one failed insert, not two pairing sheets.
INSERT INTO tournament_round_post (round, tournament, guild_id, channel_id, message_id)
VALUES (1, 1, '555000111222333444', '777', '888');

SELECT ok(count(*) = 1, 'an announced round drops out of the pending list')
  FROM discord_pending_round_posts(10) WHERE tournament_id = 1;

DO $$ BEGIN
  BEGIN
    INSERT INTO tournament_round_post (round, tournament, guild_id) VALUES (1, 1, '555000111222333444');
    RAISE EXCEPTION 'FAILED: the same round was claimed twice';
  EXCEPTION WHEN unique_violation THEN
    PERFORM ok(true, 'a second claim on the same round is refused by the primary key');
  END;
END $$;

\echo ''
\echo '── 21. The bot''s functions are not reachable with the anon key ──'
DO $$
DECLARE fn text; leaked text := '';
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'discord_act_as', 'discord_tournaments_for_guild', 'discord_tournament_register',
    'discord_tournament_drop', 'discord_tournament_check_in',
    'discord_tournament_generate_round', 'discord_my_pairing', 'discord_pending_round_posts'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
        AND (has_function_privilege('anon', p.oid, 'EXECUTE')
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ) THEN
      leaked := leaked || fn || ' ';
    END IF;
  END LOOP;
  PERFORM ok(leaked = '', 'no bot function is executable by anon or authenticated: ' || coalesce(nullif(leaked, ''), 'none'));
END $$;

SELECT ok(NOT has_table_privilege('anon', 'tournament_round_post', 'SELECT')
       OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tournament_round_post'),
          'the announcement ledger has RLS on and no policies, so clients get nothing');
