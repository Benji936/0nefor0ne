-- Make the Cardmarket product id the thing a price hangs off.
--
-- Today a price is looked up by (set code, card name), and that pair is not a
-- printing. Cardmarket files seven products for Purrely in RA02 -- Super
-- through Ultimate -- and the app quotes all seven as one band. Live in the
-- collection right now:
--
--   Dark Magician, the Pharaoh's Servant  MAMO-EN001  Ultra Rare         1.44 - 5999.99
--   Dark Magician, the Pharaoh's Servant  MAMO-EN001  Grand Master Rare  1.44 - 5999.99
--
-- The app knows the rarities differ and prices them identically. 50 of 323
-- cards (15%) resolve to a single figure; the rest are a band.
--
-- Worse, the current design cannot fix that by itself. cardmarket_product.rarity
-- is computed as rarities.get(name + " " + set_code) -- a function of the exact
-- key that defines an ambiguous group -- so it holds the same value on every
-- product in the group and can never break a tie. Measured: of 5,763
-- multi-product printing groups, joining on rarity resolves zero.
--
-- What the catalogue actually gives us
-- ------------------------------------
-- Not a rarity, and not the "(V.5 - Quarter Century Secret Rare)" the website
-- shows: 0 of 86,507 product names contain "(V.", and the singles record has
-- exactly seven fields -- idProduct, name, idCategory, categoryName,
-- idExpansion, idMetacard, dateAdded. No other file exists; every other path
-- under productCatalog/ answers 403.
--
-- What it does give us is idMetacard, which groups every product that is the
-- same card. It was in the file all along and the importer was not reading it.
--
--   (id_expansion, id_metacard) = one printing
--
-- 55,121 of 66,829 such groups hold exactly one product, so they resolve to a
-- single price outright. The remaining 11,708 hold several, and nothing in the
-- catalogue says which is which -- so they resolve to a band until the owner
-- points at the one they hold, which is what cardmarket_product_id is for.
--
-- Deliberately absent: any column recording which *version* a product is. That
-- could only be derived from id_product ordering, and an ordering is not
-- metadata. See frontend/scripts/cardmarket-rarity.mjs for the full argument.
--
-- Two columns, one foreign key, no new tables.

-- ── Comparing rarities written by different hands ──────────────────────────
-- Card.rarity is typed by people and bulk-add; YGOPRODeck writes "PLatinum
-- Secret Rare" on 80 of its 81 RA05 rows and "Collector's Rare" where the app
-- may hold "Collectors Rare". Stripping to alphanumerics folds exactly those
-- differences and no others -- "Secret Rare", "Prismatic Secret Rare" and
-- "Extra Secret Rare" stay three distinct keys, because they are three distinct
-- products at three distinct prices.
--
-- Same rule as rarityKey() in frontend/scripts/cardmarket-rarity.mjs. If one
-- moves the other has to.
CREATE OR REPLACE FUNCTION public.rarity_key(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT nullif(regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]', '', 'g'), '')
$function$;

-- ── The map gains an identity ──────────────────────────────────────────────
ALTER TABLE public.cardmarket_product
  -- Cardmarket's own card id, straight from the file. Stable across expansions,
  -- and it survives Cardmarket correcting its own spelling: 61 metacards carry
  -- two names, so "Fairy Tale Tails" and "Fairy Tail Tales" are one card filed
  -- twice. Grouping by name prices it as two.
  ADD COLUMN IF NOT EXISTS id_metacard bigint,

  -- How the rarity on this row was arrived at, so the audit can tell a rarity
  -- that was established from one that is merely absent:
  --   'unique'  YGOPRODeck lists exactly one rarity for this card in this set,
  --             so every product in the printing is that rarity. A statement
  --             about the card, needing no ordering and no per-product claim.
  --   null      the card has several rarities here and the catalogue does not
  --             say which product is which. The app asks rather than guesses.
  ADD COLUMN IF NOT EXISTS rarity_source text
    CHECK (rarity_source IN ('unique'));

-- The printing: every product Cardmarket files for one card in one set. This is
-- the picker's query and the unit the pricing function groups on.
CREATE INDEX IF NOT EXISTS cardmarket_product_printing_id
  ON public.cardmarket_product (id_expansion, id_metacard);

-- ── The feed gains the two columns we were dropping ────────────────────────
-- Both are in price_guide_3.json and neither was being read. avg1 is yesterday,
-- which is the honest answer to "has this moved"; avg is the all-time mean.
-- Stored, not shown: trend remains the headline. The foil columns are left
-- alone -- avg-foil and low-foil are null on every Yu-Gi-Oh row.
ALTER TABLE public.cardmarket_price
  ADD COLUMN IF NOT EXISTS avg  numeric(10,2),
  ADD COLUMN IF NOT EXISTS avg1 numeric(10,2);

-- ── A card can name its own printing ───────────────────────────────────────
-- The point of the whole change. When this is set the price is that product's
-- price and nothing is inferred: no set code, no name match, no rarity, no
-- band. It is written by the printing picker, which is to say by the one party
-- who actually knows which copy is in the sleeve.
--
-- ON DELETE SET NULL rather than CASCADE: if Cardmarket ever retires a product
-- the card is still in someone's binder, and deleting their row over a
-- catalogue change would be absurd. It falls back to the name-level band.
ALTER TABLE public."Card"
  ADD COLUMN IF NOT EXISTS cardmarket_product_id bigint
    REFERENCES public.cardmarket_product(id_product) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS card_cardmarket_product
  ON public."Card" (cardmarket_product_id)
  WHERE cardmarket_product_id IS NOT NULL;

GRANT EXECUTE ON FUNCTION public.rarity_key(text) TO anon, authenticated;
