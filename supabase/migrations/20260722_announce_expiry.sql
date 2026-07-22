-- Announces expire 30 days after they are posted or last renewed.
--
-- Expiry is a visibility rule, not a deletion: the row, its images and its chat
-- thread all survive. The listing simply drops out of the public grid, stays
-- visible to its owner with an "expired" badge, and can be renewed for another
-- full window. Nothing here needs a scheduled job, because the cut-off is
-- applied at read time by comparing expires_at.

ALTER TABLE announce
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill gives every existing row a fresh full window instead of
-- created_at + 30 days, so shipping this never retroactively hides a listing
-- that is live right now. They start ageing from today.
UPDATE announce SET expires_at = now() + interval '30 days' WHERE expires_at IS NULL;

ALTER TABLE announce ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE announce ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 days');

-- The window is enforced here rather than in the client. announce_update_own
-- lets an owner UPDATE any column on their own row, so without this guard a
-- hand-written PostgREST call could set expires_at to the year 3000 and opt out
-- of expiry entirely. Any attempt to write the column, on insert or on update,
-- is rewritten to exactly one fresh window measured from now - which is also
-- all a renewal ever needs to do, so renewing is just "write anything here".
-- Updates that leave expires_at alone (mark-as-sold, edit, link-a-card) pass
-- through untouched and do NOT silently extend the listing.
CREATE OR REPLACE FUNCTION announce_enforce_expiry()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    NEW.expires_at := now() + interval '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS announce_expiry_guard ON announce;
CREATE TRIGGER announce_expiry_guard
  BEFORE INSERT OR UPDATE ON announce
  FOR EACH ROW EXECUTE FUNCTION announce_enforce_expiry();

-- Serves the public grid's hot path: active listings ordered by how long they
-- have left. Partial on status because sold/archived rows are never read here.
CREATE INDEX IF NOT EXISTS idx_announce_active_expiry
  ON announce (expires_at DESC)
  WHERE status = 'active';
