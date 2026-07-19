-- Add a structured meetup location to trades and thread it through the proposal RPCs.
-- meetup_location jsonb shape:
--   { source:'store'|'event', ref_id, name, address, city, state, country, lat, lng, event_date, url }

ALTER TABLE public."Trade"
  ADD COLUMN IF NOT EXISTS meetup_location jsonb;

-- Drop the exact existing overloads we are replacing (avoids PostgREST overload ambiguity).
DROP FUNCTION IF EXISTS public.create_trade_proposal(uuid, jsonb, jsonb, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.update_trade_proposal(bigint, jsonb, jsonb, text, numeric, text, text);
DROP FUNCTION IF EXISTS public.counter_trade_proposal(bigint, jsonb, jsonb, text, numeric, text);
DROP FUNCTION IF EXISTS public.fetch_my_proposals();

-- ── create_trade_proposal ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_trade_proposal(
  counterparty uuid,
  give jsonb DEFAULT '[]'::jsonb,
  receive jsonb DEFAULT '[]'::jsonb,
  p_trade_method text DEFAULT NULL::text,
  p_cash_amount numeric DEFAULT NULL::numeric,
  p_cash_payer text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_meetup_location jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me            uuid   := auth.uid();
  new_trade_id  bigint;
  give_count    int    := coalesce(jsonb_array_length(give),    0);
  receive_count int    := coalesce(jsonb_array_length(receive), 0);
  bad_id        bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF counterparty IS NULL THEN RAISE EXCEPTION 'counterparty is required'; END IF;
  IF counterparty = me    THEN RAISE EXCEPTION 'cannot trade with yourself'; END IF;
  IF give_count = 0 AND receive_count = 0 THEN
    RAISE EXCEPTION 'trade must include at least one card on either side';
  END IF;
  IF p_cash_amount IS NOT NULL AND p_cash_payer IS NULL THEN
    RAISE EXCEPTION 'cash_payer is required when cash_amount is set';
  END IF;

  IF give_count > 0 THEN
    SELECT (item->>'card_id')::bigint INTO bad_id
    FROM jsonb_array_elements(give) AS item
    WHERE NOT EXISTS (
      SELECT 1 FROM public."Card" c
      WHERE c.id = (item->>'card_id')::bigint
        AND c.trader = me
        AND c.status NOT IN ('locked','traded')
    ) LIMIT 1;
    IF bad_id IS NOT NULL THEN
      RAISE EXCEPTION 'card % is locked or not yours to trade', bad_id;
    END IF;
  END IF;

  IF receive_count > 0 THEN
    SELECT (item->>'card_id')::bigint INTO bad_id
    FROM jsonb_array_elements(receive) AS item
    WHERE NOT EXISTS (
      SELECT 1 FROM public."Card" c
      WHERE c.id = (item->>'card_id')::bigint
        AND c.trader = counterparty
        AND c.wish   = false
        AND c.status NOT IN ('locked','traded')
    ) LIMIT 1;
    IF bad_id IS NOT NULL THEN
      RAISE EXCEPTION 'card % is locked or not available from counterparty', bad_id;
    END IF;
  END IF;

  INSERT INTO public."Trade" (status, user1, user2, trade_method, cash_amount, cash_payer, notes, meetup_location)
  VALUES ('pending', me, counterparty, p_trade_method, p_cash_amount, p_cash_payer, p_notes, p_meetup_location)
  RETURNING id INTO new_trade_id;

  IF give_count > 0 THEN
    INSERT INTO public.trade_card (trade, card, quantity)
    SELECT new_trade_id, (item->>'card_id')::bigint,
           COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
    FROM jsonb_array_elements(give) AS item;
  END IF;

  IF receive_count > 0 THEN
    INSERT INTO public.trade_card (trade, card, quantity)
    SELECT new_trade_id, (item->>'card_id')::bigint,
           COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
    FROM jsonb_array_elements(receive) AS item;
  END IF;

  RETURN new_trade_id;
END;
$function$;

-- ── update_trade_proposal ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_trade_proposal(
  p_trade_id bigint,
  give jsonb DEFAULT '[]'::jsonb,
  receive jsonb DEFAULT '[]'::jsonb,
  p_trade_method text DEFAULT NULL::text,
  p_cash_amount numeric DEFAULT NULL::numeric,
  p_cash_payer text DEFAULT NULL::text,
  p_notes text DEFAULT NULL::text,
  p_meetup_location jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me         uuid := auth.uid();
  t          RECORD;
  give_count int  := coalesce(jsonb_array_length(give),    0);
  recv_count int  := coalesce(jsonb_array_length(receive), 0);
  bad_id     bigint;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF give_count = 0 AND recv_count = 0 THEN
    RAISE EXCEPTION 'trade must include at least one card on either side';
  END IF;
  IF p_cash_amount IS NOT NULL AND p_cash_payer IS NULL THEN
    RAISE EXCEPTION 'cash_payer is required when cash_amount is set';
  END IF;

  SELECT * INTO t FROM public."Trade" WHERE id = p_trade_id;
  IF NOT FOUND         THEN RAISE EXCEPTION 'trade not found'; END IF;
  IF t.user1 <> me     THEN RAISE EXCEPTION 'only the proposer can edit a pending proposal'; END IF;
  IF t.status <> 'pending' THEN RAISE EXCEPTION 'only pending proposals can be edited'; END IF;

  DELETE FROM public.trade_card WHERE trade = p_trade_id;

  IF give_count > 0 THEN
    SELECT (item->>'card_id')::bigint INTO bad_id
    FROM jsonb_array_elements(give) AS item
    WHERE NOT EXISTS (
      SELECT 1 FROM public."Card" c
      WHERE c.id = (item->>'card_id')::bigint
        AND c.trader = me
        AND c.status NOT IN ('locked','traded')
    ) LIMIT 1;
    IF bad_id IS NOT NULL THEN
      RAISE EXCEPTION 'card % is locked or not yours to trade', bad_id;
    END IF;
  END IF;

  IF recv_count > 0 THEN
    SELECT (item->>'card_id')::bigint INTO bad_id
    FROM jsonb_array_elements(receive) AS item
    WHERE NOT EXISTS (
      SELECT 1 FROM public."Card" c
      WHERE c.id = (item->>'card_id')::bigint
        AND c.trader = t.user2
        AND c.wish   = false
        AND c.status NOT IN ('locked','traded')
    ) LIMIT 1;
    IF bad_id IS NOT NULL THEN
      RAISE EXCEPTION 'card % is locked or not available from counterparty', bad_id;
    END IF;
  END IF;

  IF give_count > 0 THEN
    INSERT INTO public.trade_card (trade, card, quantity)
    SELECT p_trade_id, (item->>'card_id')::bigint,
           COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
    FROM jsonb_array_elements(give) AS item;
  END IF;

  IF recv_count > 0 THEN
    INSERT INTO public.trade_card (trade, card, quantity)
    SELECT p_trade_id, (item->>'card_id')::bigint,
           COALESCE(NULLIF(item->>'quantity','')::numeric, 1)
    FROM jsonb_array_elements(receive) AS item;
  END IF;

  UPDATE public."Trade"
  SET trade_method    = p_trade_method,
      cash_amount     = p_cash_amount,
      cash_payer      = p_cash_payer,
      notes           = p_notes,
      meetup_location = p_meetup_location
  WHERE id = p_trade_id;
END;
$function$;

-- ── counter_trade_proposal ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.counter_trade_proposal(
  p_original_id bigint,
  give jsonb,
  receive jsonb,
  p_trade_method text DEFAULT NULL::text,
  p_cash_amount numeric DEFAULT NULL::numeric,
  p_cash_payer text DEFAULT NULL::text,
  p_meetup_location jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_trade  "Trade"%ROWTYPE;
  v_new_id bigint;
BEGIN
  SELECT * INTO v_trade FROM "Trade" WHERE id = p_original_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade % not found', p_original_id;
  END IF;

  IF v_trade.user2 IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not authorised to counter this proposal';
  END IF;

  IF v_trade.status <> 'pending' THEN
    RAISE EXCEPTION 'Can only counter a pending proposal';
  END IF;

  UPDATE "Trade" SET status = 'cancelled' WHERE id = p_original_id;
  DELETE FROM "Trade" WHERE id = p_original_id;

  v_new_id := create_trade_proposal(
    v_trade.user1,
    give,
    receive,
    p_trade_method,
    p_cash_amount,
    p_cash_payer,
    NULL,
    p_meetup_location
  );

  RETURN v_new_id;
END;
$function$;

-- ── fetch_my_proposals ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fetch_my_proposals()
 RETURNS TABLE(id bigint, status text, created_at timestamp with time zone, counterparty_id uuid, counterparty_name text, counterparty_avatar_url text, i_am_proposer boolean, i_give jsonb, i_receive jsonb, trade_method text, cash_amount numeric, cash_payer text, notes text, meetup_location jsonb, i_confirmed boolean, they_confirmed boolean, decline_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  RETURN QUERY
  SELECT
    t.id, t.status, t.created_at,
    CASE WHEN t.user1 = me THEN t.user2    ELSE t.user1    END,
    CASE WHEN t.user1 = me THEN tr2."Name" ELSE tr1."Name" END,
    CASE WHEN t.user1 = me THEN tr2.avatar_url ELSE tr1.avatar_url END,
    (t.user1 = me),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'image_id', c.image_id,
        'extension', c.extension, 'condition', c.condition,
        'language', c.language, 'quantity', tc.quantity, 'rarity', c.rarity))
      FROM trade_card tc JOIN "Card" c ON c.id = tc.card
      WHERE tc.trade = t.id AND c.trader = me
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'image_id', c.image_id,
        'extension', c.extension, 'condition', c.condition,
        'language', c.language, 'quantity', tc.quantity, 'rarity', c.rarity))
      FROM trade_card tc JOIN "Card" c ON c.id = tc.card
      WHERE tc.trade = t.id AND c.trader != me
    ), '[]'::jsonb),
    t.trade_method, t.cash_amount, t.cash_payer, t.notes, t.meetup_location,
    CASE WHEN t.user1 = me THEN t.user1_confirmed ELSE t.user2_confirmed END,
    CASE WHEN t.user1 = me THEN t.user2_confirmed ELSE t.user1_confirmed END,
    t.decline_reason
  FROM "Trade" t
  JOIN "Trader" tr1 ON tr1.id = t.user1
  JOIN "Trader" tr2 ON tr2.id = t.user2
  WHERE t.user1 = me OR t.user2 = me
  ORDER BY t.created_at DESC NULLS LAST;
END;
$function$;

-- Re-grant EXECUTE (dropped functions lose their grants).
GRANT EXECUTE ON FUNCTION public.create_trade_proposal(uuid, jsonb, jsonb, text, numeric, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_trade_proposal(bigint, jsonb, jsonb, text, numeric, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.counter_trade_proposal(bigint, jsonb, jsonb, text, numeric, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_my_proposals() TO authenticated;

NOTIFY pgrst, 'reload schema';
