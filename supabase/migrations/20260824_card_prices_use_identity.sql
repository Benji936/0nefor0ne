-- Let the price ladder use an identity Cardmarket stated.
--
-- A rarity rung was removed from this function earlier, and correctly: at the
-- time cardmarket_product.rarity was derived from (card, set) and was therefore
-- identical on every product of a printing. Filtering by it returned all of them
-- or none, never one, so the rung was dead weight pretending to be precision.
--
-- That changed when identity_source arrived. A product whose rarity was read off
-- its own Cardmarket page carries a rarity that differs from its siblings --
-- CORI's Magician of Dark Chaos - Black Chaos is Secret / Ultra / Starlight at
-- 5.10, 57.45 and 368.69 EUR -- and that *can* pick one product out of three.
--
-- So the rung returns, one rung below the owner's own pin:
--
--   0. the card names a product        -> that product's price
--   1. printing + rarity               -> usually one product          <- back
--   2. printing                        -> one product, or a band
--   3. name alone                      -> every printing
--   4. nothing priced by that name     -> no figure
--
-- The guard that makes rung 1 safe
-- --------------------------------
-- It only applies when *every* product of the printing has a rarity. Consider a
-- printing half-enriched: one product read as Secret Rare, its sibling still
-- NULL because nobody has fetched it. A card recorded as Secret Rare would match
-- the first and quote it as exact -- while the unfetched sibling might be Secret
-- Rare too. That is a confident wrong answer produced by missing data, which is
-- worse than the band it replaced.
--
-- Requiring a complete printing means a partially_resolved group keeps showing a
-- range until enrichment finishes it, which is the honest reading of what we
-- know. It also costs nothing for the 34,712 'unique' products: those carry a
-- rarity on every product of their printing, so the guard passes and the rarity
-- match returns the whole group exactly as rung 2 would.
--
-- The audit views read this function, so they come down with it and go back up
-- unchanged below. Their definitions live in 20260824_cardmarket_match_audit.sql;
-- this file recreates them verbatim so a rebuild from migrations lands in the
-- same place whichever order these two are applied in.
DROP VIEW IF EXISTS public.cardmarket_ambiguous;
DROP VIEW IF EXISTS public.cardmarket_match_audit;
DROP VIEW IF EXISTS public.cardmarket_match_state;
DROP FUNCTION IF EXISTS public.card_prices(bigint[]);

CREATE FUNCTION public.card_prices(p_card_ids bigint[])
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

  -- Rung 0. The owner said which one it is.
  pinned AS (
    SELECT s.id, p.id_product, pr.trend, pr.avg7, pr.avg30, pr.as_of
    FROM subject s
    JOIN cardmarket_product p ON p.id_product = s.pinned_id
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
  ),

  -- Which printing is this, found by the name the app records.
  seed AS (
    SELECT DISTINCT s.id, p.id_expansion, p.id_metacard
    FROM subject s
    JOIN cardmarket_product p
      ON p.set_code = s.set_code AND lower(p.name) = s.name
    WHERE s.pinned_id IS NULL AND s.set_code IS NOT NULL
  ),

  -- Every product of that printing, once.
  printing AS (
    SELECT DISTINCT s.id, p.id_product, p.rarity,
           pr.trend, pr.avg7, pr.avg30, pr.as_of
    FROM seed s
    JOIN cardmarket_product p
      ON p.id_expansion = s.id_expansion AND p.id_metacard = s.id_metacard
    LEFT JOIN cardmarket_price pr ON pr.id_product = p.id_product
  ),

  -- The guard: a printing nobody has finished enriching cannot be narrowed by
  -- rarity, because the products still missing one might carry the same rarity.
  complete AS (
    SELECT id FROM printing GROUP BY id HAVING count(*) = count(rarity)
  ),

  -- Rung 1. The card's own rarity picks its product out of the printing.
  in_rarity AS (
    SELECT pg.id, pg.id_product, pg.trend, pg.avg7, pg.avg30, pg.as_of
    FROM printing pg
    JOIN subject s ON s.id = pg.id
    WHERE pg.id IN (SELECT id FROM complete)
      AND s.rkey IS NOT NULL
      AND rarity_key(pg.rarity) = s.rkey
  ),

  -- Rung 2. The printing is known, its versions are not tellable apart.
  in_set AS (
    SELECT pg.id, pg.id_product, pg.trend, pg.avg7, pg.avg30, pg.as_of
    FROM printing pg
    WHERE NOT EXISTS (SELECT 1 FROM in_rarity r WHERE r.id = pg.id)
  ),

  -- Rung 3. No usable set code, so every printing of the card counts.
  by_name_seed AS (
    SELECT DISTINCT s.id, p.id_expansion, p.id_metacard
    FROM subject s
    JOIN cardmarket_product p ON lower(p.name) = s.name
    WHERE s.pinned_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM seed i WHERE i.id = s.id)
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
    SELECT id, id_product, trend, avg7, avg30, as_of, true            FROM in_rarity
    UNION ALL
    SELECT id, id_product, trend, avg7, avg30, as_of, true            FROM in_set
    UNION ALL
    SELECT id, id_product, trend, avg7, avg30, as_of, false           FROM by_name
  ),

  -- trend is the figure the app shows; the rolling averages are its fallbacks.
  -- `low` is deliberately absent: it is the cheapest listing, median 0.27 of
  -- trend, and on products with no sales history it is one person asking a
  -- number rather than a market.
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

-- ── The audit views, recreated unchanged ───────────────────────────────────
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
       AND NOT EXISTS (SELECT 1 FROM cardmarket_product p WHERE lower(p.name) = lower(c.name))
                            THEN 'unknown'
      WHEN cp.printings = 0 THEN 'unpriced'
      WHEN cp.printings > 1 THEN 'ambiguous'
      WHEN nullif(split_part(coalesce(c.extension, ''), '-', 1), '') IS NULL
                            THEN 'name'
      ELSE 'set'
    END AS match_method
  FROM "Card" c
  JOIN LATERAL card_prices(ARRAY[c.id]) cp ON true;

-- The one-line answer. Counts only what the caller can see, so a trader gets
-- their own collection's health and nobody else's.
CREATE OR REPLACE VIEW public.cardmarket_match_audit
WITH (security_invoker = true) AS
  SELECT
    count(*)                                                            AS total_printings,
    count(*) FILTER (WHERE match_method IN ('pinned','set','name'))     AS matched_printings,
    count(*) FILTER (WHERE match_method IN ('pinned','set'))            AS high_confidence,
    count(*) FILTER (WHERE match_method = 'pinned')                     AS manual_matches,
    count(*) FILTER (WHERE match_method = 'ambiguous')                  AS ambiguous_matches,
    count(*) FILTER (WHERE match_method IN ('unpriced','unknown'))      AS unmatched_printings,
    round(
      100.0 * count(*) FILTER (WHERE match_method IN ('pinned','set','name'))
            / nullif(count(*), 0), 1)                                   AS matched_pct
  FROM public.cardmarket_match_state;

-- Every candidate behind an unresolved card, so an ambiguity can be looked at
-- rather than guessed at. One row per candidate product.
--
-- Grouped the same way card_prices groups: seed on the name, then widen to the
-- whole (id_expansion, id_metacard) printing, so the candidate list here is
-- exactly the set of products the band was computed from. Anything narrower
-- would show fewer candidates than the price implies.
CREATE OR REPLACE VIEW public.cardmarket_ambiguous
WITH (security_invoker = true) AS
  WITH seed AS (
    SELECT DISTINCT m.card_id, p.id_expansion, p.id_metacard
    FROM public.cardmarket_match_state m
    JOIN cardmarket_product p
      ON (m.set_code IS NOT NULL AND p.set_code = m.set_code AND lower(p.name) = lower(m.name))
      OR (m.set_code IS NULL AND lower(p.name) = lower(m.name))
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
GRANT SELECT ON public.cardmarket_match_audit TO authenticated;
GRANT SELECT ON public.cardmarket_ambiguous   TO authenticated;
