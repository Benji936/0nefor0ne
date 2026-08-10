-- Community announces: a listing posted from Discord by somebody who has no
-- 0nefor.one account yet.
--
-- Until now the bot refused those posts and asked the author to sign up first,
-- which cost a listing every time. Instead the announce is now owned by the
-- *community* the server is linked to, and carries the Discord author's public
-- identity so the listing still has a face on it.
--
-- Two consequences worth stating, because the rest of the schema already
-- enforces them and that is deliberate:
--
--   * Every announce RLS policy is `seller = auth.uid()`. With a NULL seller
--     those evaluate to NULL, so a community announce cannot be edited or
--     deleted by anyone through the API. Only the bot (service role) manages
--     its lifecycle, which is right: its lifecycle is the Discord message.
--   * The announce_chat guard requires `a.seller` to be one of the two
--     participants, so a community announce cannot be chatted about on-site.
--     Buyers are sent to the Discord message instead, which is where the
--     author actually is.

-- ── announce ────────────────────────────────────────────────────────────────
ALTER TABLE announce
  ALTER COLUMN seller DROP NOT NULL;

ALTER TABLE announce
  ADD COLUMN IF NOT EXISTS community             bigint REFERENCES community(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discord_author_id     text,
  ADD COLUMN IF NOT EXISTS discord_author_name   text,
  ADD COLUMN IF NOT EXISTS discord_author_avatar text;

-- An announce belongs to somebody: a member, or failing that a community.
-- Without this, dropping NOT NULL above would allow fully orphaned rows.
ALTER TABLE announce
  DROP CONSTRAINT IF EXISTS announce_has_owner;
ALTER TABLE announce
  ADD CONSTRAINT announce_has_owner
  CHECK (seller IS NOT NULL OR community IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_announce_community
  ON announce (community) WHERE community IS NOT NULL;

-- Drives the retro-claim below, and it is the only lookup that runs on login.
CREATE INDEX IF NOT EXISTS idx_announce_discord_author
  ON announce (discord_author_id) WHERE seller IS NULL AND discord_author_id IS NOT NULL;

-- ── announce_image ──────────────────────────────────────────────────────────
-- Same reason as seller: there is no uploader account behind these photos.
ALTER TABLE announce_image
  ALTER COLUMN uploader DROP NOT NULL;

-- ── Retro-claim ─────────────────────────────────────────────────────────────
-- When the Discord author eventually signs up, the announces they posted as an
-- anonymous community member become theirs. This is what turns the removed
-- signup gate into a better conversion path than the gate was: their profile is
-- populated on day one instead of empty.
--
-- Safe to hang off discord_id because that column is never user-supplied. It is
-- written only by sync_discord_id_from_user / sync_discord_id_from_identity
-- (20260706_discord_link.sql), both of which read auth.identities.provider_id,
-- i.e. the id Discord itself asserted during OAuth.
CREATE OR REPLACE FUNCTION claim_community_announces()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.discord_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE announce
     SET seller = NEW.id
   WHERE seller IS NULL
     AND discord_author_id = NEW.discord_id;

  UPDATE announce_image ai
     SET uploader = NEW.id
    FROM announce a
   WHERE ai.announce = a.id
     AND ai.uploader IS NULL
     AND a.seller = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_claim_community_announces ON "Trader";
CREATE TRIGGER trg_claim_community_announces
  AFTER INSERT OR UPDATE OF discord_id ON "Trader"
  FOR EACH ROW
  WHEN (NEW.discord_id IS NOT NULL)
  EXECUTE FUNCTION claim_community_announces();

NOTIFY pgrst, 'reload schema';
