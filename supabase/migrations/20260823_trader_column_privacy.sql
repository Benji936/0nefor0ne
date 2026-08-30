-- Trader: stop handing out phone numbers with the profile.
--
-- "Trader" has carried a SELECT policy of `USING (true)` for the anon role
-- since 20250504. RLS is row-level, not column-level, so that policy does not
-- say "anyone may read a public profile" — it says "anyone holding the anon
-- key may `select *`". The anon key ships in the frontend bundle, so that is
-- everybody, and `*` includes Phone_number, Phone_region and discord_id.
--
-- Fourteen rows today, two with a phone number and five with a Discord id.
-- The number only goes up: the phone gate (20260818) has been on since
-- 2026-08-19, so a growing share of rows now carry a number.
--
-- This was never the intent. get_trader_public_profile() already exists and
-- returns a hand-picked column list — the safe surface was built, and the
-- table was simply left open behind it. What follows finishes that job:
--
--   1. a `trader_public` view carrying only the columns a stranger may read,
--   2. "Trader" itself readable only by the row's owner,
--   3. the one SECURITY INVOKER function that read the table repointed at the
--      view, so locking the table does not quietly empty the landing page.

-- ── 1. The public surface ───────────────────────────────────────────────────
--
-- Column names match the base table exactly — "Name", "City", "Country" and
-- all — so the call sites that move here change the table name and nothing
-- else.
--
-- security_invoker = off is the point of the object, not an oversight: the
-- view runs with its owner's rights and so reads past the row policy added
-- below. It is the same trade already made by get_trader_public_profile(),
-- and it is safe for the same reason — the column list is the boundary, and
-- it is fixed here rather than chosen by the caller. Supabase's linter flags
-- definer views generically; this one is deliberate.
--
-- Dropped and recreated rather than CREATE OR REPLACE: replace refuses to
-- change a view's column list, and this file should not depend on whether an
-- earlier attempt left one behind.
drop view if exists public.trader_public;

create view public.trader_public
with (security_invoker = off)
as
  select t.id,
         t."Name",
         t.avatar_url,
         t.country_code,
         t."Country",
         t."City",
         t.trade_scope,
         t.created_at
    from public."Trader" t;

-- Owned by postgres so "the owner's rights" are the table owner's, not those
-- of whichever role happened to run this migration.
alter view public.trader_public owner to postgres;

comment on view public.trader_public is
  'Every column of "Trader" a stranger may read. The base table is owner-read-only; anything cross-trader goes through here. Adding a column to this view publishes it — check first.';

grant select on public.trader_public to anon, authenticated;

-- ── 2. Close the table ──────────────────────────────────────────────────────
--
-- Dropped by lookup rather than by name. There are at least two permissive
-- SELECT policies on this table — "Users can read trader profiles" from
-- 20250504 and "Enable read access for all users" added through the
-- dashboard — and policies are OR'd, so leaving either one behind leaves the
-- table open. Anything else that accumulated goes with them.
do $$
declare
  pol record;
begin
  for pol in
    select policyname
      from pg_policies
     where schemaname = 'public'
       and tablename  = 'Trader'
       and cmd        = 'SELECT'
  loop
    execute format('drop policy %I on public."Trader"', pol.policyname);
  end loop;
end $$;

-- Your own row, and only ever your own. Every remaining direct read of this
-- table is a signed-in user reading themselves — their phone number on the
-- account page, their country code to prefill a form, their name for the nav
-- chip. Not granted to anon: anon has no row to read.
create policy "Trader: read your own row"
  on public."Trader"
  for select
  to authenticated
  using (auth.uid() = id);

-- Belt and braces, and the half that survives RLS being switched off by
-- accident: anon has no reason to hold SELECT on this table at all.
-- `authenticated` keeps the grant, since the policy above is what narrows it
-- to one row. The view is unaffected — a definer view checks the base table
-- against its owner, not against the caller.
revoke select on public."Trader" from anon;

-- ── 3. Repoint what would have broken ───────────────────────────────────────
--
-- top_tradepile_traders() was written SECURITY INVOKER on the explicit
-- reasoning that "for both anon and authenticated that is already every row"
-- (20260811). Step 2 makes that false, and an invoker function counting a
-- table it can no longer read returns nothing — the landing page's biggest-
-- trade-piles list would have gone silently empty rather than erroring.
--
-- Reading from the view keeps the function honest: still invoker, still no
-- extra privilege to audit, and now it can only ever see public columns.
-- "Card" is untouched and keeps its own `true` policy, which is what the
-- count is of.
create or replace function public.top_tradepile_traders(n integer default 3)
returns table (id uuid, name text, avatar_url text, pile_size bigint)
language sql
stable
set search_path = public
as $$
  SELECT t.id, t."Name", t.avatar_url, count(c.*)
    FROM public.trader_public t
    JOIN public."Card" c ON c.trader = t.id AND NOT c.wish
   GROUP BY t.id, t."Name", t.avatar_url
   ORDER BY count(c.*) DESC, t.id
   LIMIT least(greatest(coalesce(n, 3), 1), 24);
$$;

-- ── 4. While we are here ────────────────────────────────────────────────────
--
-- get_trader_public_profile() is SECURITY DEFINER, executable by anon, and
-- has no search_path pinned — so its unqualified "Card", "Trade" and
-- trader_rating references resolve through whatever search_path the caller
-- arrives with. Not reachable through PostgREST today, but a definer function
-- granted to anon is the wrong place to rely on that. Body unchanged; only
-- the SET is added, so this is a CREATE OR REPLACE rather than a recreate.
create or replace function public.get_trader_public_profile(p_trader_id uuid)
returns table (
  id uuid,
  name text,
  avatar_url text,
  country_code text,
  city text,
  trade_scope text,
  trade_pile_count bigint,
  wishlist_count bigint,
  completed_trades bigint,
  avg_rating numeric,
  rating_count bigint,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $function$
  SELECT
    t.id,
    t."Name"::text         AS name,
    t.avatar_url::text     AS avatar_url,
    t.country_code::text   AS country_code,
    t."City"::text         AS city,
    t.trade_scope::text    AS trade_scope,
    (SELECT count(*) FROM "Card" c
       WHERE c.trader = t.id AND c.wish = false AND c.status = 'available') AS trade_pile_count,
    (SELECT count(*) FROM "Card" c
       WHERE c.trader = t.id AND c.wish = true)                             AS wishlist_count,
    (SELECT count(*) FROM "Trade" tr
       WHERE (tr.user1 = t.id OR tr.user2 = t.id)
         AND tr.status = 'completed')                                       AS completed_trades,
    (SELECT round(avg(r.score)::numeric, 1)
       FROM trader_rating r WHERE r.ratee_id = t.id)                        AS avg_rating,
    (SELECT count(*)
       FROM trader_rating r WHERE r.ratee_id = t.id)                        AS rating_count,
    t.created_at
  FROM "Trader" t
  WHERE t.id = p_trader_id
$function$;

NOTIFY pgrst, 'reload schema';
