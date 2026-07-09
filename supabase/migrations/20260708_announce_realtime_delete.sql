-- Let the Discord bot react to website-side announce deletions so it can remove
-- the linked Discord thread. The bot subscribes to DELETE events on announce;
-- REPLICA IDENTITY FULL makes those events carry the old row (incl. discord_url).
ALTER TABLE public.announce REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announce;
