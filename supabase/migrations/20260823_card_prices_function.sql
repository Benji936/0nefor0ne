-- card_prices: the one place a card becomes a price.
--
-- Every surface that shows money calls this — the collection, the card page,
-- and both columns of a trade proposal. That is the point of it being a
-- function rather than a query each page writes for itself: the trade gap feeds
-- a cash offset, which is a claim about money between two people, and two
-- implementations of "what is this pile worth" would eventually disagree about
-- it. One caller, one answer.
--
-- The resolution ladder, in the order the CTEs below run:
--
--   1. the set code is known and matches one product        -> one price
--   2. the set code is known and matches several            -> a band, tight
--   3. no set code, or it matched nothing                   -> a band, wide
--   4. Cardmarket prices nothing by that name               -> no figure
--
-- Rung 2 is not a failure to resolve, it is a fact about Cardmarket: a set can
-- print a card at two rarities and Cardmarket files them as two products with
-- no rarity on either. CORI-EN027 is two products at 57.82 and 368.69 EUR.
-- Picking one would be a coin flip on a 300 EUR difference, so the function
-- returns both ends and lets the UI say so.
--
-- Rung 3 is 78% of rows today, because bulk add writes extension '' — see
-- frontend/src/lib/bulkAddResolver.js. Narrowing that is what the "which
-- printing?" prompt in the collection is for, and the difference is real:
-- Albion the Sanctifire Dragon is 0.21-30.47 across all printings and
-- 0.21-6.52 once you know it came from RA05.
--
-- SECURITY INVOKER on purpose. "Card" carries a permissive SELECT policy, so
-- the caller already sees these rows; running as definer would grant nothing
-- extra, and would quietly keep granting it if that policy is ever tightened.
CREATE OR REPLACE FUNCTION public.card_prices(p_card_ids bigint[])
RETURNS TABLE (
  card_id    bigint,
  price      numeric,  -- set only when the candidates collapse to one figure
  low_price  numeric,
  high_price numeric,
  printings  integer,
  in_set     boolean,  -- were the candidates narrowed by a known set code
  as_of      date
)
LANGUAGE sql
STABLE
AS $function$
  WITH subject AS (
    SELECT c.id,
           lower(c.name) AS name,
           -- "POTE-EN012" -> "POTE". Blank on 78% of rows today, which is the
           -- whole reason the name-level rung below exists.
           nullif(split_part(coalesce(c.extension, ''), '-', 1), '') AS set_code
    FROM "Card" c
    WHERE c.id = ANY(p_card_ids)
  ),
  -- The printing is known. Usually one product; sometimes several, because a
  -- set can print a card at two rarities and Cardmarket labels neither.
  in_set AS (
    SELECT s.id, pr.trend, pr.avg7, pr.avg30, pr.as_of
    FROM subject s
    JOIN cardmarket_product p
      ON p.set_code = s.set_code AND lower(p.name) = s.name
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
    WHERE s.set_code IS NOT NULL
  ),
  -- Only a name, or a set code that matched nothing. Every printing counts.
  by_name AS (
    SELECT s.id, pr.trend, pr.avg7, pr.avg30, pr.as_of
    FROM subject s
    JOIN cardmarket_product p ON lower(p.name) = s.name
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
    WHERE NOT EXISTS (SELECT 1 FROM in_set i WHERE i.id = s.id)
  ),
  candidate AS (
    SELECT id, trend, avg7, avg30, as_of, true  AS from_set FROM in_set
    UNION ALL
    SELECT id, trend, avg7, avg30, as_of, false            FROM by_name
  ),
  -- trend is the figure the app shows; the rolling averages are its fallbacks,
  -- because trend is absent on 12% of products and an older figure beats none.
  --
  -- `low` is deliberately not in this chain. It is the cheapest listing, whose
  -- median is 0.27 of trend across 76,843 products -- usually a played copy in a
  -- language you did not ask for -- and on the 8,705 products (10%) that carry
  -- no trend and no average it is not a market at all, just one person asking a
  -- number. Reading it as a value turned a Dark Magical Curtain printing with a
  -- single 18,995 EUR listing into the ceiling of a whole collection. A product
  -- with no sales history now reports no price and the UI omits it; 76,123 of
  -- 86,494 products (88%) still resolve, every one off actual sales.
  priced AS (
    SELECT id, from_set, coalesce(trend, avg7, avg30) AS value, as_of
    FROM candidate
    WHERE coalesce(trend, avg7, avg30) IS NOT NULL
  )
  SELECT
    s.id,
    CASE WHEN count(p.value) = 1 THEN min(p.value) END,
    CASE WHEN count(p.value) > 1 THEN min(p.value) END,
    CASE WHEN count(p.value) > 1 THEN max(p.value) END,
    count(p.value)::int,
    coalesce(bool_and(p.from_set), false),
    max(p.as_of)
  FROM subject s
  LEFT JOIN priced p ON p.id = s.id
  GROUP BY s.id
$function$;

GRANT EXECUTE ON FUNCTION public.card_prices(bigint[]) TO anon, authenticated;
