-- The address a store page never had.
--
-- Every seeded row carries an ots_store_id, and the file it was seeded from
-- (frontend/public/data/stores.json) holds a street address for 4,524 of 4,525
-- stores and a phone number for 3,370 of them. The seeder dropped all of it
-- because there was nowhere to put it, so 4,450 store pages have been telling
-- readers the town and pointing at a map raster -- while the page's own meta
-- description promised "{name}: address, Discord and listings".
--
-- Four nullable columns. The e-mail in the same file is deliberately not one of
-- them: 3,348 store addresses printed on public pages is a scraping surface,
-- and an owner who wants to be e-mailed can add an email link to the profile
-- themselves.
alter table public.community
  add column if not exists address     text,
  add column if not exists postal_code text,
  add column if not exists state       text,
  add column if not exists phone       text;

comment on column public.community.address     is 'Street line, as published in the OTS directory or entered by the owner.';
comment on column public.community.postal_code is 'Postal / ZIP code.';
comment on column public.community.state       is 'State or province, where the country uses one.';
comment on column public.community.phone       is 'Public shop telephone, as published. Never a personal number.';
