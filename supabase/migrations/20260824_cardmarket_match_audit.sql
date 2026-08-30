-- Two views for answering "how well is pricing actually resolving, and where is
-- it stuck".
--
-- The spec this came from asked for a confidence score per match. There isn't
-- one, and inventing a 0.95 would be worse than useless -- it would imply a
-- calibration nobody performed. What there is instead is a small number of
-- discrete ways a card can reach a price, each of which either happened or did
-- not:
--
--   pinned    the owner pointed at a Cardmarket product. Not a match at all,
--             a fact. Nothing can improve on it.
--   set       set code + name found exactly one product in the printing
--   name      no usable set code; exactly one product carried the name
--   ambiguous several products are in play and nothing in the catalogue says
--             which one this card is
--   unpriced  products exist but none has a trend or a rolling average
--   unknown   Cardmarket prices nothing by that name
--
-- There is no 'rarity' method, and there was one briefly. Rarity cannot narrow
-- a printing: cardmarket_product.rarity is only set when YGOPRODeck lists a
-- single rarity for that card in that set, so it is identical on every product
-- of a printing.
--
-- `ambiguous` is the number to watch. Every row in it is a question the app
-- could put to its owner and currently does not, and cardmarket_ambiguous below
-- lists the candidates so the question can be asked with real prices attached.
--
-- SECURITY INVOKER: these read "Card", and whoever queries them should see
-- exactly the rows they would see selecting from it directly. Definer would
-- turn an audit view into a way to read other people's collections.

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
