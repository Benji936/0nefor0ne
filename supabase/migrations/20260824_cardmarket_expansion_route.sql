-- Where an expansion lives on cardmarket.com.
--
-- Enrichment reads identity off expansion listing pages -- ~30 products per
-- page instead of one per navigation -- but to open a listing you need its URL,
-- and we store expansion *ids*, not slugs.
--
-- Why this is its own table
-- -------------------------
-- It is not the existing YGOPRODeck mapping and must not be confused with it:
--
--   cardmarket_expansion_route   Cardmarket id_expansion -> Cardmarket website
--   the expansion/set-code map   Cardmarket expansion <-> YGOPRODeck set
--
-- Those two disagree in 12 of 587 cases, and every disagreement is real rather
-- than a bug. Cardmarket calls one product "SD44 Structure Deck: Legend of the
-- Crystals" where YGOPRODeck calls it SDCB; "BE2 Beginner's Edition 2" is what
-- YGOPRODeck files as DB2 Dark Beginning 2. Same cards, different regional
-- release, two naming systems. Folding them into one column would force a
-- choice that neither system is wrong about.
--
-- How a route is established
-- --------------------------
-- Not by name, and not by slugifying one. Cardmarket does not publish
-- idExpansion anywhere on /en/YuGiOh/Expansions -- checked, zero
-- data-id-expansion attributes across all 1,259 rows -- but every populated row
-- carries a sample product image, and that image path contains a real
-- idProduct:
--
--   .../5/MZMU/873126/873126.jpg  ->  id_product 873126  ->  id_expansion 6433
--
-- One lookup against a table we already have, no string matching at all. On the
-- full index that bridge resolved 1,171 of 1,171 rows, with zero sample ids
-- unknown locally. It also reaches 584 expansions that have no YGOPRADeck set
-- code and never could have been matched by one.
--
-- The slug is taken from the row's own data-url. "Maze of Muertos" happens to
-- slugify to "Maze-of-Muertos", but Cardmarket's own slugs drop apostrophes,
-- collapse punctuation and sometimes omit words entirely -- "Genesys Pack 2026
-- Vol. 1" is "Genesys-Pack-Vol-1" -- so generating one is guessing when the
-- page states it.
CREATE TABLE IF NOT EXISTS public.cardmarket_expansion_route (
  id_expansion          bigint PRIMARY KEY,

  -- Cardmarket's own code and name, kept as diagnostics. Never used to resolve
  -- a route: the product bridge already did that, and a code that disagrees
  -- with our set_code is information, not a conflict to arbitrate.
  cardmarket_set_code   text,
  cardmarket_name       text,

  slug                  text NOT NULL,
  expansion_url         text NOT NULL,
  singles_url           text NOT NULL,

  -- The product that proved this route. Kept so the mapping can be re-verified
  -- later without re-reading the page: it either still resolves to this
  -- expansion or the route is stale.
  sample_id_product     bigint REFERENCES public.cardmarket_product(id_product),

  -- What Cardmarket says the expansion holds. The enrichment coverage gate
  -- compares this against what the pages actually yield, so a listing that
  -- silently paginates short is caught rather than persisted.
  advertised_card_count integer,

  mapping_source        text NOT NULL
    CHECK (mapping_source IN ('expansion_index_sample_product', 'existing_exact_set_code', 'manual')),
  mapping_confidence    numeric NOT NULL CHECK (mapping_confidence > 0 AND mapping_confidence <= 1),

  observed_at           timestamptz NOT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- One slug per expansion is the invariant that matters; the reverse is not
-- guaranteed and must be detected rather than assumed. Cardmarket lists both
-- "Duelist League Series 6" and "Duelist League Promos Upperdeck" with the same
-- sample product, so both resolve to id_expansion 4451. A unique index on slug
-- would reject the second row silently at import time; instead the loader
-- refuses to write either and the pair is reported.
CREATE UNIQUE INDEX IF NOT EXISTS cardmarket_expansion_route_slug
  ON public.cardmarket_expansion_route (slug);

CREATE INDEX IF NOT EXISTS cardmarket_expansion_route_set_code
  ON public.cardmarket_expansion_route (cardmarket_set_code)
  WHERE cardmarket_set_code IS NOT NULL;

ALTER TABLE public.cardmarket_expansion_route ENABLE ROW LEVEL SECURITY;

CREATE POLICY cardmarket_expansion_route_read
  ON public.cardmarket_expansion_route FOR SELECT USING (true);

GRANT SELECT ON public.cardmarket_expansion_route TO anon, authenticated;
