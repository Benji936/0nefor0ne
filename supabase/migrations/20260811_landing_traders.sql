-- Who is here: the two reads behind the landing page's people section.
--
-- Both are public on purpose. `Trader` and `Card` already carry a
-- `USING (true)` SELECT policy for the anon role, so nothing below widens what
-- a visitor can see — it only makes two questions cheap to ask that were
-- previously either impossible or a full table scan on the client.

-- ── 1. When somebody joined ─────────────────────────────────────────────────
--
-- Sign-up time lives in auth.users.created_at, which anon cannot read and
-- should not. Rather than reach across the schema boundary with a definer
-- function, put the timestamp where the public profile already is.
--
-- The default is exact rather than approximate: the on_auth_user_created
-- trigger inserts the Trader row from inside the signup transaction, so now()
-- at insert time IS the moment the account was created. Existing rows are
-- backfilled from auth.users below, once.
ALTER TABLE public."Trader"
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();

UPDATE public."Trader" t
   SET created_at = u.created_at
  FROM auth.users u
 WHERE u.id = t.id;

-- Newest first is the only order this column is ever read in.
CREATE INDEX trader_created_at ON public."Trader" (created_at DESC);

-- ── 2. How big a trade pile is ──────────────────────────────────────────────
--
-- PostgREST cannot GROUP BY, and the alternative — shipping every Card row to
-- the browser so it can count them — gets worse with every card anyone adds.
-- One function, counted in the database, capped at what a page can show.
--
-- SECURITY INVOKER, deliberately: the caller's own RLS decides what is
-- counted, and for both anon and authenticated that is already every row. A
-- definer function here would grant nothing extra and would have to be audited
-- forever.
CREATE OR REPLACE FUNCTION public.top_tradepile_traders(n integer DEFAULT 3)
RETURNS TABLE (id uuid, name text, avatar_url text, pile_size bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT t.id, t."Name", t.avatar_url, count(c.*)
    FROM public."Trader" t
    JOIN public."Card" c ON c.trader = t.id AND NOT c.wish
   GROUP BY t.id, t."Name", t.avatar_url
   -- id breaks ties so the list is stable between loads rather than
   -- reshuffling two equal piles on every visit.
   ORDER BY count(c.*) DESC, t.id
   -- Clamped: `n` arrives from the browser, and an uncapped LIMIT is an
   -- invitation to ask for the whole table.
   LIMIT least(greatest(coalesce(n, 3), 1), 24);
$$;

-- Covers the join above: only the trade pile is ever counted, never the wants.
CREATE INDEX card_trader_tradepile ON public."Card" (trader) WHERE NOT wish;

GRANT EXECUTE ON FUNCTION public.top_tradepile_traders(integer) TO anon, authenticated;
