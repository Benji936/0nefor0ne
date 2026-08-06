-- Events become a verified-only feature.
--
-- Verification stops being a badge and starts being the switch: an unverified
-- community can exist and be found, but it cannot publish events. That is what
-- the verify flow is now selling, so it has to be true.
--
-- Scope: INSERT and UPDATE only.
--
--   SELECT stays open, because hiding events that are already published would
--   punish the people who follow a community for something its owner did.
--
--   DELETE stays open on purpose. If verification lapses, the owner must still
--   be able to take down an event that is no longer happening. Locking someone
--   out of removing stale information is worse than the thing being gated.
--
--   The community table's own UPDATE policy is deliberately NOT touched. A
--   store verifies by proving a domain, and to do that it needs a website on
--   file, and to add one it needs to edit an unverified community. Gating edits
--   would make verification unreachable for exactly the people it is for.
--
-- Nobody loses anything today: of 3 owned communities, 2 are unverified and
-- between them they have 0 events. Checked before writing this, which is why
-- there is no grandfathering clause.

DROP POLICY IF EXISTS "community_event_insert_owner" ON community_event;
CREATE POLICY "community_event_insert_owner" ON community_event FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM community c
    WHERE c.id = community_event.community
      AND c.owner = auth.uid()
      AND c.verified
  )
);

DROP POLICY IF EXISTS "community_event_update_owner" ON community_event;
CREATE POLICY "community_event_update_owner" ON community_event FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM community c
      WHERE c.id = community_event.community AND c.owner = auth.uid() AND c.verified
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM community c
      WHERE c.id = community_event.community AND c.owner = auth.uid() AND c.verified
    )
  );

NOTIFY pgrst, 'reload schema';
