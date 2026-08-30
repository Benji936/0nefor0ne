-- Keep every Cardmarket metric in cardmarket_price, but expose only the value
-- the product UI promises: trend first, then the lowest current listing. A
-- rolling average remains useful for analysis but must not silently become the
-- number presented as today's Cardmarket price.
CREATE OR REPLACE FUNCTION public.card_prices(p_card_ids bigint[])
RETURNS TABLE (
  card_id    bigint,
  price      numeric,
  low_price  numeric,
  high_price numeric,
  printings  integer,
  in_set     boolean,
  as_of      date,
  product_id bigint,
  pinned     boolean
)
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  WITH subject AS (
    SELECT c.id,
           lower(c.name) AS name,
           nullif(split_part(coalesce(c.extension, ''), '-', 1), '') AS set_code,
           rarity_key(c.rarity) AS rkey,
           c.cardmarket_product_id AS pinned_id
    FROM "Card" c
    WHERE c.id = ANY(p_card_ids)
  ),

  pinned AS (
    SELECT s.id, p.id_product, pr.trend, pr.low, pr.as_of
    FROM subject s
    JOIN cardmarket_product p ON p.id_product = s.pinned_id
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
  ),

  seed AS (
    SELECT DISTINCT s.id, p.id_expansion, p.id_metacard
    FROM subject s
    JOIN cardmarket_product p
      ON p.set_code = s.set_code AND lower(p.name) = s.name
    WHERE s.pinned_id IS NULL AND s.set_code IS NOT NULL
  ),

  printing AS (
    SELECT DISTINCT s.id, p.id_product, p.rarity, pr.trend, pr.low, pr.as_of
    FROM seed s
    JOIN cardmarket_product p
      ON p.id_expansion = s.id_expansion AND p.id_metacard = s.id_metacard
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
  ),

  complete AS (
    SELECT id FROM printing GROUP BY id HAVING count(*) = count(rarity)
  ),

  in_rarity AS (
    SELECT pg.id, pg.id_product, pg.trend, pg.low, pg.as_of
    FROM printing pg
    JOIN subject s ON s.id = pg.id
    WHERE pg.id IN (SELECT id FROM complete)
      AND s.rkey IS NOT NULL
      AND rarity_key(pg.rarity) = s.rkey
  ),

  in_set AS (
    SELECT pg.id, pg.id_product, pg.trend, pg.low, pg.as_of
    FROM printing pg
    WHERE NOT EXISTS (SELECT 1 FROM in_rarity r WHERE r.id = pg.id)
  ),

  by_name_seed AS (
    SELECT DISTINCT s.id, p.id_expansion, p.id_metacard
    FROM subject s
    JOIN cardmarket_product p ON lower(p.name) = s.name
    WHERE s.pinned_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM seed i WHERE i.id = s.id)
  ),
  by_name AS (
    SELECT DISTINCT s.id, p.id_product, pr.trend, pr.low, pr.as_of
    FROM by_name_seed s
    JOIN cardmarket_product p
      ON p.id_expansion = s.id_expansion AND p.id_metacard = s.id_metacard
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
  ),

  candidate AS (
    SELECT id, id_product, trend, low, as_of, true  AS narrowed FROM pinned
    UNION ALL
    SELECT id, id_product, trend, low, as_of, true              FROM in_rarity
    UNION ALL
    SELECT id, id_product, trend, low, as_of, true              FROM in_set
    UNION ALL
    SELECT id, id_product, trend, low, as_of, false             FROM by_name
  ),

  priced AS (
    SELECT id, id_product, narrowed, coalesce(trend, low) AS value, as_of
    FROM candidate
    WHERE coalesce(trend, low) IS NOT NULL
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
