-- Small key/value store for Discord bot runtime settings (e.g. which channel it
-- listens in). Only the bot touches this, using the service-role key which
-- bypasses RLS. RLS is enabled with NO policies so anon/authenticated clients
-- (the website) cannot read or write it.

CREATE TABLE IF NOT EXISTS public.bot_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bot_config ENABLE ROW LEVEL SECURITY;
