-- Minimal reproduction of the parts of a Supabase database the tournament
-- migration depends on: the three client roles, the auth schema, auth.uid()
-- reading request.jwt.claims, and Supabase's default privilege grants (which
-- are what make the explicit REVOKE FROM anon, authenticated necessary).
DROP ROLE IF EXISTS anon; CREATE ROLE anon NOLOGIN NOINHERIT;
DROP ROLE IF EXISTS authenticated; CREATE ROLE authenticated NOLOGIN NOINHERIT;
DROP ROLE IF EXISTS service_role; CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
GRANT anon, authenticated, service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE auth.users (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- The two production tables the tournament schema references.
CREATE TABLE public."Trader" (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  "Name"     text,
  discord_id text UNIQUE,
  avatar_url text
);

CREATE TABLE public.community (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind      text NOT NULL DEFAULT 'store',
  name      text NOT NULL,
  slug      text NOT NULL UNIQUE,
  status    text NOT NULL DEFAULT 'published',
  verified  boolean NOT NULL DEFAULT false
);
ALTER TABLE public.community ENABLE ROW LEVEL SECURITY;
CREATE POLICY community_select_public ON public.community FOR SELECT
  USING (status = 'published' OR owner = auth.uid());

-- The guild link the bot resolves through. Real shape: unique per
-- (community, claimer), which is why every consumer joins on claimer = owner.
CREATE TABLE public.community_claim (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community         bigint NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  claimer           uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discord_guild_id  text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community, claimer)
);
ALTER TABLE public.community_claim ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.community_event (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community bigint NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  title     text NOT NULL,
  starts_at timestamptz NOT NULL,
  status    text NOT NULL DEFAULT 'published'
);

-- Impersonation helper, test-harness only: what PostgREST does per request.
CREATE OR REPLACE FUNCTION public.act_as(p_uid uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', coalesce(p_uid::text, ''), 'role', p_role)::text, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END;
$$;
