-- A community can be more than one thing at once.
--
-- kind was a single choice out of store / discord / group, which forced a shop
-- with a Discord server and a Thursday play group to pick one and lie about the
-- other two, or to make three communities for one place. Now that an account
-- owns exactly one community, that would have been a trap: the cap only makes
-- sense if a single community can describe everything a place actually is.
--
-- kinds is the truth. kind stays as the primary kind, kinds[1], because the
-- store seeder writes kind and knows nothing about arrays, and because the
-- directory still wants one glyph when it only has room for one.
--
-- Order is meaningful and belongs to whoever set it: first is primary. The
-- trigger removes duplicates and leaves the rest alone.

ALTER TABLE community ADD COLUMN IF NOT EXISTS kinds text[];

UPDATE community SET kinds = ARRAY[kind] WHERE kinds IS NULL;

ALTER TABLE community ALTER COLUMN kinds SET NOT NULL;

ALTER TABLE community DROP CONSTRAINT IF EXISTS community_kinds_check;
ALTER TABLE community ADD CONSTRAINT community_kinds_check CHECK (
  cardinality(kinds) BETWEEN 1 AND 3
  AND kinds <@ ARRAY['store', 'discord', 'group']::text[]
);

-- Overlap queries (&&, @>) for the directory filter, which now asks "is store
-- among your kinds" rather than "is store your kind".
CREATE INDEX IF NOT EXISTS community_kinds_gin ON community USING gin (kinds);

-- Keeps the two columns from ever disagreeing, whichever one the writer knows
-- about. No service_role bypass here: this is normalisation, not a permission,
-- and the seeder writing kind alone is exactly the case it has to cover.
CREATE OR REPLACE FUNCTION community_sync_kinds()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.kinds IS NOT DISTINCT FROM OLD.kinds
     AND NEW.kind IS DISTINCT FROM OLD.kind THEN
    -- Only kind was touched: promote it, keeping any other kinds behind it.
    NEW.kinds := ARRAY[NEW.kind] || array_remove(NEW.kinds, NEW.kind);
  ELSIF NEW.kinds IS NULL OR cardinality(NEW.kinds) = 0 THEN
    NEW.kinds := ARRAY[NEW.kind];
  END IF;

  -- Dedupe, first occurrence wins, order otherwise untouched.
  NEW.kinds := (
    SELECT array_agg(k ORDER BY ord)
    FROM (
      SELECT DISTINCT ON (k) k, ord
      FROM unnest(NEW.kinds) WITH ORDINALITY AS t(k, ord)
      ORDER BY k, ord
    ) s
  );

  NEW.kind := NEW.kinds[1];
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS community_sync_kinds ON community;
CREATE TRIGGER community_sync_kinds
  BEFORE INSERT OR UPDATE ON community
  FOR EACH ROW EXECUTE FUNCTION community_sync_kinds();

NOTIFY pgrst, 'reload schema';
