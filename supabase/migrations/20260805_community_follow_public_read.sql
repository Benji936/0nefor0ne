-- Make community follows publicly readable.
--
-- Until now community_follow_select returned a row only to the follower
-- themselves or to the owner of the community being followed. That is why a
-- trader's profile could not list the communities they belong to: a third
-- party, signed in or not, saw zero rows.
--
-- PRIVACY NOTE. This is a widening, and it applies to rows that already exist.
-- Every user who has followed a community did so while that fact was visible
-- only to themselves and the community owner; after this migration it is
-- readable by anyone. No consent was collected for that change. It was an
-- explicit product decision (see the trader profile redesign brief), taken
-- when the table held a single row, but the default it sets applies to
-- everyone who follows anything from here on. If that trade-off ever stops
-- looking right, the replacement is an opt-in `follows_public` flag on
-- Trader, defaulting to false, with this policy narrowed to honour it.
--
-- Only SELECT widens. Insert stays "as yourself, published communities only"
-- and delete stays "your own row", both untouched below.

drop policy if exists community_follow_select on community_follow;

create policy community_follow_select on community_follow
  for select using (true);

-- Reads now hit the table from profile pages for arbitrary followers, not just
-- "my follows" and "my community's followers". The existing PK covers
-- (community, follower) and community_follow_follower_idx covers
-- (follower, created_at desc), which is the access path a profile uses, so no
-- new index is needed.

notify pgrst, 'reload schema';
