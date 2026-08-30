-- Cardmarket prices: what a printing is worth, not what a card is called.
--
-- The app has priced cards since it shipped, from one field on the YGOPRODeck
-- payload: card_prices[0].cardmarket_price. That is a single number per card
-- *name*, so a Common and a Quarter Century Secret Rare of the same card are
-- quoted the same price. For a trading app that is not a rounding error — it is
-- the difference between a 40 cent card and a 300 euro one, offered as equal.
--
-- Cardmarket publishes a price guide and a product catalogue as public files,
-- rebuilt daily, no key and no rate limit:
--
--   downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_3.json
--   downloads.s3.cardmarket.com/productCatalog/productList/products_singles_3.json
--
-- Game 3 is Yu-Gi-Oh. Between them: 86,507 single printings across 1,175
-- expansions, and a price row for 86,494 of them.
--
-- Two tables because they have two lifetimes. `cardmarket_product` is a map —
-- it changes when Cardmarket adds a set, a few times a year — and half of it
-- (set_code, rarity) is not Cardmarket's data at all but our resolver's
-- inference, joined out of YGOPRODeck. `cardmarket_price` is a feed, replaced
-- every morning. Keeping them apart means the daily job rewrites 86k numbers
-- and no strings, and means there is one table you can look at to ask "what did
-- we infer" separately from "what were we told".
--
-- Both are public reference data. Card already carries a SELECT policy of
-- true, and the card page is built for people arriving from a search engine
-- with no session, so a price that only signed-in users can see would be a
-- price most visitors never see.

-- ── The map ────────────────────────────────────────────────────────────────
CREATE TABLE public.cardmarket_product (
  id_product   bigint PRIMARY KEY,
  name         text   NOT NULL,
  id_expansion integer NOT NULL,

  -- Ours, not Cardmarket's. Cardmarket identifies a printing by an opaque
  -- expansion id and no rarity at all; the app identifies one by a set code
  -- (POTE-EN012 -> POTE) and a rarity, which is what its own Card rows carry.
  -- Both are resolved at import by joining Cardmarket's expansion names to
  -- YGOPRODeck's set list. NULL means the resolver could not place it, which
  -- is a fact worth storing rather than a guess worth making.
  set_code     text,
  rarity       text
);

-- Rung 1 of the resolution ladder: a Card row that knows its printing.
-- Deliberately not UNIQUE — Cardmarket really does carry several products for
-- one card in one expansion (11,708 such groups), and a constraint claiming
-- otherwise would reject the import rather than reveal the ambiguity.
CREATE INDEX cardmarket_product_printing
  ON public.cardmarket_product (set_code, lower(name), rarity)
  WHERE set_code IS NOT NULL;

-- Rung 3: a Card row that knows only a name, which is 78% of them today.
CREATE INDEX cardmarket_product_name ON public.cardmarket_product (lower(name));

-- ── The feed ───────────────────────────────────────────────────────────────
CREATE TABLE public.cardmarket_price (
  id_product bigint PRIMARY KEY
             REFERENCES public.cardmarket_product(id_product) ON DELETE CASCADE,

  -- trend is what the app shows. The others are kept because trend is null on
  -- 12% of products and a fallback that has to re-download the file is not a
  -- fallback. Ordered by preference at read time: trend, avg7, avg30, low.
  --
  -- low is stored but never shown on its own: across 76,843 products its median
  -- is 0.27 of trend, because the cheapest copy on the market is usually a
  -- played one in a language you did not ask for. As a headline number it would
  -- understate every collection in the app by roughly four times.
  trend  numeric(10,2),
  low    numeric(10,2),
  avg7   numeric(10,2),
  avg30  numeric(10,2),

  -- The file's own createdAt, not now(). If an import is skipped or a run fails
  -- its sanity gate, this is how the UI can tell it is quoting stale prices
  -- instead of quietly presenting week-old numbers as today's.
  as_of  date NOT NULL
);

ALTER TABLE public.cardmarket_product ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardmarket_price   ENABLE ROW LEVEL SECURITY;

CREATE POLICY cardmarket_product_read ON public.cardmarket_product FOR SELECT USING (true);
CREATE POLICY cardmarket_price_read   ON public.cardmarket_price   FOR SELECT USING (true);

-- Writes are the importer's alone, and it runs with the service role, which
-- bypasses RLS. No INSERT/UPDATE policy is defined, so nothing else can write.

GRANT SELECT ON public.cardmarket_product TO anon, authenticated;
GRANT SELECT ON public.cardmarket_price   TO anon, authenticated;
