-- v2-premium Discord bot: community branding link.
--
-- A premium guild (one with an active Guild Subscription entitlement for the
-- DISCORD_PREMIUM_SKU_ID) gets its community name, icon and this link stamped
-- onto every announce it posts. The bot writes community_url only for premium
-- guilds; it stays null for free guilds and for announces created on the site.
--
-- Sibling columns discord_guild_name / discord_guild_icon already existed (the
-- v1 bot wrote them); community_url is new in v2.

ALTER TABLE announce ADD COLUMN IF NOT EXISTS community_url text;

-- Applied to production (project sxteuctysfiwripnaozi) on 2026-07-23.
NOTIFY pgrst, 'reload schema';
