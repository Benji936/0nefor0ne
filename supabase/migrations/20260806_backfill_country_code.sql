-- Populate community.country_code from the country name.
--
-- country_code was NULL on all 4450 rows while country was populated on 4421 of
-- them. Both communityPricing (client) and currencyFor (claim-create-checkout)
-- key on country_code and fall back to USD when it is missing, so every paid
-- claim was being billed in dollars: 205 French stores, 199 German, 303 Italian,
-- 241 British. This is the currency fix, not a cosmetic one.
--
-- Only fills rows that have no code yet, so anything set by the create form or
-- by hand wins over this map.
--
-- The 29 rows with no country at all keep NULL and keep the USD fallback. There
-- is nothing to infer from.

UPDATE community SET country_code = m.code
FROM (VALUES
  ('United States', 'US'), ('Japan', 'JP'), ('Italy', 'IT'),
  ('United Kingdom', 'GB'), ('France', 'FR'), ('Germany', 'DE'),
  ('Canada', 'CA'), ('Spain', 'ES'), ('Taiwan', 'TW'), ('Greece', 'GR'),
  ('Republic of Indonesia', 'ID'), ('Hong Kong', 'HK'), ('Belgium', 'BE'),
  ('Malaysia', 'MY'), ('Switzerland', 'CH'), ('Netherlands', 'NL'),
  ('Portugal', 'PT'), ('Singapore', 'SG'), ('Austria', 'AT'),
  ('Ireland', 'IE'), ('Philippines', 'PH'), ('Croatia', 'HR'),
  ('Bulgaria', 'BG'), ('Poland', 'PL'), ('Denmark', 'DK'),
  ('Slovenia', 'SI'), ('Hungary', 'HU'), ('Finland', 'FI'),
  ('Romania', 'RO'), ('Serbia', 'RS'), ('Thailand', 'TH'),
  ('Bosnia and Herzegovina', 'BA'), ('Sweden', 'SE'), ('Luxembourg', 'LU'),
  ('Albania', 'AL'), ('Norway', 'NO'), ('Czech Republic', 'CZ'),
  ('Turkey', 'TR'), ('Cyprus', 'CY'), ('Estonia', 'EE'),
  ('Lithuania', 'LT'), ('North Macedonia', 'MK'), ('Slovakia', 'SK'),
  ('Malta', 'MT')
) AS m(name, code)
WHERE community.country = m.name
  AND (community.country_code IS NULL OR community.country_code = '');
