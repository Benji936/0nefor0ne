CREATE OR REPLACE FUNCTION public.act_as(p_uid uuid, p_role text DEFAULT 'authenticated')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', coalesce(p_uid::text, ''), 'role', p_role)::text, false);
  EXECUTE format('SET ROLE %I', p_role);
END;
$$;
CREATE OR REPLACE FUNCTION public.as_postgres() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', false);
END;
$$;
-- Assertion helper: raises with a readable message, or prints a tick.
CREATE OR REPLACE FUNCTION public.ok(p_cond boolean, p_label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_cond THEN RAISE NOTICE '  ok  %', p_label;
  ELSE RAISE EXCEPTION 'FAILED: %', p_label; END IF;
END;
$$;

-- Scratch space for ids a later test needs. Not part of the schema under test:
-- psql will not interpolate a :variable inside a dollar-quoted DO block, and an
-- identity id cannot be hardcoded because the sequence advances even on an
-- insert that RLS refuses.
CREATE TABLE IF NOT EXISTS public._t (k text PRIMARY KEY, v bigint);
GRANT ALL ON public._t TO anon, authenticated, service_role;
