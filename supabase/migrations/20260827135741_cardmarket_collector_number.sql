-- Cardmarket product pages expose the printed card number separately from the
-- expansion and rarity. It is the missing discriminator when one rarity occurs
-- twice in an expansion (for example RA04 Aleister 024 and 278).
ALTER TABLE public.cardmarket_product
  ADD COLUMN IF NOT EXISTS collector_number text;

ALTER TABLE public.cardmarket_product
  DROP CONSTRAINT IF EXISTS cardmarket_product_collector_number_nonempty;
ALTER TABLE public.cardmarket_product
  ADD CONSTRAINT cardmarket_product_collector_number_nonempty
  CHECK (collector_number IS NULL OR btrim(collector_number) <> '');

COMMENT ON COLUMN public.cardmarket_product.collector_number IS
  'The Number field printed on the Cardmarket product page; used with set_code and rarity to identify duplicate-rarity printings.';

-- Verified directly from the four Cardmarket product pages on 2026-08-27.
UPDATE public.cardmarket_product
SET collector_number = CASE id_product
  WHEN 820631 THEN '024'
  WHEN 820718 THEN '024'
  WHEN 821130 THEN '278'
  WHEN 821315 THEN '278'
END
WHERE id_product IN (820631, 820718, 821130, 821315);
