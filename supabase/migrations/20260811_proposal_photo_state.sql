-- Who still owes a photo.
--
-- The proposals list could not see verification photos at all, so its pending
-- message was hardcoded: the proposer was always told "waiting for them to
-- upload photos and accept", including when the proposer was the one who had
-- not uploaded. Both sides could sit waiting for each other.
--
-- Two booleans fix it at the source. The list can now say which of the three
-- things is actually true: you owe a photo, they owe a photo, or both are in
-- and it is with the recipient to accept.
--
-- Dropped and recreated rather than replaced: CREATE OR REPLACE cannot change
-- a function's return type, and this adds two columns to the table it returns.

DROP FUNCTION IF EXISTS public.fetch_my_proposals();

CREATE FUNCTION public.fetch_my_proposals()
RETURNS TABLE(
  id bigint, status text, created_at timestamptz,
  counterparty_id uuid, counterparty_name text, counterparty_avatar_url text,
  i_am_proposer boolean, i_give jsonb, i_receive jsonb,
  trade_method text, cash_amount numeric, cash_payer text, notes text,
  meetup_location jsonb,
  i_confirmed boolean, they_confirmed boolean, decline_reason text,
  i_uploaded boolean, they_uploaded boolean
)
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
    t.decline_reason,
    -- EXISTS rather than a count: the question is only ever "any?", and this
    -- stops at the first row instead of walking every photo on the trade.
    EXISTS (SELECT 1 FROM trade_photo p WHERE p.trade = t.id AND p.uploader = me),
    EXISTS (SELECT 1 FROM trade_photo p WHERE p.trade = t.id AND p.uploader != me)
  FROM "Trade" t
  JOIN "Trader" tr1 ON tr1.id = t.user1
  JOIN "Trader" tr2 ON tr2.id = t.user2
  WHERE t.user1 = me OR t.user2 = me
  ORDER BY t.created_at DESC NULLS LAST;
END;
$function$;

-- Covers both EXISTS above.
CREATE INDEX IF NOT EXISTS trade_photo_trade_uploader ON public.trade_photo (trade, uploader);

GRANT EXECUTE ON FUNCTION public.fetch_my_proposals() TO authenticated;
