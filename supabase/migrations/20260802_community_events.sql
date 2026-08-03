-- Community events: owner-created events shown on a community profile.
-- Events belong to a community and carry NO owner column of their own — ownership
-- is derived through the parent community (community.owner = auth.uid()), the same
-- trust boundary as community_report. Plain PostgREST + RLS, no Edge Function.

CREATE TABLE IF NOT EXISTS community_event (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community    bigint NOT NULL REFERENCES community(id) ON DELETE CASCADE,
  title        text   NOT NULL CHECK (char_length(title) BETWEEN 1 AND 140),
  description  text   NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz CHECK (ends_at IS NULL OR ends_at >= starts_at),
  timezone     text,                          -- IANA name for display, optional
  is_online    boolean NOT NULL DEFAULT false,
  location     text,                          -- venue/address; may default to community.city
  url          text,                          -- registration / details / join link
  cover_url    text,
  status       text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_community_event_community_start ON community_event (community, starts_at);
CREATE INDEX IF NOT EXISTS idx_community_event_start          ON community_event (starts_at);

ALTER TABLE community_event ENABLE ROW LEVEL SECURITY;

-- Public reads published events of published communities; the owner reads every
-- event of a community they own (including hidden ones).
DROP POLICY IF EXISTS "community_event_select" ON community_event;
CREATE POLICY "community_event_select" ON community_event FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM community c
    WHERE c.id = community_event.community
      AND (
        (community_event.status = 'published' AND c.status = 'published')
        OR c.owner = auth.uid()
      )
  )
);

-- Write (insert/update/delete) only when the caller owns the parent community.
DROP POLICY IF EXISTS "community_event_insert_owner" ON community_event;
CREATE POLICY "community_event_insert_owner" ON community_event FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community AND c.owner = auth.uid())
);

DROP POLICY IF EXISTS "community_event_update_owner" ON community_event;
CREATE POLICY "community_event_update_owner" ON community_event FOR UPDATE
  USING      (EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community AND c.owner = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community AND c.owner = auth.uid()));

DROP POLICY IF EXISTS "community_event_delete_owner" ON community_event;
CREATE POLICY "community_event_delete_owner" ON community_event FOR DELETE
  USING (EXISTS (SELECT 1 FROM community c WHERE c.id = community_event.community AND c.owner = auth.uid()));

-- Keep updated_at fresh on UPDATE (mirrors the pattern used elsewhere).
CREATE OR REPLACE FUNCTION community_event_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_event_touch ON community_event;
CREATE TRIGGER trg_community_event_touch
  BEFORE UPDATE ON community_event
  FOR EACH ROW EXECUTE FUNCTION community_event_touch_updated_at();

NOTIFY pgrst, 'reload schema';
