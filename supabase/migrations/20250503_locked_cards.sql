-- ============================================================
-- Locked card copies for accepted trades
--
-- When a trade is accepted, this migration creates "locked"
-- Card rows (one per trade_item) that are read-only in the UI.
-- They disappear automatically when the trade is completed,
-- cancelled, or declined.
-- ============================================================

-- 1. Extend the Card table
ALTER TABLE "Card"
  ADD COLUMN IF NOT EXISTS locked_by_trade      bigint REFERENCES "Trade"(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS locked_original_card_id bigint REFERENCES "Card"(id)  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_card_locked_by_trade
  ON "Card"(locked_by_trade)
  WHERE locked_by_trade IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_card_locked_original
  ON "Card"(locked_original_card_id)
  WHERE locked_original_card_id IS NOT NULL;


-- 2. Trigger: acceptance → create locked copies for every trade_item
CREATE OR REPLACE FUNCTION create_locked_copies_on_accept()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only fires when Trade status transitions INTO 'accepted'
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    INSERT INTO "Card" (
      trader,
      name,
      image_id,
      extension,
      condition,
      language,
      quantity,
      first_edition,
      rarity,
      wish,
      status,
      locked_by_trade,
      locked_original_card_id
    )
    SELECT
      c.trader,
      c.name,
      c.image_id,
      c.extension,
      c.condition,
      c.language,
      ti.quantity,
      c.first_edition,
      c.rarity,
      false,                 -- never a wishlist card
      'locked',
      NEW.id,
      c.id
    FROM trade_item ti
    JOIN "Card" c ON c.id = ti.card
    WHERE ti.trade = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_locked_copies ON "Trade";
CREATE TRIGGER trg_create_locked_copies
  AFTER UPDATE ON "Trade"
  FOR EACH ROW
  EXECUTE FUNCTION create_locked_copies_on_accept();


-- 3. Trigger: completed / cancelled / declined → delete locked copies
CREATE OR REPLACE FUNCTION delete_locked_copies_on_close()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled', 'declined')
     AND OLD.status NOT IN ('completed', 'cancelled', 'declined')
  THEN
    DELETE FROM "Card" WHERE locked_by_trade = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delete_locked_copies ON "Trade";
CREATE TRIGGER trg_delete_locked_copies
  AFTER UPDATE ON "Trade"
  FOR EACH ROW
  EXECUTE FUNCTION delete_locked_copies_on_close();
