-- Link announces to YGOPRODeck cards
-- ygo_card_id: the YGOPRODeck numeric passcode (same as Card.image_id)
-- card_name:   denormalized card name for display without hitting the API
-- Both nullable — existing announces are unaffected.

ALTER TABLE announce
  ADD COLUMN IF NOT EXISTS ygo_card_id bigint NULL,
  ADD COLUMN IF NOT EXISTS card_name   text   NULL;

-- Index for fast "show all announces for this card" queries
CREATE INDEX IF NOT EXISTS idx_announce_ygo_card_id
  ON announce (ygo_card_id)
  WHERE ygo_card_id IS NOT NULL;
