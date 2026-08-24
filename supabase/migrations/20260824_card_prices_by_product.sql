-- card_prices, rebuilt around the Cardmarket product id.
--
-- The ladder, top to bottom:
--
--   0. the card names a product     -> that product's price, nothing inferred
--   1. set code + name              -> the whole printing; one product or a band
--   2. name alone                   -> every printing the card ever had
--   3. nothing priced by that name  -> no figure
--
-- Rung 0 is the point of the change. Everything below it is the app narrowing
-- by what it happens to know; rung 0 is the app being told, by the one party
-- who can see the card. Card.cardmarket_product_id is written by the printing
-- picker and by nothing else, so an automatic pass can never overwrite it.
--
-- What is deliberately not here
-- -----------------------------
-- There is no rung matching on rarity, and there was one for about an hour.
-- It cannot work: cardmarket_product.rarity is only ever set when YGOPRODeck
-- lists exactly one rarity for that card in that set, which means it holds the
-- same value on every product of a printing. Filtering a printing by it returns
-- all of them or none of them, never one. The column is worth keeping -- it is
-- true, and the UI shows it -- but it cannot break a tie, so a rung that
-- pretended to would be dead code implying a precision the data cannot supply.
--
-- Nor is there any use of product ordering. Cardmarket's daily files carry no
-- rarity and no version number: a singles record is idProduct, name,
-- idCategory, categoryName, idExpansion, idMetacard, dateAdded, and 0 of 86,507
-- names contain "(V.". Which of RA02's seven "Purrely" rows is the Quarter
-- Century Secret Rare is not in the data, and id_product order, dateAdded order
-- and price order are all guesses wearing a fact's clothing. Seven products,
-- 0.21 to 5.62 EUR: a band and a question, not a number.
--
-- A printing is (id_expansion, id_metacard)
-- ----------------------------------------
-- Not (set code, name). Cardmarket corrects its own spelling, so one card can
-- be filed under two names -- CORI's "Magician of Dark Chaos – Black Chaos"
-- differs from its two siblings by an en-dash, and 61 metacards catalogue-wide
-- carry more than one name. Matching a Card row by name finds a way into the
-- printing; the metacard is what says where the printing ends. Rungs 1 and 2
-- therefore seed on the name and then widen to the whole group, so a band spans
-- every product that really is this card rather than every product that happens
-- to be spelled the same.
--
-- SECURITY INVOKER on purpose. "Card" carries a permissive SELECT policy so the
-- caller already sees these rows; definer would grant nothing extra and would
-- keep granting it if that policy is ever tightened.
DROP FUNCTION IF EXISTS public.card_prices(bigint[]);

CREATE FUNCTION public.card_prices(p_card_ids bigint[])
RETURNS TABLE (
  card_id    bigint,
  price      numeric,  -- set only when the candidates collapse to one figure
  low_price  numeric,
  high_price numeric,
  printings  integer,
  in_set     boolean,  -- were the candidates narrowed below the bare card name
  as_of      date,
  product_id bigint,   -- the Cardmarket product, when exactly one was in play
  pinned     boolean   -- did the card name its own printing
)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  WITH subject AS (
    SELECT c.id,
           lower(c.name) AS name,
           -- "POTE-EN012" -> "POTE". Blank on 78% of rows, because bulk add
           -- writes extension '' -- see frontend/src/lib/bulkAddResolver.js.
           nullif(split_part(coalesce(c.extension, ''), '-', 1), '') AS set_code,
           c.cardmarket_product_id AS pinned_id
    FROM "Card" c
    WHERE c.id = ANY(p_card_ids)
  ),

  -- Rung 0. The owner said which one it is.
  pinned AS (
    SELECT s.id, p.id_product, pr.trend, pr.avg7, pr.avg30, pr.as_of
    FROM subject s
    JOIN cardmarket_product p ON p.id_product = s.pinned_id
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
  ),

  -- Rung 1, seed: which printing is this, found by the name the app records.
  in_set_seed AS (
    SELECT DISTINCT s.id, p.id_expansion, p.id_metacard
    FROM subject s
    JOIN cardmarket_product p
      ON p.set_code = s.set_code AND lower(p.name) = s.name
    WHERE s.pinned_id IS NULL AND s.set_code IS NOT NULL
  ),

  -- Rung 1. Every product of that printing. One product for 55,121 of 66,829
  -- printings; several for the rest, and then the two ends are returned and the
  -- UI says so. CORI-EN027 is 57.82 and 368.69: picking one would be a coin
  -- flip on a 300 EUR difference.
  in_set AS (
    SELECT DISTINCT s.id, p.id_product, pr.trend, pr.avg7, pr.avg30, pr.as_of
    FROM in_set_seed s
    JOIN cardmarket_product p
      ON p.id_expansion = s.id_expansion AND p.id_metacard = s.id_metacard
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
  ),

  -- Rung 2, seed: no usable set code, so every printing of the card counts.
  -- This is 78% of rows today, and answering "which printing?" is worth a lot:
  -- Albion the Sanctifire Dragon is 0.21-30.47 across all printings and
  -- 0.21-6.52 once you know it came from RA05.
  by_name_seed AS (
    SELECT DISTINCT s.id, p.id_expansion, p.id_metacard
    FROM subject s
    JOIN cardmarket_product p ON lower(p.name) = s.name
    WHERE s.pinned_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM in_set_seed i WHERE i.id = s.id)
  ),

  by_name AS (
    SELECT DISTINCT s.id, p.id_product, pr.trend, pr.avg7, pr.avg30, pr.as_of
    FROM by_name_seed s
    JOIN cardmarket_product p
      ON p.id_expansion = s.id_expansion AND p.id_metacard = s.id_metacard
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
  ),

  candidate AS (
    SELECT id, id_product, trend, avg7, avg30, as_of, true  AS narrowed FROM pinned
    UNION ALL
    SELECT id, id_product, trend, avg7, avg30, as_of, true            FROM in_set
    UNION ALL
    SELECT id, id_product, trend, avg7, avg30, as_of, false           FROM by_name
  ),

  -- trend is the figure the app shows; the rolling averages are its fallbacks,
  -- because trend is absent on 12% of products and an older figure beats none.
  --
  -- `low` is deliberately not in this chain. It is the cheapest listing, whose
  -- median is 0.27 of trend across 76,843 products -- usually a played copy in a
  -- language you did not ask for -- and on the 8,705 products (10%) carrying no
  -- trend and no average it is not a market at all, just one person asking a
  -- number. Reading it as a value turned a Dark Magical Curtain printing with a
  -- single 18,995 EUR listing into the ceiling of a whole collection.
  priced AS (
    SELECT id, id_product, narrowed, coalesce(trend, avg7, avg30) AS value, as_of
    FROM candidate
    WHERE coalesce(trend, avg7, avg30) IS NOT NULL
  )

  SELECT
    s.id,
    CASE WHEN count(p.value) = 1 THEN min(p.value) END,
    CASE WHEN count(p.value) > 1 THEN min(p.value) END,
    CASE WHEN count(p.value) > 1 THEN max(p.value) END,
    count(p.value)::int,
    coalesce(bool_and(p.narrowed), false),
    max(p.as_of),
    CASE WHEN count(p.value) = 1 THEN min(p.id_product) END,
    s.pinned_id IS NOT NULL
  FROM subject s
  LEFT JOIN priced p ON p.id = s.id
  GROUP BY s.id, s.pinned_id
$function$;

GRANT EXECUTE ON FUNCTION public.card_prices(bigint[]) TO anon, authenticated;
