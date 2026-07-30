-- Arbitrary, platform-tagged links for a community profile.
-- Shape: [{ "platform": "instagram", "url": "https://..." }, { "platform": "other", "url": "https://...", "label": "Whatnot" }]
-- This supersedes the single website/discord_url fields on the profile surface.
-- Those columns are kept for backward compatibility and are backfilled into the
-- new list below, in a stable order.
alter table community
  add column if not exists links jsonb not null default '[]'::jsonb;

-- Backfill existing website + discord_url into the new list (website first),
-- only for rows that have no links yet.
update community
set links = (
  case when coalesce(website, '') <> ''
    then jsonb_build_array(jsonb_build_object('platform', 'website', 'url', website))
    else '[]'::jsonb end
  ||
  case when coalesce(discord_url, '') <> ''
    then jsonb_build_array(jsonb_build_object('platform', 'discord', 'url', discord_url))
    else '[]'::jsonb end
)
where links = '[]'::jsonb
  and (coalesce(website, '') <> '' or coalesce(discord_url, '') <> '');
