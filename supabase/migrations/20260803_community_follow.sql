-- Community follows: a user can follow a community to keep up with its events.
--
-- Three moving parts:
--   1. community_follow — the join table (one row per user/community pair).
--   2. community.follower_count — denormalised counter kept by trigger, so the
--      directory grid can show counts without N count() round-trips.
--   3. a fan-out trigger that drops a notification on every follower when the
--      owner publishes a new event.
--
-- follower is FK'd to auth.users because notification.user_id is too: a follow
-- row left behind by a deleted user would otherwise make the fan-out below
-- raise 23503 and abort the owner's event insert.

-- ── 1. Join table ───────────────────────────────────────────────────────────
create table if not exists community_follow (
  community  bigint      not null references community(id) on delete cascade,
  follower   uuid        not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community, follower)
);

-- "Who follows me" (owner) and "what do I follow" (account page) are both hot
-- lookups; the PK already covers (community, follower), so only the reverse
-- direction needs its own index.
create index if not exists community_follow_follower_idx
  on community_follow (follower, created_at desc);

alter table community_follow enable row level security;

-- A follower sees their own rows; a community owner sees their followers.
drop policy if exists community_follow_select on community_follow;
create policy community_follow_select on community_follow
  for select using (
    follower = auth.uid()
    or exists (
      select 1 from community c
       where c.id = community_follow.community
         and c.owner = auth.uid()
    )
  );

-- You may only follow as yourself, and only a published community.
drop policy if exists community_follow_insert on community_follow;
create policy community_follow_insert on community_follow
  for insert with check (
    follower = auth.uid()
    and exists (
      select 1 from community c
       where c.id = community_follow.community
         and c.status = 'published'
    )
  );

-- Unfollow is always your own row.
drop policy if exists community_follow_delete on community_follow;
create policy community_follow_delete on community_follow
  for delete using (follower = auth.uid());

-- ── 2. Denormalised counter ─────────────────────────────────────────────────
alter table community add column if not exists follower_count integer not null default 0;

-- SECURITY DEFINER: the follower does not own the community row they are
-- incrementing, so the update has to bypass community's owner-only RLS.
create or replace function community_follow_recount() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update community set follower_count = follower_count + 1 where id = new.community;
  elsif tg_op = 'DELETE' then
    update community set follower_count = greatest(follower_count - 1, 0) where id = old.community;
  end if;
  return null;
end $$;

drop trigger if exists trg_community_follow_recount on community_follow;
create trigger trg_community_follow_recount
  after insert or delete on community_follow
  for each row execute function community_follow_recount();

-- Backfill so the counter matches any rows that already exist.
update community c
   set follower_count = coalesce((
     select count(*) from community_follow f where f.community = c.id
   ), 0);

-- ── 3. Event fan-out ────────────────────────────────────────────────────────
-- notification is trade-shaped today; widen it just enough to address a
-- community event. counterparty_name carries the community's display name,
-- which is what the bell renders as the actor.
alter type notification_kind add value if not exists 'community_event';

alter table notification add column if not exists community_id bigint;
alter table notification add column if not exists event_id bigint;

-- SECURITY DEFINER again: notification's RLS is user_id = auth.uid(), so the
-- event's owner cannot insert rows addressed to their followers.
create or replace function community_event_notify_followers() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  cname text;
begin
  -- Only announce events that are actually visible and still ahead.
  if new.status <> 'published' or new.starts_at < now() then
    return null;
  end if;

  select name into cname from community where id = new.community;

  insert into notification (user_id, kind, counterparty_name, community_id, event_id)
  select f.follower, 'community_event', cname, new.community, new.id
    from community_follow f
   where f.community = new.community;

  return null;
end $$;

drop trigger if exists trg_community_event_notify on community_event;
create trigger trg_community_event_notify
  after insert on community_event
  for each row execute function community_event_notify_followers();
