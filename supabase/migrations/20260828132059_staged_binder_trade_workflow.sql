-- Staged binder workflow: one trader requests cards, the other chooses a
-- return, then both confirm the same immutable revision before exchange.
ALTER TABLE public."Trade"
  ADD COLUMN IF NOT EXISTS workflow_phase text,
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS user1_agreed_revision integer,
  ADD COLUMN IF NOT EXISTS user2_agreed_revision integer;

ALTER TABLE public."Trade"
  DROP CONSTRAINT IF EXISTS trade_workflow_phase_check;
ALTER TABLE public."Trade"
  ADD CONSTRAINT trade_workflow_phase_check
  CHECK (workflow_phase IS NULL OR workflow_phase IN ('selection','agreement','exchange'));

CREATE OR REPLACE FUNCTION public.create_trade_request(counterparty uuid, requested jsonb)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me uuid := auth.uid();
  new_id bigint;
  bad_id bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF counterparty IS NULL OR counterparty = me THEN RAISE EXCEPTION 'invalid counterparty'; END IF;
  IF requested IS NULL OR jsonb_typeof(requested) <> 'array' OR jsonb_array_length(requested) = 0 THEN
    RAISE EXCEPTION 'select at least one card';
  END IF;

  SELECT (item->>'card_id')::bigint INTO bad_id
  FROM jsonb_array_elements(requested) item
  WHERE NOT EXISTS (
    SELECT 1 FROM public."Card" c
    WHERE c.id = (item->>'card_id')::bigint AND c.trader = counterparty
      AND c.wish = false AND c.status NOT IN ('locked','traded')
      AND COALESCE(NULLIF(item->>'quantity','')::numeric, 1) > 0
      AND COALESCE(NULLIF(item->>'quantity','')::numeric, 1) <= c.quantity
  ) LIMIT 1;
  IF bad_id IS NOT NULL THEN RAISE EXCEPTION 'card % is not available from counterparty', bad_id; END IF;

  INSERT INTO public."Trade" (status, user1, user2, workflow_phase, revision)
  VALUES ('pending', me, counterparty, 'selection', 1) RETURNING id INTO new_id;

  INSERT INTO public.trade_card (trade, card, quantity)
  SELECT new_id, (item->>'card_id')::bigint, COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
  FROM jsonb_array_elements(requested) item;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_trade_return_selection(p_trade_id bigint, requested jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me uuid := auth.uid();
  t public."Trade"%ROWTYPE;
  bad_id bigint;
  next_revision integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO t FROM public."Trade" WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'trade not found'; END IF;
  IF t.user2 IS DISTINCT FROM me THEN RAISE EXCEPTION 'only the recipient can choose return cards'; END IF;
  IF t.status <> 'pending' OR t.workflow_phase <> 'selection' THEN RAISE EXCEPTION 'trade is not awaiting a selection'; END IF;
  IF requested IS NULL OR jsonb_typeof(requested) <> 'array' OR jsonb_array_length(requested) = 0 THEN
    RAISE EXCEPTION 'select at least one card';
  END IF;

  SELECT (item->>'card_id')::bigint INTO bad_id
  FROM jsonb_array_elements(requested) item
  WHERE NOT EXISTS (
    SELECT 1 FROM public."Card" c
    WHERE c.id = (item->>'card_id')::bigint AND c.trader = t.user1
      AND c.wish = false AND c.status NOT IN ('locked','traded')
      AND COALESCE(NULLIF(item->>'quantity','')::numeric, 1) > 0
      AND COALESCE(NULLIF(item->>'quantity','')::numeric, 1) <= c.quantity
  ) LIMIT 1;
  IF bad_id IS NOT NULL THEN RAISE EXCEPTION 'card % is not available from requester', bad_id; END IF;

  INSERT INTO public.trade_card (trade, card, quantity)
  SELECT p_trade_id, (item->>'card_id')::bigint, COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
  FROM jsonb_array_elements(requested) item;

  next_revision := t.revision + 1;
  UPDATE public."Trade" SET workflow_phase = 'agreement', revision = next_revision,
    user1_agreed_revision = NULL, user2_agreed_revision = NULL
  WHERE id = p_trade_id;
  INSERT INTO public.trade_event (trade_id,event_type,actor_id,from_status,to_status,notes)
  VALUES (p_trade_id,'updated',me,t.status,t.status,'Return cards selected');
  RETURN next_revision;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_trade_agreement(p_trade_id bigint, p_revision integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me uuid := auth.uid();
  t public."Trade"%ROWTYPE;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO t FROM public."Trade" WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND OR (t.user1 IS DISTINCT FROM me AND t.user2 IS DISTINCT FROM me) THEN
    RAISE EXCEPTION 'trade not found';
  END IF;
  IF t.status <> 'pending' OR t.workflow_phase <> 'agreement' THEN RAISE EXCEPTION 'trade is not awaiting agreement'; END IF;
  IF t.revision <> p_revision THEN RAISE EXCEPTION 'trade revision changed'; END IF;

  IF me = t.user1 THEN
    UPDATE public."Trade" SET user1_agreed_revision = p_revision WHERE id = p_trade_id;
  ELSE
    UPDATE public."Trade" SET user2_agreed_revision = p_revision WHERE id = p_trade_id;
  END IF;
  SELECT * INTO t FROM public."Trade" WHERE id = p_trade_id;
  IF t.user1_agreed_revision = t.revision AND t.user2_agreed_revision = t.revision THEN
    UPDATE public."Trade" SET status = 'accepted', workflow_phase = 'exchange' WHERE id = p_trade_id;
    RETURN jsonb_build_object('status', 'accepted', 'revision', t.revision);
  END IF;
  RETURN jsonb_build_object('status', 'confirmed', 'revision', t.revision);
END;
$function$;

CREATE OR REPLACE FUNCTION public.revise_my_trade_request(p_trade_id bigint, p_revision integer, requested jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me uuid := auth.uid();
  t public."Trade"%ROWTYPE;
  owner_id uuid;
  bad_id bigint;
  next_revision integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO t FROM public."Trade" WHERE id=p_trade_id FOR UPDATE;
  IF NOT FOUND OR (t.user1 IS DISTINCT FROM me AND t.user2 IS DISTINCT FROM me) THEN RAISE EXCEPTION 'trade not found'; END IF;
  IF t.status <> 'pending' OR t.workflow_phase <> 'agreement' THEN RAISE EXCEPTION 'trade is not being negotiated'; END IF;
  IF t.revision <> p_revision THEN RAISE EXCEPTION 'trade revision changed'; END IF;
  IF requested IS NULL OR jsonb_typeof(requested) <> 'array' OR jsonb_array_length(requested)=0 THEN
    RAISE EXCEPTION 'select at least one card';
  END IF;
  owner_id := CASE WHEN me=t.user1 THEN t.user2 ELSE t.user1 END;

  SELECT (item->>'card_id')::bigint INTO bad_id FROM jsonb_array_elements(requested) item
  WHERE NOT EXISTS (SELECT 1 FROM public."Card" c WHERE c.id=(item->>'card_id')::bigint
    AND c.trader=owner_id AND c.wish=false AND c.status <> 'traded'
    AND (c.status <> 'locked' OR EXISTS (SELECT 1 FROM public.trade_card own_tc WHERE own_tc.trade=p_trade_id AND own_tc.card=c.id))
    AND COALESCE(NULLIF(item->>'quantity','')::numeric,1)>0
    AND COALESCE(NULLIF(item->>'quantity','')::numeric,1)<=c.quantity) LIMIT 1;
  IF bad_id IS NOT NULL THEN RAISE EXCEPTION 'card % is not available', bad_id; END IF;

  DELETE FROM public.trade_card tc USING public."Card" c
  WHERE tc.trade=p_trade_id AND tc.card=c.id AND c.trader=owner_id;
  INSERT INTO public.trade_card(trade,card,quantity)
  SELECT p_trade_id,(item->>'card_id')::bigint,COALESCE(NULLIF(item->>'quantity','')::numeric,1)
  FROM jsonb_array_elements(requested) item;
  next_revision := t.revision+1;
  UPDATE public."Trade" SET revision=next_revision,user1_agreed_revision=NULL,user2_agreed_revision=NULL WHERE id=p_trade_id;
  INSERT INTO public.trade_event (trade_id,event_type,actor_id,from_status,to_status,notes)
  VALUES (p_trade_id,'updated',me,t.status,t.status,'Requested cards revised');
  RETURN next_revision;
END;
$function$;

CREATE OR REPLACE FUNCTION public.revise_trade_terms(
  p_trade_id bigint, p_revision integer, p_trade_method text,
  p_cash_amount numeric, p_cash_payer text, p_meetup_location jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE me uuid:=auth.uid(); t public."Trade"%ROWTYPE; next_revision integer;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO t FROM public."Trade" WHERE id=p_trade_id FOR UPDATE;
  IF NOT FOUND OR (t.user1 IS DISTINCT FROM me AND t.user2 IS DISTINCT FROM me) THEN RAISE EXCEPTION 'trade not found'; END IF;
  IF t.status<>'pending' OR t.workflow_phase<>'agreement' THEN RAISE EXCEPTION 'trade is not being negotiated'; END IF;
  IF t.revision<>p_revision THEN RAISE EXCEPTION 'trade revision changed'; END IF;
  IF p_trade_method IS NOT NULL AND p_trade_method NOT IN ('mail','in_person') THEN RAISE EXCEPTION 'invalid trade method'; END IF;
  IF p_cash_amount IS NOT NULL AND (p_cash_amount<=0 OR p_cash_payer NOT IN ('proposer','counterparty')) THEN RAISE EXCEPTION 'invalid cash offset'; END IF;
  next_revision:=t.revision+1;
  UPDATE public."Trade" SET trade_method=p_trade_method,cash_amount=p_cash_amount,
    cash_payer=CASE WHEN p_cash_amount IS NULL THEN NULL ELSE p_cash_payer END,
    meetup_location=CASE WHEN p_trade_method='in_person' THEN p_meetup_location ELSE NULL END,
    revision=next_revision,user1_agreed_revision=NULL,user2_agreed_revision=NULL
  WHERE id=p_trade_id;
  INSERT INTO public.trade_event (trade_id,event_type,actor_id,from_status,to_status,notes)
  VALUES (p_trade_id,'updated',me,t.status,t.status,'Trade terms revised');
  RETURN next_revision;
END;
$function$;

DROP FUNCTION IF EXISTS public.fetch_my_proposals();
CREATE FUNCTION public.fetch_my_proposals()
RETURNS TABLE(
  id bigint, status text, created_at timestamptz,
  counterparty_id uuid, counterparty_name text, counterparty_avatar_url text,
  i_am_proposer boolean, i_give jsonb, i_receive jsonb,
  trade_method text, cash_amount numeric, cash_payer text, notes text,
  meetup_location jsonb, i_confirmed boolean, they_confirmed boolean,
  decline_reason text, i_uploaded boolean, they_uploaded boolean,
  workflow_phase text, revision integer,
  i_agreed_revision integer, they_agreed_revision integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY SELECT
    t.id, t.status, t.created_at,
    CASE WHEN t.user1 = me THEN t.user2 ELSE t.user1 END,
    CASE WHEN t.user1 = me THEN tr2."Name" ELSE tr1."Name" END,
    CASE WHEN t.user1 = me THEN tr2.avatar_url ELSE tr1.avatar_url END,
    t.user1 = me,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'image_id',c.image_id,'extension',c.extension,'condition',c.condition,'language',c.language,'quantity',tc.quantity,'rarity',c.rarity)) FROM public.trade_card tc JOIN public."Card" c ON c.id=tc.card WHERE tc.trade=t.id AND c.trader=me),'[]'::jsonb),
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'image_id',c.image_id,'extension',c.extension,'condition',c.condition,'language',c.language,'quantity',tc.quantity,'rarity',c.rarity)) FROM public.trade_card tc JOIN public."Card" c ON c.id=tc.card WHERE tc.trade=t.id AND c.trader<>me),'[]'::jsonb),
    t.trade_method,t.cash_amount,t.cash_payer,t.notes,t.meetup_location,
    CASE WHEN t.user1=me THEN t.user1_confirmed ELSE t.user2_confirmed END,
    CASE WHEN t.user1=me THEN t.user2_confirmed ELSE t.user1_confirmed END,
    t.decline_reason,
    EXISTS(SELECT 1 FROM public.trade_photo p WHERE p.trade=t.id AND p.uploader=me),
    EXISTS(SELECT 1 FROM public.trade_photo p WHERE p.trade=t.id AND p.uploader<>me),
    t.workflow_phase,t.revision,
    CASE WHEN t.user1=me THEN t.user1_agreed_revision ELSE t.user2_agreed_revision END,
    CASE WHEN t.user1=me THEN t.user2_agreed_revision ELSE t.user1_agreed_revision END
  FROM public."Trade" t JOIN public."Trader" tr1 ON tr1.id=t.user1 JOIN public."Trader" tr2 ON tr2.id=t.user2
  WHERE t.user1=me OR t.user2=me ORDER BY t.created_at DESC NULLS LAST;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_trade_request(uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_trade_return_selection(bigint,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirm_trade_agreement(bigint,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revise_my_trade_request(bigint,integer,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revise_trade_terms(bigint,integer,text,numeric,text,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fetch_my_proposals() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_trade_request(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_trade_return_selection(bigint,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_trade_agreement(bigint,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revise_my_trade_request(bigint,integer,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revise_trade_terms(bigint,integer,text,numeric,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_proposals() TO authenticated;

NOTIFY pgrst, 'reload schema';
