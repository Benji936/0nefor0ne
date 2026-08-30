-- YGOPRODeck includes a decorative star in the Yummy card names while
-- Cardmarket omits it:
--
--   Marshmao☆Yummy  <->  MarshmaoYummy
--
-- Case-fold and remove only the two decorative star glyphs. Do not collapse
-- all punctuation: punctuation is meaningful in names such as "D/D/D" and a
-- broad slug key could silently join two different cards.
CREATE OR REPLACE FUNCTION public.cardmarket_name_key(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT nullif(btrim(
    replace(replace(lower(normalize(coalesce(t, ''), NFKC)), '☆', ''), '★', '')
  ), '')
$function$;

GRANT EXECUTE ON FUNCTION public.cardmarket_name_key(text) TO anon, authenticated;

-- Card detail pages begin with a name and then widen to complete metacard
-- printings. Keep that seed lookup behind the same key as card_prices so the
-- two UI paths cannot disagree about decorative symbols.
CREATE OR REPLACE FUNCTION public.cardmarket_metacards_by_name(p_name text)
RETURNS TABLE (id_metacard bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  SELECT DISTINCT p.id_metacard
  FROM cardmarket_product p
  WHERE p.id_metacard IS NOT NULL
    AND cardmarket_name_key(p.name) = cardmarket_name_key(p_name)
$function$;

GRANT EXECUTE ON FUNCTION public.cardmarket_metacards_by_name(text) TO anon, authenticated;

CREATE INDEX IF NOT EXISTS cardmarket_product_set_name_key
  ON public.cardmarket_product (set_code, public.cardmarket_name_key(name));

CREATE INDEX IF NOT EXISTS cardmarket_product_name_key
  ON public.cardmarket_product (public.cardmarket_name_key(name));

-- Keep the existing price ladder and candidate rules; only replace exact
-- lower(name) comparisons with the shared, deliberately narrow name key.
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
           cardmarket_name_key(c.name) AS name_key,
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
      ON p.set_code = s.set_code
     AND cardmarket_name_key(p.name) = s.name_key
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
    JOIN cardmarket_product p ON cardmarket_name_key(p.name) = s.name_key
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

CREATE OR REPLACE VIEW public.cardmarket_match_state
WITH (security_invoker = true) AS
  SELECT
    c.id            AS card_id,
    c.trader,
    c.name,
    c.extension,
    c.rarity,
    nullif(split_part(coalesce(c.extension, ''), '-', 1), '') AS set_code,
    cp.price,
    cp.low_price,
    cp.high_price,
    cp.printings,
    cp.product_id,
    cp.pinned,
    CASE
      WHEN cp.pinned        THEN 'pinned'
      WHEN cp.printings = 0 AND cp.product_id IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM cardmarket_product p
         WHERE cardmarket_name_key(p.name) = cardmarket_name_key(c.name)
       )                    THEN 'unknown'
      WHEN cp.printings = 0 THEN 'unpriced'
      WHEN cp.printings > 1 THEN 'ambiguous'
      WHEN nullif(split_part(coalesce(c.extension, ''), '-', 1), '') IS NULL
                            THEN 'name'
      ELSE 'set'
    END AS match_method
  FROM "Card" c
  JOIN LATERAL card_prices(ARRAY[c.id]) cp ON true;

CREATE OR REPLACE VIEW public.cardmarket_ambiguous
WITH (security_invoker = true) AS
  WITH seed AS (
    SELECT DISTINCT m.card_id, p.id_expansion, p.id_metacard
    FROM public.cardmarket_match_state m
    JOIN cardmarket_product p
      ON (m.set_code IS NOT NULL
          AND p.set_code = m.set_code
          AND cardmarket_name_key(p.name) = cardmarket_name_key(m.name))
      OR (m.set_code IS NULL
          AND cardmarket_name_key(p.name) = cardmarket_name_key(m.name))
    WHERE m.match_method = 'ambiguous'
  )
  SELECT
    m.card_id,
    m.trader,
    m.name        AS our_card,
    m.set_code    AS our_set,
    m.rarity      AS our_rarity,
    m.low_price,
    m.high_price,
    p.id_product,
    p.name        AS candidate_name,
    p.id_expansion,
    p.id_metacard,
    p.set_code    AS candidate_set,
    p.rarity      AS candidate_rarity,
    p.rarity_source,
    pr.trend
  FROM seed s
  JOIN public.cardmarket_match_state m ON m.card_id = s.card_id
  JOIN cardmarket_product p
    ON p.id_expansion = s.id_expansion AND p.id_metacard = s.id_metacard
  LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product;

GRANT SELECT ON public.cardmarket_match_state TO authenticated;
GRANT SELECT ON public.cardmarket_ambiguous TO authenticated;
