-- Which verified community, if any, runs this Discord server.
--
-- The Remote Duel activity needs this to decide whether a room gets tournament
-- mode. It cannot read community_claim directly — that table is RLS-protected
-- proof state — so this is the one narrow question it is allowed to ask.
--
-- SECURITY DEFINER because of that RLS, and deliberately answering with two
-- public columns and nothing else. An unverified community produces no row
-- rather than a row saying false: the caller has no business knowing that a
-- guild is linked to something it is not allowed into.
--
-- Exposed to anon on purpose. The activity's Worker holds the anon key, not a
-- service role key, and what this returns is already on a public profile page.
-- Guild ids are 64-bit snowflakes, so the mapping is not enumerable.
CREATE OR REPLACE FUNCTION community_for_guild(p_guild_id text)
RETURNS TABLE (name text, slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.name, c.slug
  FROM community_claim cc
  -- claimer = owner, for the same reason the event poster uses it: a shop that
  -- changed hands holds a claim row per claimer, and only the current owner's
  -- server should be treated as theirs.
  JOIN community c ON c.id = cc.community AND c.owner = cc.claimer
  WHERE cc.discord_guild_id = p_guild_id
    AND c.verified
    AND c.status = 'published'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION community_for_guild(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION community_for_guild(text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
