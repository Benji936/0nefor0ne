-- Remember who made a community, and stop owners deleting rows they did not make.
--
-- Owning a community and having created one are different rights, and until now
-- the schema could not tell them apart. community_delete_own was USING (owner =
-- auth.uid()), so anyone who claimed a seeded store could hard-delete it out of
-- the directory: 4450 shops sourced from the OTS list, none of them the
-- claimer's to destroy. Nobody has done it. The policy simply allowed it.
--
-- created_by is the discriminator. A row you created is yours to delete. A row
-- you claimed is only yours to hand back, which is what community-release does.
--
-- Backfill: ots_store_id is set on every seeded row and on nothing else (4450
-- vs 1 at the time of writing), so "not seeded and owned" is exactly "created by
-- its owner". Seeded rows keep created_by NULL, which is the honest answer: the
-- import made them, no user did.

ALTER TABLE community
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE community SET created_by = owner
WHERE created_by IS NULL AND owner IS NOT NULL AND ots_store_id IS NULL;

-- New rows: the creator is whoever inserted it, always. Taking this from
-- auth.uid() rather than the payload means a client cannot claim authorship of
-- someone else's row, and cannot forge itself the right to delete a seeded one.
--
-- service_role passes through, same shape as community_claim_guard: the seeder
-- inserts with no user at all, and community-release needs to clear created_by
-- when it hands a row back to the directory.
CREATE OR REPLACE FUNCTION community_set_created_by()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'service_role');
BEGIN
  IF v_role = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;  -- frozen for life
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS community_set_created_by ON community;
CREATE TRIGGER community_set_created_by
  BEFORE INSERT OR UPDATE ON community
  FOR EACH ROW EXECUTE FUNCTION community_set_created_by();

-- The point of the migration. Deleting is for things you made; releasing is for
-- things you took over.
DROP POLICY IF EXISTS "community_delete_own" ON community;
CREATE POLICY "community_delete_own" ON community FOR DELETE
  USING (owner = auth.uid() AND created_by = auth.uid());

NOTIFY pgrst, 'reload schema';
