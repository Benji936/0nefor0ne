-- Snapshot of the Discord server an announce was posted from, so the site can
-- show the server's name and icon next to the "View on Discord" link.
-- NULL for website announces (and for older Discord announces posted before this).
ALTER TABLE public.announce ADD COLUMN IF NOT EXISTS discord_guild_name text;
ALTER TABLE public.announce ADD COLUMN IF NOT EXISTS discord_guild_icon text;
