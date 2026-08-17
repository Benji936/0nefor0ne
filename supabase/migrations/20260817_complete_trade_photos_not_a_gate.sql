-- complete_trade: stop refusing completion when a verification photo is missing.
--
-- The check did more than refuse. It ran AFTER the function had recorded the
-- caller's confirmation, and a RAISE in plpgsql rolls the whole call back — so
-- the second person to confirm never got their confirmation written at all.
-- Two people could take turns clicking "Confirm your side" forever: the first
-- confirmation stuck, the second one raised and undid itself, and the trade
-- could never reach 'completed'. That is a deadlock, not a validation.
--
-- Photos stopped being a gate on the Accept button some time ago (see
-- frontend/src/lib/tradePending.js) for the reason that applies here with more
-- force: by the time somebody is confirming, the cards have already changed
-- hands in person. Refusing to record that does not un-trade them, it just
-- leaves the app disagreeing with reality — and it is the honest half of the
-- users who stop. The photos are still uploaded, still shown, and still the
-- only record of what was promised; they are simply advice now.
--
-- WARNING: CREATE OR REPLACE swaps the whole body. This body was taken from
-- pg_proc.prosrc on the live database, not from an earlier migration file, so
-- that nothing added after the last migration is silently dropped. Do the same
-- if you edit it again.
CREATE OR REPLACE FUNCTION public.complete_trade(p_trade_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  me        uuid := auth.uid();
  t         "Trade"%ROWTYPE;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT * INTO t FROM "Trade" WHERE id = p_trade_id FOR UPDATE;
  IF NOT FOUND    THEN RAISE EXCEPTION 'trade % not found', p_trade_id; END IF;
  IF t.user1 != me AND t.user2 != me THEN RAISE EXCEPTION 'not a participant of this trade'; END IF;
  IF t.status != 'accepted' THEN
    RAISE EXCEPTION 'trade must be accepted before confirming (current: %)', t.status;
  END IF;

  -- Record this user's confirmation
  IF me = t.user1 THEN
    UPDATE "Trade" SET user1_confirmed = true WHERE id = p_trade_id;
  ELSE
    UPDATE "Trade" SET user2_confirmed = true WHERE id = p_trade_id;
  END IF;

  -- Re-read with fresh flags
  SELECT * INTO t FROM "Trade" WHERE id = p_trade_id;

  -- Not both confirmed yet → early return
  IF NOT (t.user1_confirmed AND t.user2_confirmed) THEN
    RETURN jsonb_build_object('status', 'confirmed');
  END IF;

  -- Both confirmed. Nothing else is checked: from here on the only thing that
  -- can stop the settlement is a real error, and everything below is
  -- bookkeeping that has to happen in the same transaction as the status flip.

  -- ── 1. Reduce trade-pile quantities ──
  UPDATE "Card" c
  SET
    quantity = GREATEST(0, c.quantity - tc.quantity::numeric),
    status   = CASE
                 WHEN c.quantity - tc.quantity::numeric <= 0 THEN 'traded'
                 ELSE 'available'
               END
  FROM trade_card tc
  WHERE tc.trade = p_trade_id AND tc.card = c.id;

  -- ── 2. Reduce user2 wishlist ──
  WITH received AS (
    SELECT given.name, SUM(tc.quantity::numeric) AS qty
    FROM trade_card tc JOIN "Card" given ON given.id = tc.card
    WHERE tc.trade = p_trade_id AND given.trader = t.user1
    GROUP BY given.name
  ),
  updated AS (
    UPDATE "Card" w SET quantity = GREATEST(0, w.quantity - r.qty)
    FROM received r
    WHERE w.trader = t.user2 AND w.wish = true AND w.name = r.name
    RETURNING w.id, w.quantity
  )
  DELETE FROM "Card" WHERE id IN (SELECT id FROM updated WHERE quantity <= 0);

  -- ── 3. Reduce user1 wishlist ──
  WITH received AS (
    SELECT given.name, SUM(tc.quantity::numeric) AS qty
    FROM trade_card tc JOIN "Card" given ON given.id = tc.card
    WHERE tc.trade = p_trade_id AND given.trader = t.user2
    GROUP BY given.name
  ),
  updated AS (
    UPDATE "Card" w SET quantity = GREATEST(0, w.quantity - r.qty)
    FROM received r
    WHERE w.trader = t.user1 AND w.wish = true AND w.name = r.name
    RETURNING w.id, w.quantity
  )
  DELETE FROM "Card" WHERE id IN (SELECT id FROM updated WHERE quantity <= 0);

  -- ── 4. Mark completed ──
  UPDATE "Trade" SET status = 'completed' WHERE id = p_trade_id;

  RETURN jsonb_build_object('status', 'completed');
END;
$function$;
