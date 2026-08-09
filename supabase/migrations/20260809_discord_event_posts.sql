-- Post a verified community's events into its own Discord server.
--
-- The link between a guild and a community already exists: /verify writes
-- community_claim.discord_guild_id when an admin of that server proves they run
-- it. This adds the ledger the bot needs on top of it — what has been posted,
-- where, and what has to be taken back down.
--
-- Why a ledger and not a flag on community_event: the message has to be
-- retractable after the event row is gone. An event deleted on the website
-- leaves a Discord post announcing a tournament that is not happening, which is
-- worse than never having posted it. So the ledger deliberately has NO foreign
-- key to community_event: the row must outlive the event long enough for the
-- bot to delete the message it is holding the id of.

CREATE TABLE IF NOT EXISTS community_event_post (
  -- One post per event. The primary key is the idempotency guarantee: the bot
  -- inserts before it can post twice, and a duplicate is a constraint error
  -- rather than a second announcement.
  event      bigint PRIMARY KEY,
  guild_id   text NOT NULL,
  channel_id text,
  message_id text,
  posted_at  timestamptz NOT NULL DEFAULT now(),
  -- Set when the message should come down. Non-null means the bot still owes a
  -- delete; the row is removed once it has done it.
  retract_at timestamptz,
  -- A permanent failure (no such channel, no permission to post there). The row
  -- exists so the bot stops retrying every fifteen seconds forever, and so the
  -- reason survives for whoever asks why nothing appeared.
  error      text
);

CREATE INDEX IF NOT EXISTS idx_community_event_post_retract
  ON community_event_post (retract_at) WHERE retract_at IS NOT NULL;

-- Nobody but the bot touches this. RLS on with no policies means exactly that:
-- anon and authenticated get nothing, service_role bypasses.
ALTER TABLE community_event_post ENABLE ROW LEVEL SECURITY;

-- An event that stops being published — deleted, or hidden by its owner — takes
-- its Discord post with it. Hiding an event on the website and leaving it
-- advertised in Discord would make the website the wrong place to manage it.
--
-- Only rows that actually carry a message id are marked: a row recording a
-- permanent failure has nothing to retract.
CREATE OR REPLACE FUNCTION community_event_retract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE community_event_post
       SET retract_at = now()
     WHERE event = OLD.id AND message_id IS NOT NULL AND retract_at IS NULL;
    RETURN OLD;
  END IF;

  IF NEW.status IS DISTINCT FROM 'published' THEN
    UPDATE community_event_post
       SET retract_at = now()
     WHERE event = NEW.id AND message_id IS NOT NULL AND retract_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_event_retract_trg ON community_event;
CREATE TRIGGER community_event_retract_trg
AFTER UPDATE OR DELETE ON community_event
FOR EACH ROW EXECUTE FUNCTION community_event_retract();

-- What the bot should post next.
--
-- The claim is joined on claimer = owner rather than on community alone.
-- community_claim is unique on (community, claimer), so a shop that was claimed
-- by one person, released, and claimed by another holds two rows; only the
-- current owner's guild should receive that community's events.
--
-- Verified is checked here rather than trusted from the event, for the same
-- reason the near-me search checks it: an event outlives the subscription that
-- allowed it, and a community that lapses should stop being announced.
CREATE OR REPLACE FUNCTION discord_pending_event_posts(p_limit integer DEFAULT 10)
RETURNS TABLE (
  event_id bigint, guild_id text,
  title text, description text,
  starts_at timestamptz, ends_at timestamptz, timezone text,
  is_online boolean, location text, url text, cover_url text,
  community_name text, community_slug text, community_avatar_url text,
  city text, country text
)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT e.id, cc.discord_guild_id,
         e.title, e.description,
         e.starts_at, e.ends_at, e.timezone,
         e.is_online, e.location, e.url, e.cover_url,
         c.name, c.slug, c.avatar_url, c.city, c.country
  FROM community_event e
  JOIN community c        ON c.id = e.community
  JOIN community_claim cc ON cc.community = c.id AND cc.claimer = c.owner
  LEFT JOIN community_event_post p ON p.event = e.id
  WHERE c.verified
    AND c.status = 'published'
    AND e.status = 'published'
    -- An event that already started is not news. This also means the bot
    -- staying down over a weekend catches up on what is still ahead rather
    -- than announcing a backlog of things that already happened.
    AND e.starts_at >= now()
    AND cc.discord_guild_id IS NOT NULL
    AND p.event IS NULL
  ORDER BY e.created_at
  LIMIT least(greatest(p_limit, 1), 50);
$$;

-- Service role only. It bypasses RLS anyway, so the function is INVOKER: there
-- is nothing to escalate and no reason to hand it a definer's privileges.
--
-- Revoking from PUBLIC is not enough. Supabase's default privileges grant
-- EXECUTE to anon and authenticated directly on every new function in this
-- schema, and a direct grant survives a revoke aimed at PUBLIC. Verified by
-- reading pg_proc.proacl after the fact rather than assuming.
REVOKE ALL ON FUNCTION discord_pending_event_posts(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION discord_pending_event_posts(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION discord_pending_event_posts(integer) TO service_role;

NOTIFY pgrst, 'reload schema';
