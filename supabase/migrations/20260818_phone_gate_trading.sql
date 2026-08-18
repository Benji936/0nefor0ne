-- Phone verification as a gate on trading, not on signing up.
--
-- The goal is one person per account, to stop somebody spinning up throwaway
-- accounts to scam traders. Signing up stays free: browsing, building a
-- collection and being onboarded cost nothing and risk nothing, so gating them
-- would only suppress real signups. The gate goes exactly where the risk
-- starts, which is the moment two people commit to exchanging cards.
--
-- WHY A TRIGGER RATHER THAN A CHECK INSIDE THE RPCs
--
-- create_trade_proposal and update_trade_proposal each have TWO overloads (a
-- 3-argument original and an 8-argument one), and every one of them is
-- SECURITY DEFINER. Gating "the" function would have left the other overload
-- callable directly with the public anon key, which is precisely the API a
-- person motivated enough to farm accounts would reach for. A trigger on the
-- table catches every path into it, including ones added later.
--
-- It also avoids rewriting those bodies. They exist only in the live database,
-- not in any migration file, so CREATE OR REPLACE means reconstructing a body
-- from a read and hoping nothing was missed. A trade-completion bug earlier
-- this month came from exactly that.
--
-- SHIPS INERT ON PURPOSE
--
-- phone_gate_enabled defaults to false. Enabling the gate before an SMS
-- provider is configured in Supabase Auth would stop all trading with no way
-- for anybody to satisfy it: nobody could verify, so nobody could trade, and
-- the fix would need another deploy. Configure Twilio (or MessageBird/Vonage)
-- first, verify one number end to end, then flip the flag:
--
--   update public.app_setting set value = 'true'::jsonb
--    where key = 'phone_gate_enabled';
--
-- Turning it back off is the same statement with 'false'. No deploy either way.

-- ── Settings ──────────────────────────────────────────────────────────────
create table if not exists public.app_setting (
  key        text primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_setting is
  'Operational flags that must be flippable without a deploy. Written by the service role only.';

insert into public.app_setting (key, value)
values ('phone_gate_enabled', 'false'::jsonb)
on conflict (key) do nothing;

alter table public.app_setting enable row level security;

-- Readable by signed-in users so the app can tell whether to ask for a number
-- at all; a client that lies about it only lies to itself, because the trigger
-- below is what actually decides. Nobody but the service role may write.
drop policy if exists app_setting_read on public.app_setting;
create policy app_setting_read on public.app_setting
  for select to authenticated using (true);

-- ── Is this account verified? ─────────────────────────────────────────────
-- SECURITY DEFINER because auth.users is not readable by `authenticated`.
-- Returns a bare boolean and nothing else, so it cannot be used to enumerate
-- anybody's number.
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
       and u.phone_confirmed_at is not null
  );
$$;

comment on function public.is_phone_verified(uuid) is
  'True when the account has an SMS-confirmed phone number. auth.users.phone carries a unique index, so a confirmed number belongs to exactly one account.';

grant execute on function public.is_phone_verified(uuid) to authenticated;

create or replace function public.phone_gate_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select value = 'true'::jsonb from public.app_setting where key = 'phone_gate_enabled'),
    false
  );
$$;

grant execute on function public.phone_gate_enabled() to authenticated;

-- ── The gate ──────────────────────────────────────────────────────────────
-- Raises on the acting user, auth.uid(), rather than on a column of the row.
-- The person who has to be verified is the one taking the action, and on
-- accept that is user2, not the user1 who created the row.
create or replace function public.require_phone_verified_to_trade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Inert until switched on. Checked first so the common path is one cheap
  -- read, and so turning the gate off is immediate.
  if not public.phone_gate_enabled() then
    return new;
  end if;

  -- No JWT means this is the service role, a migration, or the SQL editor.
  -- Those are trusted and must not be locked out of their own data.
  if auth.uid() is null then
    return new;
  end if;

  if not public.is_phone_verified(auth.uid()) then
    -- The frontend matches on this SQLSTATE to open the verify dialog, so the
    -- code is part of the contract. Do not change it without changing
    -- frontend/src/lib/phoneVerify.js.
    raise exception 'phone verification required to trade'
      using errcode = 'P0002';
  end if;

  return new;
end;
$$;

comment on function public.require_phone_verified_to_trade() is
  'Blocks proposing or accepting a trade from an account with no confirmed phone. Raises SQLSTATE P0002, which the client maps to the verify-phone dialog.';

drop trigger if exists trade_requires_phone_on_insert on public."Trade";
create trigger trade_requires_phone_on_insert
  before insert on public."Trade"
  for each row execute function public.require_phone_verified_to_trade();

-- Accepting is the mirror of proposing: both parties are exposed the moment a
-- trade goes live, so both sides have to be verified. Cancel, decline and
-- complete are deliberately NOT gated. Those are how somebody gets OUT of a
-- trade, and a person who cannot leave a trade is worse off than one who could
-- never enter it.
drop trigger if exists trade_requires_phone_on_accept on public."Trade";
create trigger trade_requires_phone_on_accept
  before update on public."Trade"
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function public.require_phone_verified_to_trade();
