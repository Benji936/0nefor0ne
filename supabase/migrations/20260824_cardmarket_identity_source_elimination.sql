-- Two more ways an identity can be established, and why they stay distinguishable.
--
-- Until now every identity came from one place: a product page that stated the
-- product's own version and rarity, recorded as 'cardmarket_page'. Reading
-- expansion listing pages instead adds two, and they are not the same claim.
--
--   cardmarket_expansion_page
--     The listing row named itself. Its image path carries the idProduct and
--     its alt carries the version and rarity:
--       alt="Pumpking ... (V.1 - Secret Rare)"  .../MZMU/873125/873125.jpg
--     Cardmarket stated this identity for this id. Same standing as a product
--     page, one navigation cheaper.
--
--   cardmarket_expansion_elimination
--     Cardmarket has no artwork for the product, so its row carries the shared
--     no-artwork image and no id. The identity is not read off the row -- it is
--     what remains after every other product in the printing has been matched
--     to every other row. Correct only because both sets were complete and one
--     of each was left.
--
-- The second is sound but conditional: it depends on the page having been the
-- whole printing at the moment it was read. If Cardmarket later adds a product
-- to that printing, the elimination that produced this row was taken against a
-- set that is no longer complete, and every row written this way needs
-- rechecking while the directly-read ones do not. Folding both into one label
-- would make that audit impossible to run, which is the entire reason for
-- keeping them apart.
--
-- No data is rewritten. The 55 existing 'cardmarket_page' rows were read off
-- product pages and that is still what they say.
ALTER TABLE public.cardmarket_product
  DROP CONSTRAINT IF EXISTS cardmarket_product_identity_check;

ALTER TABLE public.cardmarket_product
  ADD CONSTRAINT cardmarket_product_identity_check CHECK (
    identity_source IS NULL
      AND version_no IS NULL AND version_label IS NULL AND identity_at IS NULL
    OR
    identity_source IN (
      'cardmarket_page',
      'cardmarket_expansion_page',
      'cardmarket_expansion_elimination',
      'manual'
    )
      AND identity_at IS NOT NULL
      AND (version_no IS NOT NULL OR version_label IS NOT NULL)
  );

-- Finding the eliminated rows again is the whole point of separating them, so
-- make that lookup cheap rather than a scan of 86,507 products.
CREATE INDEX IF NOT EXISTS cardmarket_product_identity_source
  ON public.cardmarket_product (identity_source)
  WHERE identity_source IS NOT NULL;
