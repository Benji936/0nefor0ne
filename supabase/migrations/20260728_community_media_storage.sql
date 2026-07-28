-- community-media: avatars + banners for claimed community profiles.
-- Public read (images render on public profiles); writes are owner-scoped by the
-- first path segment being the community id and the caller owning that community.
insert into storage.buckets (id, name, public)
values ('community-media', 'community-media', true)
on conflict (id) do nothing;

drop policy if exists "community_media_public_read" on storage.objects;
create policy "community_media_public_read" on storage.objects
  for select using (bucket_id = 'community-media');

drop policy if exists "community_media_owner_insert" on storage.objects;
create policy "community_media_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in (select id::text from community where owner = auth.uid())
  );

drop policy if exists "community_media_owner_update" on storage.objects;
create policy "community_media_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in (select id::text from community where owner = auth.uid())
  );

drop policy if exists "community_media_owner_delete" on storage.objects;
create policy "community_media_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in (select id::text from community where owner = auth.uid())
  );
