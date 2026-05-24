-- ═══════════════════════════════════════════════════════════════════════════════
-- Security hardening: RLS on Trade, trade_message, trade_photo
-- + safe accept_trade RPC to replace direct table update
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Trade table RLS ────────────────────────────────────────────────────────

ALTER TABLE "Trade" ENABLE ROW LEVEL SECURITY;

-- Only participants can read their own trades
CREATE POLICY "trade_select_participant"
  ON "Trade" FOR SELECT
  USING (user1 = auth.uid() OR user2 = auth.uid());

-- Only participants can update their own trades
-- (Fine-grained action control is enforced by the RPCs; this is the safety net)
CREATE POLICY "trade_update_participant"
  ON "Trade" FOR UPDATE
  USING (user1 = auth.uid() OR user2 = auth.uid());

-- ── 2. accept_trade RPC ───────────────────────────────────────────────────────
-- Replaces the raw updateProposalStatus("accepted") call.
-- Enforces: caller must be user2 (counterparty) and trade must be pending.

CREATE OR REPLACE FUNCTION accept_trade(p_trade_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user1 uuid;
  v_user2 uuid;
  v_status text;
BEGIN
  SELECT user1, user2, status
  INTO   v_user1, v_user2, v_status
  FROM   "Trade"
  WHERE  id = p_trade_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trade not found';
  END IF;

  -- Only the counterparty (user2) may accept
  IF auth.uid() != v_user2 THEN
    RAISE EXCEPTION 'Only the counterparty may accept this trade';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Trade is not pending (current status: %)', v_status;
  END IF;

  UPDATE "Trade" SET status = 'accepted' WHERE id = p_trade_id;
END;
$$;

-- ── 3. trade_message RLS ──────────────────────────────────────────────────────

ALTER TABLE trade_message ENABLE ROW LEVEL SECURITY;

-- Participants can read messages in their trades
CREATE POLICY "trade_message_select_participant"
  ON trade_message FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Trade" t
      WHERE  t.id = trade_message.trade
        AND  (t.user1 = auth.uid() OR t.user2 = auth.uid())
    )
  );

-- Participants can send messages; sender must be the authenticated user
CREATE POLICY "trade_message_insert_participant"
  ON trade_message FOR INSERT
  WITH CHECK (
    sender = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "Trade" t
      WHERE  t.id = trade
        AND  (t.user1 = auth.uid() OR t.user2 = auth.uid())
    )
  );

-- ── 4. trade_photo RLS ────────────────────────────────────────────────────────

ALTER TABLE trade_photo ENABLE ROW LEVEL SECURITY;

-- Participants can view photos for their trades
CREATE POLICY "trade_photo_select_participant"
  ON trade_photo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "Trade" t
      WHERE  t.id = trade_photo.trade
        AND  (t.user1 = auth.uid() OR t.user2 = auth.uid())
    )
  );

-- Participants can upload photos; uploader must be the authenticated user
CREATE POLICY "trade_photo_insert_participant"
  ON trade_photo FOR INSERT
  WITH CHECK (
    uploader = auth.uid()
    AND EXISTS (
      SELECT 1 FROM "Trade" t
      WHERE  t.id = trade
        AND  (t.user1 = auth.uid() OR t.user2 = auth.uid())
    )
  );
