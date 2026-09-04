\set ON_ERROR_STOP on
\echo '── Fixture: one verified store, one organizer, seven players ──'
SELECT as_postgres();
TRUNCATE point_ledger, tournament_match, tournament_round, tournament_player, tournament,
         community_event, community, "Trader" RESTART IDENTITY CASCADE;
DELETE FROM auth.users;

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000aa', 'org@example.com'),
  ('00000000-0000-0000-0000-000000000001', 'benji@example.com'),
  ('00000000-0000-0000-0000-000000000002', 'alex@example.com'),
  ('00000000-0000-0000-0000-000000000003', 'marco@example.com'),
  ('00000000-0000-0000-0000-000000000004', 'flo@example.com'),
  ('00000000-0000-0000-0000-000000000005', 'nina@example.com'),
  ('00000000-0000-0000-0000-000000000006', 'omar@example.com'),
  ('00000000-0000-0000-0000-000000000007', 'yuki@example.com');

INSERT INTO "Trader" (id, "Name", discord_id) VALUES
  ('00000000-0000-0000-0000-0000000000aa', 'Store Owner', '900000000000000000'),
  ('00000000-0000-0000-0000-000000000001', 'Benji',  '100000000000000001'),
  ('00000000-0000-0000-0000-000000000002', 'Alex',   '100000000000000002'),
  ('00000000-0000-0000-0000-000000000003', 'Marco',  '100000000000000003'),
  ('00000000-0000-0000-0000-000000000004', 'Flo',    '100000000000000004'),
  ('00000000-0000-0000-0000-000000000005', 'Nina',   '100000000000000005'),
  ('00000000-0000-0000-0000-000000000006', 'Omar',   '100000000000000006'),
  ('00000000-0000-0000-0000-000000000007', 'Yuki',   '100000000000000007');

INSERT INTO community (owner, kind, name, slug, status, verified)
VALUES ('00000000-0000-0000-0000-0000000000aa', 'store', 'Geneva Card Bar', 'geneva-card-bar', 'published', true);

\echo ''
\echo '── 1. Create a tournament as the organizer (PostgREST path, RLS + guard) ──'
SELECT act_as('00000000-0000-0000-0000-0000000000aa');
INSERT INTO tournament (community, name, match_format, status, current_round, total_rounds)
VALUES (1, 'Thursday Night Swiss', 3, 'active', 9, 9);   -- status/round deliberately forged

SELECT ok(status = 'draft',       'the guard forced a forged status back to draft')       FROM tournament WHERE id = 1;
SELECT ok(current_round = 0,      'the guard forced a forged current_round back to 0')     FROM tournament WHERE id = 1;
SELECT ok(total_rounds IS NULL,   'the guard cleared a forged total_rounds')               FROM tournament WHERE id = 1;
SELECT ok(created_by = '00000000-0000-0000-0000-0000000000aa', 'created_by is the caller, not the payload') FROM tournament WHERE id = 1;

\echo ''
\echo '── 2. A player cannot create a tournament for somebody else''s community ──'
SELECT act_as('00000000-0000-0000-0000-000000000001');
DO $$
BEGIN
  INSERT INTO tournament (community, name) VALUES (1, 'Benji''s fake event');
  RAISE EXCEPTION 'FAILED: a non-owner inserted a tournament';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '  ok  RLS refused a non-owner INSERT';
END $$;

\echo ''
\echo '── 3. Registration is closed while the tournament is a draft ──'
DO $$
BEGIN
  PERFORM tournament_register(1);
  RAISE EXCEPTION 'FAILED: registered into a draft';
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE '%registration is closed%' THEN RAISE NOTICE '  ok  a draft refuses registrations';
  ELSE RAISE; END IF;
END $$;
