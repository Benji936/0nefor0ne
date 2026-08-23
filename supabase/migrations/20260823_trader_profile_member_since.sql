-- Trader profile: how long they have been here.
--
-- Ten of the fourteen accounts in this database have an empty trade pile, an
-- empty wishlist, no completed trades and no reviews. Their profile page was
-- therefore four zeroes and a sentence, and it read as an abandoned account
-- rather than as a new one — the page had no way to tell those two apart,
-- because the only fact that separates them was the one column it never asked
-- for.
--
-- Nothing new is exposed. "Trader" already carries a SELECT policy of `true`,
-- and frontend/src/lib/people.js has been reading created_at straight off the
-- table for the landing page's "Newest members" list since 20260811. This just
-- puts it on the curated profile function so the profile page does not need a
-- second query for one timestamp.
--
-- The column is appended last, so nothing that reads the existing ones — by
-- name or by position — changes. Postgres will not widen an existing function's
-- OUT row in place, so this drops and recreates in one transaction and restores
-- the grants explicitly rather than trusting the PUBLIC default.
drop function if exists public.get_trader_public_profile(uuid);

create function public.get_trader_public_profile(p_trader_id uuid)
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

grant execute on function public.get_trader_public_profile(uuid) to anon, authenticated, service_role;
