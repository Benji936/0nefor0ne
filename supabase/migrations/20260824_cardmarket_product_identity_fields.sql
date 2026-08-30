-- Somewhere to put an identity Cardmarket states, and a queue of what still
-- needs one.
--
-- Where this sits
-- ---------------
-- cardmarket_product.rarity already answers one question, for 34,712 products:
-- "YGOPRODeck lists exactly one rarity for this card in this set, so every
-- product in the printing is that rarity". That is a fact about the *card*. It
-- is identical across every product of a printing by construction, so it can
-- never say which of nine Aleister the Invoker products you are holding.
--
-- The columns below answer the other question: "which product is this one".
-- They are only ever written from a source that states it outright. Nothing
-- here may be derived from id_product order, dateAdded order, price order or
-- array position -- that inference shipped once, wrote 5,646 rarities off a
-- pattern, and was removed. The column it used, variant_rank, is not coming
-- back under a new name.
--
-- rarity_source and identity_source are different questions and are kept apart:
--
--   rarity_source    how we learned the rarity        'unique' | 'cardmarket_page'
--   identity_source  how we learned *which product*   'cardmarket_page' | 'manual'
--
-- 'cardmarket_api' is deliberately absent. API applications are manually
-- approved and we do not have access; adding the value now would describe a
-- capability that does not exist.

ALTER TABLE public.cardmarket_product
  -- The version number Cardmarket prints, e.g. 5 from "(V.5 - Quarter Century
  -- Secret Rare)". Read, never counted.
  ADD COLUMN IF NOT EXISTS version_no smallint,

  -- The parenthetical exactly as Cardmarket writes it, kept whole because the
  -- syntax varies and a product that does not fit "(V.N - Rarity)" still has
  -- something worth storing.
  ADD COLUMN IF NOT EXISTS version_label text,

  ADD COLUMN IF NOT EXISTS identity_source text,
  ADD COLUMN IF NOT EXISTS identity_at timestamptz;

-- Identity is written as a set or not at all. A row carrying a version with no
-- provenance is indistinguishable from a guess six months from now, and a
-- provenance with no timestamp cannot be re-checked when Cardmarket changes a
-- page.
ALTER TABLE public.cardmarket_product
  DROP CONSTRAINT IF EXISTS cardmarket_product_identity_check;
ALTER TABLE public.cardmarket_product
  ADD CONSTRAINT cardmarket_product_identity_check CHECK (
    identity_source IS NULL
      AND version_no IS NULL AND version_label IS NULL AND identity_at IS NULL
    OR
    identity_source IN ('cardmarket_page', 'manual')
      AND identity_at IS NOT NULL
      AND (version_no IS NOT NULL OR version_label IS NOT NULL)
  );

ALTER TABLE public.cardmarket_product
  DROP CONSTRAINT IF EXISTS cardmarket_product_version_no_check;
ALTER TABLE public.cardmarket_product
  ADD CONSTRAINT cardmarket_product_version_no_check
  CHECK (version_no IS NULL OR version_no > 0);

-- Enrichment learns the rarity and the version from the same page, and that
-- rarity *is* per product -- unlike 'unique', it can break a tie. Widening the
-- existing constraint rather than adding a second column keeps one answer to
-- "what rarity is this product", with rarity_source saying how well we know it.
ALTER TABLE public.cardmarket_product
  DROP CONSTRAINT IF EXISTS cardmarket_product_rarity_source_check;
ALTER TABLE public.cardmarket_product
  ADD CONSTRAINT cardmarket_product_rarity_source_check
  CHECK (rarity_source IN ('unique', 'cardmarket_page'));

-- The queue's own lookup: products still missing identity, inside a printing.
CREATE INDEX IF NOT EXISTS cardmarket_product_needs_identity
  ON public.cardmarket_product (id_expansion, id_metacard)
  WHERE identity_source IS NULL;


-- ── What still needs work, and what only looks like it does ────────────────
--
-- A printing with several products is not automatically a problem. Card Trooper
-- in expansion 1446 is two products, and once 262486 reads Common and 262487
-- reads Mosaic Rare it is finished -- still multi-product, no longer unresolved.
-- So this view carries every multi-product printing and a status, rather than
-- being a list that only ever grows shorter by deletion.
--
-- The status is derived, not stored. A stored one would be a second copy of
-- something the identity columns already say, and the two would drift the first
-- time a row was updated by hand.
--
--   unresolved         no product carries identity
--   partially_resolved some do, some do not
--   manual_review      all do, and they still are not distinguishable --
--                      two products claiming the same version or the same
--                      rarity. Rare, and a human has to look.
--   resolved           all do, and they differ. Nothing more to fetch.
--
-- Ordering answers "what should the resolver do first", which is: work that
-- changes a price somebody can actually see.
--
--   1  a real Card row prices through this printing
--   2  the expansion is mapped to a YGOPRODeck set code, so a card *could*
--      land here once its owner names a printing
--   3  everything else
--
-- SECURITY INVOKER: it reads "Card". The enrichment service runs as the service
-- role and sees every row; a signed-in caller sees what "Card"'s own policy
-- lets them see, and the ranking follows from that. Definer would turn a work
-- queue into a way to enumerate other people's collections.
CREATE OR REPLACE VIEW public.cardmarket_multi_product_printing
WITH (security_invoker = true) AS
  WITH grp AS (
    SELECT
      p.id_metacard,
      p.id_expansion,
      min(p.set_code)                                        AS set_code,
      min(p.name)                                            AS card_name,
      count(*)::int                                          AS product_count,
      count(*) FILTER (WHERE p.identity_source IS NULL)::int  AS unresolved_product_count,
      count(*) FILTER (WHERE p.identity_source IS NOT NULL)::int AS resolved_product_count,
      -- Can the resolved ones actually be told apart? Two products both read
      -- "V.1 - Common" is a page we misread, not an identity.
      count(DISTINCT p.version_no)  FILTER (WHERE p.version_no IS NOT NULL)::int AS distinct_versions,
      count(DISTINCT public.rarity_key(p.rarity))
        FILTER (WHERE p.identity_source IS NOT NULL AND p.rarity IS NOT NULL)::int AS distinct_rarities,
      array_agg(p.id_product ORDER BY p.id_product)           AS product_ids
    FROM public.cardmarket_product p
    WHERE p.id_metacard IS NOT NULL
    GROUP BY p.id_metacard, p.id_expansion
    HAVING count(*) > 1
  ),
  used AS (
    -- How many Card rows price through this printing: either pinned straight to
    -- one of its products, or matched into it by set code and name.
    SELECT g.id_metacard, g.id_expansion, count(DISTINCT c.id)::int AS card_count
    FROM grp g
    JOIN public.cardmarket_product p
      ON p.id_metacard = g.id_metacard AND p.id_expansion = g.id_expansion
    JOIN public."Card" c
      ON c.cardmarket_product_id = p.id_product
      OR (nullif(split_part(coalesce(c.extension, ''), '-', 1), '') = p.set_code
          AND lower(c.name) = lower(p.name))
    GROUP BY g.id_metacard, g.id_expansion
  )
  SELECT
    g.id_metacard,
    g.id_expansion,
    g.set_code,
    g.card_name,
    g.product_count,
    g.unresolved_product_count,
    g.product_ids,
    coalesce(u.card_count, 0)      AS card_count_using_printing,
    coalesce(u.card_count, 0) > 0  AS has_user_visible_card,
    CASE
      WHEN g.resolved_product_count = 0              THEN 'unresolved'
      WHEN g.unresolved_product_count > 0            THEN 'partially_resolved'
      WHEN greatest(g.distinct_versions, g.distinct_rarities) < g.product_count
                                                     THEN 'manual_review'
      ELSE 'resolved'
    END AS status,
    CASE
      WHEN coalesce(u.card_count, 0) > 0 THEN 1
      WHEN g.set_code IS NOT NULL        THEN 2
      ELSE 3
    END::smallint AS priority
  FROM grp g
  LEFT JOIN used u
    ON u.id_metacard = g.id_metacard AND u.id_expansion = g.id_expansion;

-- The work list: the same view, minus everything already finished.
CREATE OR REPLACE VIEW public.cardmarket_unresolved_printing
WITH (security_invoker = true) AS
  SELECT *
  FROM public.cardmarket_multi_product_printing
  WHERE status <> 'resolved';

GRANT SELECT ON public.cardmarket_multi_product_printing TO authenticated;
GRANT SELECT ON public.cardmarket_unresolved_printing    TO authenticated;
