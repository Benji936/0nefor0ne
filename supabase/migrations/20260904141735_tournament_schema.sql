-- Arena, part 1 of 3: the tables a tournament is made of.
--
-- The shape follows community_event's: a tournament belongs to a community and
-- carries no owner column of its own, because ownership is already answered by
-- community.owner and a second copy of that answer is a second thing to get
-- wrong. Verified-only to create, for the same reason events are — that is what
-- verification currently sells (see 20260806_events_require_verified.sql).
--
-- The division of labour with the Durable Object is deliberate and worth stating
-- once, here, where the tables are: the DO owns what a duel looks like while it
-- is being played — life points, the timer, whose turn it is — and forgets all
-- of it when the last socket closes (worker/index.js, webSocketClose). These
-- tables own what happened. A number that has to survive the players closing
-- Discord lives here and nowhere else.
--
-- Writes: creating and configuring a tournament is a single-row edit by its
-- owner and goes through PostgREST under RLS. Everything else — pairing,
-- results, standings — is a multi-row authoritative mutation and goes through
-- the SECURITY DEFINER functions in the next two migrations. That is why the
-- four tables below the first one have SELECT policies and no write policies
-- whatsoever: there is no supported way for a client to write them directly,
-- and RLS says so rather than a code comment saying so.

-- ── tournament ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tournament (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community     bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  -- The event row that announces this tournament on the community profile and
  -- in Discord. Optional, and SET NULL rather than CASCADE: deleting the
  -- announcement must never delete the competitive record it pointed at.
  event         bigint REFERENCES community_event(id) ON DELETE SET NULL,

  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 140),
  description   text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  -- Free text today. The site is Yu-Gi-Oh only, so a lookup table would have
  -- one row in it; this is the placeholder for the day that stops being true.
  game          text NOT NULL DEFAULT 'yugioh' CHECK (char_length(game) BETWEEN 1 AND 40),
  format        text CHECK (format IS NULL OR char_length(format) <= 60),

  -- The pairing engine to use. Constrained to what is actually implemented, so
  -- adding 'single_elim' later is a migration that widens this CHECK and adds a
  -- branch to tournament_generate_round — not a value that silently pairs wrong.
  structure     text NOT NULL DEFAULT 'swiss' CHECK (structure IN ('swiss')),
  match_format  smallint NOT NULL DEFAULT 3 CHECK (match_format IN (1, 3, 5)),

  -- There is deliberately no `registration_open` boolean. It would say the same
  -- thing as status = 'registration' and the two would eventually disagree.
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','registration','check_in','active','completed','cancelled')),
  max_players   integer CHECK (max_players IS NULL OR max_players BETWEEN 2 AND 512),

  -- Both set by tournament_start and advanced by tournament_generate_round;
  -- never written by a client (see the column guard below).
  total_rounds  smallint CHECK (total_rounds IS NULL OR total_rounds BETWEEN 1 AND 20),
  current_round smallint NOT NULL DEFAULT 0 CHECK (current_round >= 0),

  -- Scoring is per-tournament rather than hardcoded, because "3/1/0" is a
  -- convention and not a law, and a store running a league on different numbers
  -- should not need a schema change. Standings read these columns.
  points_win    smallint NOT NULL DEFAULT 3 CHECK (points_win  BETWEEN 0 AND 100),
  points_draw   smallint NOT NULL DEFAULT 1 CHECK (points_draw BETWEEN 0 AND 100),
  points_loss   smallint NOT NULL DEFAULT 0 CHECK (points_loss BETWEEN 0 AND 100),
  -- A bye is a win by default, which is what every Swiss event does, but it is
  -- its own column so a store that scores it differently can say so.
  points_bye    smallint NOT NULL DEFAULT 3 CHECK (points_bye  BETWEEN 0 AND 100),

  starts_at     timestamptz,
  timezone      text,

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tournament_community ON tournament (community, starts_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_tournament_status    ON tournament (status) WHERE status IN ('registration','check_in','active');

-- ── tournament_player ─────────────────────────────────────────────────────────
-- An entrant. `player` is an auth user and not merely a Discord snowflake,
-- because confirming a result is an authenticated act: RLS and the confirm RPC
-- both need an auth.uid() to check against, and a raw snowflake gives them
-- nothing to check. discord_user_id is carried alongside so the bot can resolve
-- a registrant without joining back through Trader on every announcement.
CREATE TABLE IF NOT EXISTS tournament_player (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tournament      bigint NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  player          uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_user_id text,
  display_name    text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  checked_in      boolean NOT NULL DEFAULT false,
  -- A timestamp rather than a boolean, matching identity_verified_at and
  -- manual_review_at: when somebody dropped is part of the record.
  dropped_at      timestamptz,
  seed            integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- "A player should not be registered twice."
  UNIQUE (tournament, player)
);

CREATE INDEX IF NOT EXISTS idx_tournament_player_player ON tournament_player (player);
CREATE INDEX IF NOT EXISTS idx_tournament_player_active ON tournament_player (tournament) WHERE dropped_at IS NULL;

-- ── tournament_round ──────────────────────────────────────────────────────────
-- A round exists from the moment it is paired, so it has no 'pending' state:
-- creating the row and creating its matches happen in one transaction.
--
-- UNIQUE (tournament, round_number) is the whole idempotency story for round
-- generation. Two organizers clicking "Start round" at the same moment both
-- reach the INSERT; one wins, the other fails the constraint and is told the
-- round already exists. Neither produces a second set of pairings.
CREATE TABLE IF NOT EXISTS tournament_round (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tournament   bigint NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  round_number smallint NOT NULL CHECK (round_number >= 1),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  started_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (tournament, round_number)
);

-- ── tournament_match ──────────────────────────────────────────────────────────
-- Both sides reference tournament_player rather than auth.users. A match is
-- between two entrants of this tournament, and saying so in the schema is what
-- makes "the same person twice on one table" and "somebody who never registered"
-- unrepresentable rather than merely unlikely.
--
-- player_b IS NULL is a bye. It is stored as a real match — completed, scored,
-- and occupying a table number — because a bye is part of a player's record and
-- a round is not complete until it is accounted for.
CREATE TABLE IF NOT EXISTS tournament_match (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tournament   bigint NOT NULL REFERENCES tournament(id) ON DELETE CASCADE,
  round        bigint NOT NULL REFERENCES tournament_round(id) ON DELETE CASCADE,
  table_number smallint NOT NULL CHECK (table_number >= 1),

  player_a     bigint NOT NULL REFERENCES tournament_player(id) ON DELETE CASCADE,
  player_b     bigint REFERENCES tournament_player(id) ON DELETE CASCADE,

  -- Games won by each side, plus drawn games. Not derived from life points:
  -- a physical game ends for many reasons, and only the players know which.
  score_a      smallint NOT NULL DEFAULT 0 CHECK (score_a BETWEEN 0 AND 5),
  score_b      smallint NOT NULL DEFAULT 0 CHECK (score_b BETWEEN 0 AND 5),
  draws        smallint NOT NULL DEFAULT 0 CHECK (draws   BETWEEN 0 AND 5),
  -- NULL while undecided AND when the match is a completed draw. Read it with
  -- status, never on its own.
  winner       bigint REFERENCES tournament_player(id),

  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending','active','awaiting_confirmation','disputed','completed')),

  reported_by  bigint REFERENCES tournament_player(id),
  reported_at  timestamptz,
  confirmed_at timestamptz,
  disputed_at  timestamptz,
  disputed_by  bigint REFERENCES tournament_player(id),
  -- What the disputing player says is wrong, in their words. Separate from
  -- resolution_note, which is the judge's: a resolution that overwrote the
  -- complaint it was answering would leave nothing to review.
  dispute_reason  text CHECK (dispute_reason IS NULL OR char_length(dispute_reason) <= 500),
  resolved_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 500),

  -- Where the match is played. Written by the bot and the Activity in a later
  -- phase; present now so the tables the integration needs already exist and it
  -- does not arrive as a schema change on live tournaments.
  discord_channel_id           text,
  discord_activity_instance_id text,

  started_at   timestamptz,
  completed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (round, table_number),
  CONSTRAINT tournament_match_distinct_players CHECK (player_b IS NULL OR player_a <> player_b),
  -- A bye is never in doubt: nobody is on the other side to confirm or dispute.
  CONSTRAINT tournament_match_bye_is_settled
    CHECK (player_b IS NOT NULL OR status IN ('completed','pending'))
);

-- One appearance per player per round, on each side. Round generation partitions
-- the field so this cannot happen anyway; the indexes are here because a pairing
-- bug should surface as a failed write rather than as a corrupted standings
-- table nobody notices until round four.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_match_round_a ON tournament_match (round, player_a);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_match_round_b ON tournament_match (round, player_b) WHERE player_b IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tournament_match_tournament ON tournament_match (tournament, status);
CREATE INDEX IF NOT EXISTS idx_tournament_match_round      ON tournament_match (round, table_number);

-- ── point_ledger ──────────────────────────────────────────────────────────────
-- Community points as an append-only ledger, so a balance is SUM(amount) and
-- every point on it can be traced to the match that produced it.
--
-- Nothing here is ever updated or deleted. A judge overturning a result posts
-- reversal rows and then the corrected ones, which is why a player can be shown
-- why their total changed instead of only that it did.
--
-- Deliberately NOT a rating. Elo across communities is a different problem with
-- different failure modes and it is not being solved here.
CREATE TABLE IF NOT EXISTS point_ledger (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player     uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  community  bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  tournament bigint REFERENCES tournament(id) ON DELETE SET NULL,
  match      bigint REFERENCES tournament_match(id) ON DELETE SET NULL,
  amount     integer NOT NULL,
  reason     text NOT NULL
             CHECK (reason IN ('match_win','match_draw','match_loss','match_bye','reversal','adjustment')),
  note       text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_point_ledger_balance    ON point_ledger (player, community);
CREATE INDEX IF NOT EXISTS idx_point_ledger_tournament ON point_ledger (tournament);

-- ── updated_at ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tournament_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tournament_touch ON tournament;
CREATE TRIGGER trg_tournament_touch
  BEFORE UPDATE ON tournament
  FOR EACH ROW EXECUTE FUNCTION tournament_touch_updated_at();

-- ── Column guard ──────────────────────────────────────────────────────────────
-- RLS lets an owner UPDATE their own tournament row, which they must be able to
-- do — the name, the description, the start time are all theirs. But the same
-- policy would let a hand-written PostgREST call set status = 'completed' or
-- current_round = 9, and those columns belong to the state machine in the next
-- migration, not to whoever can reach the row.
--
-- So: any client-role write to a machine-owned column is reverted here. A
-- privileged caller passes through, which is how the SECURITY DEFINER functions
-- advance the tournament.
--
-- The discriminator is `current_user`, NOT the role inside request.jwt.claims,
-- and the difference is the whole reason this comment is long.
-- community_enforce_admin_fields and community_claim_guard read the JWT claim
-- because the privileged writer they let through is an Edge Function holding a
-- service-role key — a different JWT. Here the privileged writer is a SECURITY
-- DEFINER function called BY the owner, so the JWT still says "authenticated"
-- the whole way down and a claims-based guard reverts the state machine's own
-- writes. It does it silently: the UPDATE reports success and the row does not
-- change. `current_user` is the honest question, because it is 'authenticated'
-- for a direct PostgREST write and the function owner inside a definer.
CREATE OR REPLACE FUNCTION tournament_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A tournament always starts as a draft with nothing played.
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
    -- Scoring is frozen once anyone has played: rewriting the points a win is
    -- worth mid-event would silently restate every standing already published.
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

DROP TRIGGER IF EXISTS trg_tournament_guard ON tournament;
CREATE TRIGGER trg_tournament_guard
  BEFORE INSERT OR UPDATE ON tournament
  FOR EACH ROW EXECUTE FUNCTION tournament_guard();

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE tournament        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_player ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_round  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_match  ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_ledger      ENABLE ROW LEVEL SECURITY;

-- Readable when the parent community is: a draft is the organizer's alone, and
-- anything past draft is as public as the community page it sits on. Mirrors
-- community_event_select.
DROP POLICY IF EXISTS "tournament_select" ON tournament;
CREATE POLICY "tournament_select" ON tournament FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM community c
    WHERE c.id = tournament.community
      AND (
        (tournament.status <> 'draft' AND c.status = 'published')
        OR c.owner = auth.uid()
      )
  )
);

-- Creating and configuring is the owner's, and only for a verified community —
-- the same gate events sit behind (20260806_events_require_verified.sql).
DROP POLICY IF EXISTS "tournament_insert_owner" ON tournament;
CREATE POLICY "tournament_insert_owner" ON tournament FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM community c
          WHERE c.id = tournament.community AND c.owner = auth.uid() AND c.verified)
);

DROP POLICY IF EXISTS "tournament_update_owner" ON tournament;
CREATE POLICY "tournament_update_owner" ON tournament FOR UPDATE
  USING      (EXISTS (SELECT 1 FROM community c WHERE c.id = tournament.community AND c.owner = auth.uid() AND c.verified))
  WITH CHECK (EXISTS (SELECT 1 FROM community c WHERE c.id = tournament.community AND c.owner = auth.uid() AND c.verified));

-- DELETE stays with the owner and is not gated on verified, for the reason the
-- events migration gives: if a subscription lapses, taking down something that
-- is not happening must still be possible.
DROP POLICY IF EXISTS "tournament_delete_owner" ON tournament;
CREATE POLICY "tournament_delete_owner" ON tournament FOR DELETE
  USING (EXISTS (SELECT 1 FROM community c WHERE c.id = tournament.community AND c.owner = auth.uid()));

-- The four tables below get SELECT and nothing else. Pairings, results and
-- points are written by the SECURITY DEFINER functions or not at all; a client
-- with a hand-written PostgREST call has no INSERT or UPDATE policy to satisfy,
-- so there is no request it can make that fabricates a result.
DROP POLICY IF EXISTS "tournament_player_select" ON tournament_player;
CREATE POLICY "tournament_player_select" ON tournament_player FOR SELECT USING (
  EXISTS (SELECT 1 FROM tournament t WHERE t.id = tournament_player.tournament)
);

DROP POLICY IF EXISTS "tournament_round_select" ON tournament_round;
CREATE POLICY "tournament_round_select" ON tournament_round FOR SELECT USING (
  EXISTS (SELECT 1 FROM tournament t WHERE t.id = tournament_round.tournament)
);

DROP POLICY IF EXISTS "tournament_match_select" ON tournament_match;
CREATE POLICY "tournament_match_select" ON tournament_match FOR SELECT USING (
  EXISTS (SELECT 1 FROM tournament t WHERE t.id = tournament_match.tournament)
);

-- A player reads their own ledger; anyone who can see the tournament can see
-- the points it awarded, because a standings table nobody can audit is worth
-- less than no standings table.
DROP POLICY IF EXISTS "point_ledger_select" ON point_ledger;
CREATE POLICY "point_ledger_select" ON point_ledger FOR SELECT USING (
  point_ledger.player = auth.uid()
  OR EXISTS (SELECT 1 FROM tournament t WHERE t.id = point_ledger.tournament)
);

NOTIFY pgrst, 'reload schema';
