-- Find what is near you, among the places that proved they are real.
--
-- Geographic discovery is the reason a shop pays. A badge is decoration; being
-- the result a collector gets when they ask "who is near me" is a customer
-- walking in. So both of these functions filter to verified and nothing else.
--
-- That is a deliberate choice with a cost: 4450 seeded shops sit in this table
-- and none of them will appear here until somebody claims and verifies them.
-- The empty answer is handled in the UI, which offers the unclaimed shops
-- nearby and asks whether one of them is yours.
--
-- No PostGIS on this project, and adding it for two queries would be a large
-- dependency for a small need. A bounding box on the indexed columns does the
-- cheap exclusion, then haversine does the exact distance on what survives.
-- At the scale this runs at, that is the whole story.

CREATE INDEX IF NOT EXISTS community_lat_lng
  ON community (lat, lng)
  WHERE lat IS NOT NULL AND lng IS NOT NULL;

-- Great-circle distance in kilometres. IMMUTABLE so the planner may fold it,
-- STRICT so a null coordinate answers null rather than NaN.
CREATE OR REPLACE FUNCTION km_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
) RETURNS double precision
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT 6371 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Verified communities within p_km, nearest first.
--
-- SECURITY INVOKER: this reads the same rows the caller could read anyway, and
-- running it as the definer would quietly hand out draft and hidden rows that
-- RLS exists to keep private.
CREATE OR REPLACE FUNCTION communities_near(
  p_lat double precision,
  p_lng double precision,
  p_km  double precision DEFAULT 50,
  p_limit integer DEFAULT 24
) RETURNS TABLE (
  id bigint, slug text, name text, kind text, kinds text[],
  city text, country text, avatar_url text, banner_url text,
  remote_duel boolean, verified boolean, follower_count integer,
  lat double precision, lng double precision, km double precision
)
LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT c.id, c.slug, c.name, c.kind, c.kinds,
         c.city, c.country, c.avatar_url, c.banner_url,
         c.remote_duel, c.verified, c.follower_count,
         c.lat, c.lng,
         km_between(p_lat, p_lng, c.lat, c.lng) AS km
  FROM community c
  WHERE c.verified
    AND c.status = 'published'
    AND c.lat IS NOT NULL AND c.lng IS NOT NULL
    -- Bounding box first, on the index. A degree of latitude is ~111km
    -- everywhere; a degree of longitude shrinks with the cosine, and the guard
    -- keeps it from blowing up at the poles where nobody sells cards anyway.
    AND c.lat BETWEEN p_lat - (p_km / 111.0) AND p_lat + (p_km / 111.0)
    AND c.lng BETWEEN p_lng - (p_km / greatest(111.0 * cos(radians(p_lat)), 1.0))
                  AND p_lng + (p_km / greatest(111.0 * cos(radians(p_lat)), 1.0))
    AND km_between(p_lat, p_lng, c.lat, c.lng) <= p_km
  ORDER BY km, c.name
  LIMIT least(greatest(p_limit, 1), 100);
$$;

-- Upcoming events at verified communities within p_km, soonest first.
--
-- Online events stay in. They have no coordinates of their own, but the shop
-- running one does, and a local collector cares that their local store is
-- hosting it. is_online comes back so the UI can say so rather than implying a
-- street address.
--
-- Verified is checked on the community rather than trusted from the event,
-- because an event outlives the subscription that allowed it: creating one is
-- gated on c.verified, but a community that lapses keeps the events it already
-- made. Those should stop being advertised, not disappear.
CREATE OR REPLACE FUNCTION events_near(
  p_lat double precision,
  p_lng double precision,
  p_km  double precision DEFAULT 50,
  p_limit integer DEFAULT 24
) RETURNS TABLE (
  id bigint, title text, starts_at timestamptz, ends_at timestamptz,
  community_id bigint, community_slug text, community_name text,
  community_avatar_url text, city text, country text,
  is_online boolean, location text, km double precision
)
LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT e.id, e.title, e.starts_at, e.ends_at,
         c.id, c.slug, c.name, c.avatar_url, c.city, c.country,
         e.is_online, e.location,
         km_between(p_lat, p_lng, c.lat, c.lng) AS km
  FROM community_event e
  JOIN community c ON c.id = e.community
  WHERE c.verified
    AND c.status = 'published'
    -- Hidden events are hidden here too. An owner who took one down did not
    -- mean "except from the map".
    AND e.status = 'published'
    AND c.lat IS NOT NULL AND c.lng IS NOT NULL
    AND e.starts_at >= now()
    AND c.lat BETWEEN p_lat - (p_km / 111.0) AND p_lat + (p_km / 111.0)
    AND c.lng BETWEEN p_lng - (p_km / greatest(111.0 * cos(radians(p_lat)), 1.0))
                  AND p_lng + (p_km / greatest(111.0 * cos(radians(p_lat)), 1.0))
    AND km_between(p_lat, p_lng, c.lat, c.lng) <= p_km
  ORDER BY e.starts_at, km
  LIMIT least(greatest(p_limit, 1), 100);
$$;

-- The answer to an empty near-me. Unclaimed seeded shops in the same radius,
-- so "nothing near you" can offer "is one of these yours?" instead of a dead
-- end. Owned-but-unverified rows are excluded: somebody already runs those and
-- inviting a stranger to claim them would be the wrong ask.
CREATE OR REPLACE FUNCTION unclaimed_near(
  p_lat double precision,
  p_lng double precision,
  p_km  double precision DEFAULT 50,
  p_limit integer DEFAULT 6
) RETURNS TABLE (
  id bigint, slug text, name text, kind text, kinds text[],
  city text, country text, avatar_url text, km double precision
)
LANGUAGE sql STABLE SECURITY INVOKER PARALLEL SAFE AS $$
  SELECT c.id, c.slug, c.name, c.kind, c.kinds, c.city, c.country, c.avatar_url,
         km_between(p_lat, p_lng, c.lat, c.lng) AS km
  FROM community c
  WHERE c.owner IS NULL
    AND c.status = 'published'
    AND c.lat IS NOT NULL AND c.lng IS NOT NULL
    AND c.lat BETWEEN p_lat - (p_km / 111.0) AND p_lat + (p_km / 111.0)
    AND c.lng BETWEEN p_lng - (p_km / greatest(111.0 * cos(radians(p_lat)), 1.0))
                  AND p_lng + (p_km / greatest(111.0 * cos(radians(p_lat)), 1.0))
    AND km_between(p_lat, p_lng, c.lat, c.lng) <= p_km
  ORDER BY km
  LIMIT least(greatest(p_limit, 1), 24);
$$;

GRANT EXECUTE ON FUNCTION km_between(double precision, double precision, double precision, double precision) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION communities_near(double precision, double precision, double precision, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION events_near(double precision, double precision, double precision, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION unclaimed_near(double precision, double precision, double precision, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
