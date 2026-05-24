-- Update get_trending_cards to rank by combined activity:
-- trade pile listings + wishlist additions + recent trade appearances (weighted 3×)
CREATE OR REPLACE FUNCTION get_trending_cards(p_limit int DEFAULT 8)
RETURNS TABLE(
  image_id    int,
  name        text,
  extension   text,
  trade_count bigint   -- composite activity score (backward-compat column name)
)
LANGUAGE sql SECURITY DEFINER AS $$
  WITH
  -- Cards actively listed in trade piles
  pile_counts AS (
    SELECT image_id, name, extension,
           COUNT(DISTINCT trader) AS cnt
    FROM   "Card"
    WHERE  wish = false
      AND  status NOT IN ('traded', 'locked')
      AND  image_id IS NOT NULL
    GROUP  BY image_id, name, extension
  ),
  -- Cards added to wishlists
  wish_counts AS (
    SELECT image_id, name, extension,
           COUNT(DISTINCT trader) AS cnt
    FROM   "Card"
    WHERE  wish = true
      AND  image_id IS NOT NULL
    GROUP  BY image_id, name, extension
  ),
  -- Cards that appeared in recent non-cancelled trades (weighted higher)
  trade_counts AS (
    SELECT c.image_id, c.name, c.extension,
           COUNT(DISTINCT tc.trade) AS cnt
    FROM   trade_card tc
    JOIN   "Card"  c ON c.id = tc.card
    JOIN   "Trade" t ON t.id = tc.trade
    WHERE  t.created_at > now() - interval '30 days'
      AND  t.status NOT IN ('cancelled', 'declined')
      AND  c.image_id IS NOT NULL
    GROUP  BY c.image_id, c.name, c.extension
  ),
  all_cards AS (
    SELECT image_id, name, extension FROM pile_counts
    UNION
    SELECT image_id, name, extension FROM wish_counts
    UNION
    SELECT image_id, name, extension FROM trade_counts
  )
  SELECT
    a.image_id,
    a.name,
    a.extension,
    COALESCE(p.cnt, 0)
      + COALESCE(w.cnt, 0)
      + COALESCE(t.cnt, 0) * 3   AS trade_count
  FROM   all_cards a
  LEFT   JOIN pile_counts  p USING (image_id, name, extension)
  LEFT   JOIN wish_counts  w USING (image_id, name, extension)
  LEFT   JOIN trade_counts t USING (image_id, name, extension)
  ORDER  BY trade_count DESC
  LIMIT  p_limit;
$$;
