-- One community per account.
--
-- The old limit was MAX_UNVERIFIED_PER_OWNER = 5, counted in the browser in
-- createCommunity(). The insert policy was WITH CHECK (owner = auth.uid()) and
-- nothing else, so the cap held for exactly as long as someone used the form.
-- A single curl with the anon key made as many as you liked. A rule the client
-- enforces is not a rule.
--
-- The reason one is enough: a community carries every kind that applies to it
-- (see the kinds column). A shop that also runs a Discord and a play group is
-- one community tagged three ways, not three communities. Nobody needs a second
-- row to describe a second side of the same place.
--
-- Partial, because an unowned row is a directory entry rather than somebody's
-- community, and 4450 of them have owner NULL.
--
-- Prerequisite: no account may own two when this runs. At the time of writing
-- exactly one account did, and it released the two it had claimed for testing
-- through community-release first.

CREATE UNIQUE INDEX IF NOT EXISTS community_one_per_owner
  ON community (owner) WHERE owner IS NOT NULL;

NOTIFY pgrst, 'reload schema';
