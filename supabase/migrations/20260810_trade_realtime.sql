-- Publish Trade and trade_photo, so the trade centre can hear about them.
--
-- Both tables were subscribed to from the client and neither was in the
-- publication, so neither emitted anything. That alone would have made the
-- proposals tab and the photo panel stale, but the damage was wider: a
-- postgres_changes binding on an unpublished table poisons the WHOLE channel.
-- TradeCenter puts Card, Trade and announce on one channel, so the invalid
-- Trade binding silently took matches and announces down with it. The channel
-- still reports SUBSCRIBED, which is why this was invisible for so long.
--
-- Measured before writing this: two channels on one client, one bound to
-- announce alone and one bound to announce + Trade, then a single announce
-- UPDATE. The clean channel received it. The other received nothing.

ALTER PUBLICATION supabase_realtime ADD TABLE public."Trade";
ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_photo;

-- REPLICA IDENTITY FULL, because these tables are read through RLS.
--
-- Realtime re-runs the SELECT policy against the row in the WAL record before
-- it delivers anything. Trade's policy reads user1/user2 and trade_photo's
-- reads trade; under the default replica identity a DELETE carries only the
-- primary key, so those columns are absent, the policy cannot be evaluated and
-- the event is dropped. A cancelled trade would never disappear from anyone
-- else's screen. FULL puts the whole old row in the record so the check can run.
--
-- The cost is a larger WAL record per write. These are low-volume tables and
-- announce already carries FULL for the same reason.
ALTER TABLE public."Trade"      REPLICA IDENTITY FULL;
ALTER TABLE public.trade_photo  REPLICA IDENTITY FULL;
