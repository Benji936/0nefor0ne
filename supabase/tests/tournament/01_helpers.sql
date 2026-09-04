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
