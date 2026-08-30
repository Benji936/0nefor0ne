-- Test accounts still need to exercise the complete trade workflow without
-- owning a real phone number. The bypass lives in raw_app_meta_data because
-- only an administrator can change it; user-editable metadata must never grant
-- trade access.
create or replace function public.is_phone_verified(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
     where u.id = p_user
       and (
         u.phone_confirmed_at is not null
         or coalesce(u.raw_app_meta_data ->> 'trade_phone_bypass', 'false') = 'true'
       )
  );
$$;

comment on function public.is_phone_verified(uuid) is
  'True when the account has an SMS-confirmed phone number or an administrator-controlled test-account trade bypass.';

revoke all on function public.is_phone_verified(uuid) from public, anon;
grant execute on function public.is_phone_verified(uuid) to authenticated;

notify pgrst, 'reload schema';
