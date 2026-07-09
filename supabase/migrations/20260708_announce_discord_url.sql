-- Track where a Discord-sourced announce came from, so the site can link back to
-- the originating thread/message. NULL for announces created on the website.
ALTER TABLE public.announce ADD COLUMN IF NOT EXISTS discord_url text;
