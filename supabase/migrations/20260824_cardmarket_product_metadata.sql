-- Two fields the catalogue always carried and the import kept dropping.
--
-- products_singles_3.json states seven fields per product; we stored five. The
-- two we discarded are the ones that answer "is this row real, and how old is
-- it", which is exactly what we needed and did not have during the RA05 audit:
-- asked for a dateAdded distribution, the honest answer was that we had thrown
-- it away 86,507 times.
--
--   date_added     when Cardmarket first listed the product. Distinguishes a
--                  product that is genuinely new from one that has always been
--                  there and only looks new to us.
--   category_name  what kind of product it is. Constant "Yugioh Single" across
--                  every singles row today, which is precisely why it is worth
--                  storing: the day a non-single appears in a file we treat as
--                  singles, the column says so instead of the row passing as a
--                  card.
--
-- Taken verbatim from the file. Neither is derived, reconstructed, or defaulted
-- -- a guessed date is worse than a null one, because a null admits what it
-- does not know.
ALTER TABLE public.cardmarket_product
  ADD COLUMN IF NOT EXISTS date_added    timestamptz,
  ADD COLUMN IF NOT EXISTS category_name text;

-- "Which products appeared since we last looked" is the query this exists for,
-- and it wants a range scan rather than 86,507 rows.
CREATE INDEX IF NOT EXISTS cardmarket_product_date_added
  ON public.cardmarket_product (date_added DESC NULLS LAST);
