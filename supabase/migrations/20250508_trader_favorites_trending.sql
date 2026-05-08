-- ============================================================
-- Trader Favourites + Trending Cards
-- ============================================================

-- 1. Favourite traders table
CREATE TABLE IF NOT EXISTS trader_favorite (
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  favorite_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, favorite_user_id)
);

ALTER TABLE trader_favorite ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own favorites"
  ON trader_favorite FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_trader_favorite_user ON trader_favorite(user_id);

-- 2. Trending cards RPC
-- Returns the cards most frequently appearing in recent trade proposals.
CREATE OR REPLACE FUNCTION get_trending_cards(p_limit int DEFAULT 8)
RETURNS TABLE(
  image_id    int,
  name        text,
  extension   text,
  trade_count bigint
)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    c.image_id,
    c.name,
    c.extension,
    COUNT(DISTINCT tc.trade) AS trade_count
  FROM   trade_card tc
  JOIN   "Card"  c ON c.id  = tc.card
  JOIN   "Trade" t ON t.id  = tc.trade
  WHERE  t.created_at > now() - interval '30 days'
    AND  t.status NOT IN ('cancelled', 'declined')
    AND  c.image_id IS NOT NULL
  GROUP  BY c.image_id, c.name, c.extension
  ORDER  BY trade_count DESC
  LIMIT  p_limit;
$$;
